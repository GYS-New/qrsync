import type { SupabaseClient } from '@supabase/supabase-js'

/** Türkiye saatiyle bugünün UTC başlangıç ISO string'i (UTC+3) */
export function bugunTRISO(): string {
  const now = new Date()
  const trNow = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  trNow.setUTCHours(0, 0, 0, 0)
  return new Date(trNow.getTime() - 3 * 60 * 60 * 1000).toISOString()
}

/**
 * Mobil ekstra-frekansiyel modal'ı için dropdown verisini hazırlar.
 *
 * Dönüş: {
 *   bugun_tamamlananlar: [{ tanim, adet }, ...]   — bugün (TR) o lokasyonda tamamlanmış kural-tabanlı görevler, adet DESC
 *   lokasyon_kurallari:  [{ tanim, adet: 0 }, ...] — o lokasyonun aktif frekans kuralları (adet 0)
 *
 * Mobil akışı:
 *   - Önce bugun_tamamlananlar'ı göster (tercihen; operatör daha önce hangi işleri yaptığını bilir)
 *   - Onlarda yoksa (hiç iş yapılmamış / yeni vardiya) lokasyon_kurallari'ndaki tanımları göster
 *   - İkisi birleştirilerek de sunulabilir (distinct tanım bazında)
 */
export async function lokasyonEkstraFrekansDropdown(
  supabase: SupabaseClient<any>,
  lokasyonId: string,
): Promise<{
  bugun_tamamlananlar: { tanim: string; adet: number }[]
  lokasyon_kurallari:  { tanim: string; adet: number }[]
}> {
  const baslangic = bugunTRISO()
  const [aktifRes, arsivRes, kuralRes] = await Promise.all([
    supabase.from('canli_gorevler').select('tanim')
      .eq('lokasyon_id', lokasyonId)
      .not('kural_id', 'is', null)
      .eq('durum', 'TAMAMLANDI')
      .gte('tamamlanma_tarihi', baslangic),
    supabase.from('canli_gorevler_arsiv').select('tanim')
      .eq('lokasyon_id', lokasyonId)
      .not('kural_id', 'is', null)
      .eq('durum', 'TAMAMLANDI')
      .gte('tamamlanma_tarihi', baslangic),
    supabase.from('gorev_kurallari').select('tanim')
      .eq('lokasyon_id', lokasyonId)
      .eq('aktif', true),
  ])

  // 1. Bugün tamamlananlar (adet bazında)
  const bugunSayac = new Map<string, number>()
  for (const r of [...(aktifRes.data ?? []), ...(arsivRes.data ?? [])]) {
    const t = (r as any)?.tanim
    if (typeof t === 'string' && t.trim()) bugunSayac.set(t, (bugunSayac.get(t) ?? 0) + 1)
  }
  const bugun_tamamlananlar = Array.from(bugunSayac.entries())
    .map(([tanim, adet]) => ({ tanim, adet }))
    .sort((a, b) => b.adet - a.adet)

  // 2. Lokasyonun aktif frekans kuralları (distinct tanım)
  const kuralSet = new Set<string>()
  for (const r of kuralRes.data ?? []) {
    const t = (r as any)?.tanim
    if (typeof t === 'string' && t.trim()) kuralSet.add(t.trim())
  }
  const lokasyon_kurallari = Array.from(kuralSet)
    .map(tanim => ({ tanim, adet: 0 }))
    .sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))

  return { bugun_tamamlananlar, lokasyon_kurallari }
}

/** @deprecated Yerine lokasyonEkstraFrekansDropdown kullanın. Geriye dönük uyumluluk için kalıyor. */
export async function lokasyonBugunTamamlananlar(
  supabase: SupabaseClient<any>,
  lokasyonId: string,
): Promise<{ tanim: string; adet: number }[]> {
  const { bugun_tamamlananlar } = await lokasyonEkstraFrekansDropdown(supabase, lokasyonId)
  return bugun_tamamlananlar
}
