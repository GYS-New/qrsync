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
    return { authUser, me }
  }

  const yetkili = await getYetkiliModuller(me.rol, me.firma_id ?? null, me.id)
  const secilen = yetkili.moduller.find(m => m.kod === modul)
  if (!secilen || !secilen.aktif || !secilen.yetkili) {
    // LOOP-KIRICI: force=1 ile /modul-sec'e gönder. Bu sayede /modul-sec tek-modul
    // otomasyonu atlanır, kullanıcı seçim ekranını görür — /X → /modul-sec → /X
    // sonsuz döngüsü asla oluşamaz. hata param'ı UI'da uyarı göstermek için.
    // Debug: Railway loglarında root cause tespit edilebilir.
    console.warn('[assertModulYetkisi] FAIL', {
      user_id: me.id, email: (me as any).email, rol: me.rol, firma_id: me.firma_id,
      istenen_modul: modul,
      yetkili_moduller: yetkili.moduller.map(m => ({ kod: m.kod, aktif: m.aktif, yetkili: m.yetkili })),
    })
    redirect(`/modul-sec?force=1&hata=yetki_yok&modul=${encodeURIComponent(modul)}`)
  }

  return { authUser, me }
}
