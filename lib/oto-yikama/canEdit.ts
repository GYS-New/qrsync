/**
 * Oto Yikama sayfalarinda "duzenle/sil" yetkisi kontrolu.
 *
 * Yetki matrisi (26.08.2026):
 *   - SA / alt_SA           → full access (her firma)
 *   - TA (tenant_admin)     → sadece kendi firmasi
 *   - TU (tenant_user)      → kendi firmasi VE kullanici_lokasyon_yetkileri'nde
 *                             en az bir ust lokasyona atanmis olmali. Yetki-siz
 *                             TU'lar (rasgele personel) salt-okur.
 *   - Diger roller          → yok
 *
 * Kullanim:
 *   - Server component (page.tsx): once giris kontrolu sonra bu fonksiyon
 *   - API endpoint: authorize sonrasi bu fonksiyon
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type Me = { id: string; rol: string; firma_id: string | null }

export async function canEditOtoYikama(
  admin: SupabaseClient,
  me: Me,
  firmaId: string,
): Promise<boolean> {
  if (me.rol === 'super_admin' || me.rol === 'alt_super_admin') return true
  if (me.firma_id !== firmaId) return false
  if (me.rol === 'tenant_admin') return true
  if (me.rol === 'tenant_user') {
    const { count } = await admin
      .from('kullanici_lokasyon_yetkileri')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', me.id)
    return (count ?? 0) > 0
  }
  return false
}
