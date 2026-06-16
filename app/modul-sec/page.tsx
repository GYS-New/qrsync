import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getYetkiliModuller } from '@/lib/modul/yetkiliModuller'
import { getAktifModul, modulLandingUrl, setAktifModul } from '@/lib/modul/cookie'
import ModulSecClient from './ModulSecClient'

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
export default async function ModulSecPage({ searchParams }: { searchParams: { force?: string } }) {
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
  const force = searchParams.force === '1'

  const yetkili = await getYetkiliModuller(me.rol, me.firma_id ?? null)
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

  // 2. Tek modül → otomatik seç + cookie yaz + redirect (force=1 ise atlanır)
  if (!force && aktifYetkili.length === 1) {
    const tek = aktifYetkili[0].kod
    setAktifModul(tek)
    redirect(modulLandingUrl(tek, me.rol))
  }

  // 3. Hiç yetkili modül yoksa (teorik olarak olmaz çünkü GYS default)
  if (aktifYetkili.length === 0) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
        padding: 20,
      }}>
        <div style={{
          maxWidth: 480, textAlign: 'center',
          background: '#fff', padding: 32, borderRadius: 14,
          border: '1px solid rgba(79,106,255,.15)',
          boxShadow: '0 14px 40px rgba(26,31,54,0.10)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>Erişim Yok</div>
          <div style={{ fontSize: 14, color: 'var(--text-500)', lineHeight: 1.5 }}>
            Hesabınıza tanımlı erişim yapılabilir bir modül bulunamadı.
            Yöneticinize başvurun.
          </div>
        </div>
      </div>
    )
  }

  // 4. Çoklu modül → seçim ekranı
  return <ModulSecClient
    moduller={yetkili.moduller}
    kullaniciAdi={me.isim_soyisim ?? ''}
  />
}
