/**
 * lib/mesai/kontrolEt.ts
 * Merkezi mesai + pasif kontrolü — TÜM QR/NFC/görev endpoint'lerinde kullanılır.
 * Admin client ile çalışır (RLS bypass).
 *
 * Kontrol mantığı:
 * - Firma seviyesi: özellik mevcuttur (her zaman true olabilir)
 * - Proje seviyesi: açık/kapalı ayarlanır → SADECE proje ayarına bakılır
 * - Kullanıcının proje_id'si yoksa mesai kontrolü yapılmaz
 */

type KontrolSonuc = { ok: false; error: string; code?: string; status: number } | null

export async function mesaiVePasifKontrol(admin: any, userId: string): Promise<KontrolSonuc> {
  // 1. Kullanıcı aktif mi?
  const { data: user } = await admin.from('users').select('aktif, firma_id, rol, proje_id').eq('id', userId).single()
  if (!user) return { ok: false, error: 'Kullanıcı bulunamadı', status: 401 }

  if (user.aktif === false) {
    return { ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF', status: 403 }
  }

  // SA/TA mesai kontrolünden muaf
  if (['super_admin', 'alt_super_admin', 'tenant_admin'].includes(user.rol)) return null

  // 2. PT aktif mi? Proje varsa proje seviyesi, yoksa firma seviyesi.
  // Onceki: sadece proje seviyesi bakiliyordu, proje_id NULL personel muaf oluyordu.
  // Bug (02.09.2026): 115 personel PT aktif projede proje_id NULL oldugu icin
  // mesai olmadan gorev yapabiliyordu. Firma-level fallback eklendi.
  let ptAktif = false
  if (user.proje_id) {
    const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', user.proje_id).single()
    ptAktif = proje?.personel_takibi_aktif === true
  }
  if (!ptAktif && user.firma_id) {
    const { data: firma } = await admin.from('firmalar').select('personel_takibi_aktif').eq('id', user.firma_id).single()
    ptAktif = firma?.personel_takibi_aktif === true
  }
  if (!ptAktif) return null

  // 3. Acik mesai kaydi var mi? (TRT bugun VEYA dun — V3 sarkan mesai destegi)
  // Onceki: sadece kayit_tarihi = bugun. V3 (23:30-07:30) personel 07:00'de
  // gorev yapmaya kalksa bugun=07.00 (V3'un bittigi gun), mesai kayit=onceki
  // gun. Sistem "MESAI_YOK" derdi. Simdi son 2 gun arasi bakilir.
  const bugun = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10)
  const dun   = new Date(Date.now() + 3 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10)
  const { data: mesai } = await admin
    .from('personel_mesai_kayitlari')
    .select('id')
    .eq('user_id', userId)
    .in('kayit_tarihi', [bugun, dun])
    .is('cikis_saati', null)
    .order('giris_saati', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!mesai) {
    return { ok: false, error: 'Lütfen önce iş başı QR/NFC kodunu okutunuz.', code: 'MESAI_YOK', status: 403 }
  }

  return null
}
