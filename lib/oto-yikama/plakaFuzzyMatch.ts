import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Plaka fuzzy match — hem /api/app/oto-yikama/plaka-eslestir hem
 * /api/app/oto-yikama/plaka-ocr aynı mantığı kullanır.
 *
 * Verilen okunan plaka string'ini firmaya ait araçlarla Levenshtein
 * mesafesi üzerinden karşılaştırır.
 *   • fark = 0 → kesin eşleşme
 *   • 1 ≤ fark ≤ 2 → aday listesi (max 5, fark ASC)
 *   • fark > 2 → boş döner
 */

export type PlakaAday = {
  id: string
  plaka: string
  departman: string | null
  kullanici_adi_soyadi: string | null
  fark: number
}

export function normalizePlaka(s: string): string {
  return String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Iterative Levenshtein — küçük string'ler için yeterince hızlı */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const m = a.length, n = b.length
  const prev = new Array(n + 1)
  const curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      )
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
}

/**
 * Firma'ya ait aktif araçlardan okunan plakayla eşleştirme yapar.
 *
 * Kesin eşleşme (fark=0): HER ZAMAN firma geneli — lokasyon filtresi uygulanmaz.
 * Neden: bir aracın varsayilan_lokasyon_id'si başka bir istasyon olabilir; plaka
 * hangi istasyonda okunursa okunsun DB'de kayıtlıysa "kayıtlı" sayılmalı, tanımsız
 * akışa düşmemelidir. Kullanıcı kuralı (2026-07-09): "Plaka okunur db kayıt sorgusu
 * yapılır ve kayıtlı değilse ekstra yazılır, kayıtlı ise zaten normal yıkama
 * davranışı gerçekleşir." Eski davranış: lokasyon filtresi hem kesin hem fuzzy
 * icin uygulaniyordu — kayitli plaka farkli istasyona atanmissa fuzzy match'te
 * bulunmuyordu ve mobil "tanimsiz plaka" akisina yonelmis oluyordu.
 *
 * Fuzzy adaylar (fark 1-2): lokasyon_id verilirse o üst lokasyonun alt istasyonlarına
 * atanmış araçlarla sınırlandırılır (false-positive azaltmak için — mesela 16BSA669
 * ile 16BSA659 karışması riski yakın istasyonlardan gelenlere odaklansın).
 * lokasyon_id yoksa firma geneli.
 */
export async function plakaFuzzyMatch(
  admin: SupabaseClient,
  firma_id: string,
  okunan_plaka: string,
  lokasyon_id?: string,
): Promise<{ kesin: PlakaAday | null; adaylar: PlakaAday[] }> {
  const okunanNorm = normalizePlaka(okunan_plaka)
  if (!okunanNorm) return { kesin: null, adaylar: [] }

  // 1) KESİN EŞLEŞME — firma geneli, lokasyon filtresi YOK
  const { data: kesinRow } = await admin
    .from('araclar')
    .select('id, plaka, departman, kullanici_adi_soyadi')
    .eq('firma_id', firma_id)
    .eq('aktif', true)
    .eq('plaka', okunanNorm)
    .maybeSingle()
  if (kesinRow) {
    return {
      kesin: {
        id: (kesinRow as any).id,
        plaka: (kesinRow as any).plaka,
        departman: (kesinRow as any).departman,
        kullanici_adi_soyadi: (kesinRow as any).kullanici_adi_soyadi,
        fark: 0,
      },
      adaylar: [],
    }
  }

  // 2) FUZZY ADAYLAR — lokasyon_id verildiyse o üst lokasyonun altına scope'la
  let query = admin
    .from('araclar')
    .select('id, plaka, departman, kullanici_adi_soyadi')
    .eq('firma_id', firma_id)
    .eq('aktif', true)

  if (lokasyon_id) {
    const { data: altLoks } = await admin
      .from('lokasyonlar')
      .select('id')
      .eq('parent_id', lokasyon_id)
    const altIds = (altLoks ?? []).map((l: any) => l.id)
    if (altIds.length > 0) {
      query = (query as any).in('varsayilan_lokasyon_id', altIds)
    }
  }

  const { data: araclar } = await query
  if (!araclar || araclar.length === 0) {
    return { kesin: null, adaylar: [] }
  }

  const adaylar = (araclar as any[])
    .map(a => ({
      id: a.id, plaka: a.plaka,
      departman: a.departman, kullanici_adi_soyadi: a.kullanici_adi_soyadi,
      fark: levenshtein(okunanNorm, normalizePlaka(a.plaka)),
    }))
    .filter(a => a.fark > 0 && a.fark <= 2)
    .sort((a, b) => a.fark - b.fark)
    .slice(0, 5)

  return { kesin: null, adaylar }
}
