import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getYetkiliModuller } from '@/lib/modul/yetkiliModuller'
import { getAktifModul, modulLandingUrl } from '@/lib/modul/cookie'
import ModulSecClient from './ModulSecClient'
import ErisimYokEkran from './ErisimYokEkran'

export const dynamic = 'force-dynamic'

/**
 * /modul-sec — Login sonrası kullanıcının yetkili olduğu modülü seçtiği ekran.
 *
 * Akış:
 * 1. ?force=1 → cookie temizlenir + seçim ekranı her zaman gösterilir.
 *    Kullanıcı yanlış modüle düştüğünde (örn. henüz yapılmamış FMS'e)
 *    veya "Modül Değiştir" linkinden geldiğinde kullanılır.
 * 2. Cookie'de aktif_modul varsa → o modülün landing URL'ine redirect.
 * 3. Yetkili modül sayısı 1 ise → direkt o modüle redirect, seçim ekranı atlanır.
 * 4. Çoklu yetkili modül → kart UI gösterilir.
 */
export default async function ModulSecPage({ searchParams }: { searchParams: { force?: string; hata?: string; modul?: string } }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('id, rol, firma_id, isim_soyisim')
    .eq('id', authUser.id)
    .single()
  if (!me) redirect('/login')

  // ?force=1 → cookie'yi görmezden gel (server component'ten cookie SİLİNEMEZ;
  // bu sınır Next.js 14'ün kuralı. Bunun yerine cookie'yi okumayı atla; kullanıcı
  // yeni bir modül seçince POST /api/modul/sec cookie'yi üzerine yazar.)
  //
  // Ek olarak: ?hata parametresi geldiyse (assertModulYetkisi'den geliyorsa)
  // force otomatik true olur — loop kırıcı. Modül sayfası hata gösterip
  // seçim ekranını render eder.
  const force = searchParams.force === '1' || Boolean(searchParams.hata)
  const hataMesaji = searchParams.hata === 'yetki_yok' && searchParams.modul
    ? `"${searchParams.modul.toUpperCase()}" modülüne yetkiniz kısıtlı görünüyor. Farklı bir modül seçin veya yöneticinize başvurun.`
    : null

  const yetkili = await getYetkiliModuller(me.rol, me.firma_id ?? null, me.id)
  const aktifYetkili = yetkili.moduller.filter(m => m.aktif)

  // 1. Cookie'deki aktif modül hala yetkili+aktif mi? (force=1 ise atlanır)
  if (!force) {
    const cookieModul = getAktifModul()
    if (cookieModul) {
      const cookieGecerli = aktifYetkili.find(m => m.kod === cookieModul)
      if (cookieGecerli) {
        redirect(modulLandingUrl(cookieModul, me.rol))
      }
    }
  }

  // 2. Tek modül → direkt landing'e redirect (cookie SET ETMİYORUZ; Next.js 14
  // server component'ten cookie yazılamaz, production'da hata verir).
  // Kullanıcı her login'de bu redirect'i geçer; cookie sadece çoklu modül
  // seçiminden sonra POST /api/modul/sec ile yazılır.
  if (!force && aktifYetkili.length === 1) {
    const tek = aktifYetkili[0].kod
    redirect(modulLandingUrl(tek, me.rol))
  }

  // 3. Hiç yetkili modül yoksa — kullanıcının tüm modül erişimleri kapatılmış.
  //    (Migration 091 sonrası GYS de user-bazlı kapatılabilir; eskiden default açıktı.)
  if (aktifYetkili.length === 0) {
    return <ErisimYokEkran isim={me.isim_soyisim ?? null} email={authUser.email ?? null} />
  }

  // 4. Çoklu modül → seçim ekranı (veya loop-kırıcı hata durumu)
  return <ModulSecClient
    moduller={yetkili.moduller}
    kullaniciAdi={me.isim_soyisim ?? ''}
    hataMesaji={hataMesaji}
  />
}
