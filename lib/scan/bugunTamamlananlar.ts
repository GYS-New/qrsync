import type { SupabaseClient } from '@supabase/supabase-js'

/** Türkiye saatiyle bugünün UTC başlangıç ISO string'i (UTC+3) */
export function bugunTRISO(): string {
  const now = new Date()
  const trNow = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  trNow.setUTCHours(0, 0, 0, 0)
  return new Date(trNow.getTime() - 3 * 60 * 60 * 1000).toISOString()
}

/**
 * O lokasyonda bugün tamamlanmış KURAL-ÜRETİMLİ (kural_id NOT NULL) görevlerin
 * tanımları + adetleri. Mobil ekstra-frekansiyel modal'ının dropdown'unu besler.
 * canli_gorevler + arşiv birleşik taranır, tanım bazında distinct + adet sıralı.
 *
 * Dönüş: [{ tanim: 'WC Temizliği', adet: 9 }, ...]  (adet DESC)
 */
export async function lokasyonBugunTamamlananlar(
  supabase: SupabaseClient<any>,
  lokasyonId: string,
): Promise<{ tanim: string; adet: number }[]> {
  const baslangic = bugunTRISO()
  const [aktifRes, arsivRes] = await Promise.all([
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
  ])
  const sayac = new Map<string, number>()
  for (const r of [...(aktifRes.data ?? []), ...(arsivRes.data ?? [])]) {
    const t = (r as any)?.tanim
    if (typeof t === 'string' && t.trim()) sayac.set(t, (sayac.get(t) ?? 0) + 1)
  }
  return Array.from(sayac.entries())
    .map(([tanim, adet]) => ({ tanim, adet }))
    .sort((a, b) => b.adet - a.adet)
}
