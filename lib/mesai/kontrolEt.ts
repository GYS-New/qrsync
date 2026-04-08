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

  // 2. Proje bazlı personel takibi kontrolü (firma ayarı karışmaz)
  if (!user.proje_id) return null // proje yoksa mesai kontrolü yapılmaz

  const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', user.proje_id).single()
  if (!proje || proje.personel_takibi_aktif !== true) return null

  // 3. Bugün açık mesai kaydı var mı? (TRT tarihi)
  const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: mesai } = await admin
    .from('personel_mesai_kayitlari')
    .select('id')
    .eq('user_id', userId)
    .eq('kayit_tarihi', bugun)
    .is('cikis_saati', null)
    .maybeSingle()

  if (!mesai) {
    return { ok: false, error: 'Lütfen önce iş başı QR/NFC kodunu okutunuz.', code: 'MESAI_YOK', status: 403 }
  }

  return null
}
