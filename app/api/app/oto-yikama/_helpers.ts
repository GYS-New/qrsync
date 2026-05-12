/**
 * Oto Yıkama mobil endpoint'leri için ortak yardımcılar:
 *   - CORS başlıkları
 *   - X-Device-Token → user_id + firma_id çözümleme
 *   - Firma için oto_yikama_aktif modül flag kontrolü
 */
import { createAdminClient } from '@/lib/supabase/server'

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export type DeviceUser = {
  userId: string
  firmaId: string
  isim: string | null
  projeId: string | null
}

/**
 * X-Device-Token header'ından kullanıcıyı çözer. Geçersizse null.
 * Kullanıcı pasifse yine null döner.
 */
export async function getDeviceUser(req: Request): Promise<DeviceUser | null> {
  const token = req.headers.get('X-Device-Token')
  if (!token) return null

  const admin = createAdminClient()
  const { data: td } = await admin
    .from('device_tokens')
    .select('user_id, firma_id, isim_soyisim, proje_id, aktif')
    .eq('device_token', token)
    .single()
  if (!td || td.aktif === false) return null

  // Kullanıcı pasif kontrolü
  const { data: u } = await admin.from('users').select('aktif').eq('id', td.user_id).single()
  if (!u || u.aktif === false) return null

  return {
    userId: td.user_id,
    firmaId: td.firma_id,
    isim: td.isim_soyisim,
    projeId: td.proje_id,
  }
}

/**
 * Firma için Oto Yıkama modülü aktif mi? Kapalıysa endpoint 403 dönmelidir.
 */
export async function isOtoYikamaAktif(firmaId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.from('firmalar').select('oto_yikama_aktif').eq('id', firmaId).single()
  return (data as any)?.oto_yikama_aktif === true
}
