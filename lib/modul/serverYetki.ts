import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getYetkiliModuller, type ModulKodu } from './yetkiliModuller'

/**
 * Server-side modül erişim kontrolü. Layout veya page'de çağrılır.
 *
 * Akış:
 *  - Auth yoksa /login
 *  - Kullanıcı modüle yetkili değilse veya modül firma için kapalıysa
 *    /modul-sec'e yönlendir (kullanıcı başka modül seçebilsin)
 *  - SA tüm modüllerde otomatik yetkilidir
 *
 * Dönüş: { user, me } — page/layout devamı için gerekli bilgiler.
 */
export async function assertModulYetkisi(modul: ModulKodu) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('id, rol, firma_id, isim_soyisim, email')
    .eq('id', authUser.id)
    .single()
  if (!me) redirect('/login')

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (isSA) {
    // SA için modül flag kontrolü dahi yapılmıyor — admin tarafında her şey görünür
    return { authUser, me }
  }

  const yetkili = await getYetkiliModuller(me.rol, me.firma_id ?? null)
  const secilen = yetkili.moduller.find(m => m.kod === modul)
  if (!secilen || !secilen.aktif || !secilen.yetkili) {
    redirect('/modul-sec')
  }

  return { authUser, me }
}
