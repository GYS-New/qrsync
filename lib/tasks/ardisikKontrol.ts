import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Ardışık başlatma süre kontrolü.
 * Kullanıcının son tamamlanan görevinden bu yana yeterli süre geçmiş mi kontrol eder.
 *
 * @returns null = başlatabilir, string = hata mesajı
 */
export async function ardisikBaslatmaKontrol(
  supabase: SupabaseClient,
  userId: string,
  firmaId: string,
  projeId?: string | null,
): Promise<string | null> {
  // Firma ayarını çek
  const { data: firma } = await supabase
    .from('firmalar')
    .select('ardisik_baslatma_suresi_dk')
    .eq('id', firmaId)
    .single()

  let sureDk = firma?.ardisik_baslatma_suresi_dk ?? 0

  // Proje override
  if (projeId) {
    const { data: proje } = await supabase
      .from('projeler')
      .select('ardisik_baslatma_suresi_dk')
      .eq('id', projeId)
      .single()
    if (proje?.ardisik_baslatma_suresi_dk != null) sureDk = proje.ardisik_baslatma_suresi_dk
  }

  // 0 = kontrol kapalı
  if (!sureDk || sureDk <= 0) return null

  const now = Date.now()
  const sinir = new Date(now - sureDk * 60 * 1000).toISOString()

  // Son tamamlanan görev: canli_gorevler + gorevler, bu kullanıcı tarafından
  const [{ data: canli }, { data: spesifik }] = await Promise.all([
    supabase
      .from('canli_gorevler')
      .select('tamamlanma_tarihi')
      .eq('tamamlayan_kullanici_id', userId)
      .eq('durum', 'TAMAMLANDI')
      .gte('tamamlanma_tarihi', sinir)
      .order('tamamlanma_tarihi', { ascending: false })
      .limit(1),
    supabase
      .from('gorevler')
      .select('tamamlanma_tarihi')
      .eq('islemi_yapan_id', userId)
      .eq('durum', 'TAMAMLANDI')
      .gte('tamamlanma_tarihi', sinir)
      .order('tamamlanma_tarihi', { ascending: false })
      .limit(1),
  ])

  // En son tamamlanan
  const tarihler = [
    ...(canli ?? []).map((r: any) => r.tamamlanma_tarihi),
    ...(spesifik ?? []).map((r: any) => r.tamamlanma_tarihi),
  ].filter(Boolean).sort().reverse()

  if (!tarihler.length) return null

  const sonTamamlanma = new Date(tarihler[0]).getTime()
  const farkMs = now - sonTamamlanma
  const gerekliMs = sureDk * 60 * 1000

  if (farkMs >= gerekliMs) return null

  // Kalan süreyi hesapla
  const kalanMs = gerekliMs - farkMs
  const kalanDk = Math.ceil(kalanMs / 60000)
  const saat = Math.floor(kalanDk / 60)
  const dk = kalanDk % 60

  const kalanStr = saat > 0 ? `${saat} saat ${dk} dakika` : `${dk} dakika`
  return `Henüz yeni görev süreniz başlamadı! Kalan süre: ${kalanStr}`
}
