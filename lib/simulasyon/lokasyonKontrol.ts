/**
 * lib/simulasyon/lokasyonKontrol.ts
 * SIM aktif lokasyon kontrolu — QR/NFC/mobil endpoint'lerde kullanilir.
 *
 * Mantik: Lokasyon, aktif bir simulasyon ayarinin bagli grubunun uyesi ise
 * personel QR/NFC ile buraya mudahale edemez. Gorevler tamamen SIM cron
 * tarafindan yonetilir.
 */

type Sonuc = { ok: false; error: string; code: string; status: number } | null

export async function simulasyonluLokasyonKontrol(admin: any, lokasyonId: string | null | undefined): Promise<Sonuc> {
  if (!lokasyonId) return null

  const { data: grupUye } = await admin
    .from('lokasyon_grup_uyeleri')
    .select('grup_id')
    .eq('lokasyon_id', lokasyonId)
  const grupIds = (grupUye ?? []).map((r: any) => r.grup_id)
  if (grupIds.length === 0) return null

  const { data: simGrup } = await admin
    .from('simulasyon_grup_ayarlari')
    .select('simulasyon_id')
    .in('grup_id', grupIds)
  const simIds = [...new Set((simGrup ?? []).map((r: any) => r.simulasyon_id))]
  if (simIds.length === 0) return null

  const { count } = await admin
    .from('simulasyon_ayarlari')
    .select('id', { count: 'exact', head: true })
    .in('id', simIds)
    .eq('aktif', true)

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      code: 'SIM_AKTIF_LOKASYON',
      error: 'Bu alan otomatik akış (simülasyon) modunda. Görevler sistem tarafından yönetiliyor, işlem yapmanıza gerek yok.',
      status: 403,
    }
  }
  return null
}
