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
 * lokasyon_id verilirse fuzzy match yalnız o üst lokasyonun alt
 * istasyonlarına atanmış araçlarla yapılır (false-positive azalır).
 * lokasyon_id yoksa firma genelinde tarama yapılır.
 */
export async function plakaFuzzyMatch(
  admin: SupabaseClient,
  firma_id: string,
  okunan_plaka: string,
  lokasyon_id?: string,
): Promise<{ kesin: PlakaAday | null; adaylar: PlakaAday[] }> {
  const okunanNorm = normalizePlaka(okunan_plaka)
  if (!okunanNorm) return { kesin: null, adaylar: [] }

  let query = admin
    .from('araclar')
    .select('id, plaka, departman, kullanici_adi_soyadi')
    .eq('firma_id', firma_id)
    .eq('aktif', true)

  // lokasyon_id verildiyse o üst lokasyonun alt istasyonlarına atanmış
  // araçları getir (araclar.lokasyon_id alt istasyon id'sidir).
  if (lokasyon_id) {
    const { data: altLoks } = await admin
      .from('lokasyonlar')
      .select('id')
      .eq('parent_id', lokasyon_id)
    const altIds = (altLoks ?? []).map((l: any) => l.id)
    if (altIds.length > 0) {
      query = (query as any).in('lokasyon_id', altIds)
    }
  }

  const { data: araclar } = await query
  if (!araclar || araclar.length === 0) {
    return { kesin: null, adaylar: [] }
  }

  const kesinAday = araclar.find((a: any) => normalizePlaka(a.plaka) === okunanNorm)
  if (kesinAday) {
    return {
      kesin: {
        id: kesinAday.id, plaka: kesinAday.plaka,
        departman: kesinAday.departman,
        kullanici_adi_soyadi: kesinAday.kullanici_adi_soyadi,
        fark: 0,
      },
      adaylar: [],
    }
  }

  const adaylar = (araclar as any[])
    .map(a => ({
      id: a.id, plaka: a.plaka,
      departman: a.departman, kullanici_adi_soyadi: a.kullanici_adi_soyadi,
      fark: levenshtein(okunanNorm, normalizePlaka(a.plaka)),
    }))
    .filter(a => a.fark <= 2)
    .sort((a, b) => a.fark - b.fark)
    .slice(0, 5)

  return { kesin: null, adaylar }
}
