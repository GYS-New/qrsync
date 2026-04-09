/**
 * Server-side: Kullanıcının yetkili üst lokasyon ID listesini döner.
 *
 * Kurallar:
 * - SA/TA: null (tüm erişim — filtre uygulanmaz)
 * - U/M: kullanici_lokasyon_yetkileri tablosundan
 * - Kayıt yoksa: null (tüm erişim — geriye dönük uyumluluk)
 * - Kayıt varsa: string[] (sadece bu üst lokasyonlar)
 *
 * Kullanım:
 *   const yetkiliUstLokIds = await getLokasyonYetki(supabase)
 *   // null ise filtre uygulanmaz
 *   // string[] ise lokasyon_id IN alt_lokasyonlar filtresi
 */
import { createAdminClient } from '@/lib/supabase/server'

export async function getLokasyonYetki(
  supabase: any
): Promise<string[] | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return null

  // SA/TA tüm erişim
  if (['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('kullanici_lokasyon_yetkileri')
    .select('ust_lokasyon_id')
    .eq('user_id', user.id)

  const ids = (data ?? []).map((r: any) => r.ust_lokasyon_id)

  // Kayıt yoksa = tüm erişim
  if (ids.length === 0) return null

  return ids
}

/**
 * Yetkili üst lokasyonların TÜM alt lokasyon ID'lerini döner.
 * Sorgularda lokasyon_id IN (...) filtresi için kullanılır.
 */
export async function getYetkiliLokasyonIds(
  supabase: any,
  firmaId: string,
  projeId?: string | null,
): Promise<string[] | null> {
  const ustLokIds = await getLokasyonYetki(supabase)
  if (ustLokIds === null) return null // tüm erişim

  const admin = createAdminClient()

  // Tüm lokasyonları çek
  let q = admin.from('lokasyonlar').select('id, parent_id').eq('firma_id', firmaId)
  if (projeId) q = (q as any).eq('proje_id', projeId)
  const { data: loks } = await q

  if (!loks) return ustLokIds

  // BFS: üst lokasyonlar + tüm altları
  const yetkiliSet = new Set<string>(ustLokIds)
  const queue = [...ustLokIds]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const l of loks) {
      if (l.parent_id === cur && !yetkiliSet.has(l.id)) {
        yetkiliSet.add(l.id)
        queue.push(l.id)
      }
    }
  }

  return [...yetkiliSet]
}
