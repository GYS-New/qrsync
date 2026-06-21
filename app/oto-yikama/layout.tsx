import { createAdminClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import SAProviders from '@/components/layout/SAProviders'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getOtoYikamaNav } from '@/lib/modul/otoYikamaNav'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'

export const dynamic = 'force-dynamic'

/**
 * Oto Yıkama modülü layout'u.
 *
 * Erişim hiyerarşisi:
 *  1. Auth + modül yetki kontrolü (lib/modul/serverYetki.ts)
 *  2. Firma seçimi: getOtoYikamaFirmaId (SA için cookie → cookie yoksa
 *     oto_yikama_aktif olan ilk firma; diğerleri user.firma_id)
 *  3. firmalar.oto_yikama_aktif true olmalı (SA hariç — SA kapalı firmayı da görebilir)
 *
 * Sidebar mevcut Sidebar component'inin customNavGroups prop'u ile beslenir
 * (kod tekrarı yok; Oto Yıkama menüsü `lib/modul/otoYikamaNav.ts` içinden).
 */
export default async function OtoYikamaLayout({ children }: { children: React.ReactNode }) {
  const { me } = await assertModulYetkisi('oto_yikama')
  const admin = createAdminClient()
  const firmaId = await getOtoYikamaFirmaId(admin as any, me)
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  // Modül flag kontrolü (SA hariç) — assertModulYetkisi zaten yetki+aktif baktı ama
  // SA için cookie firma değişiminde flag kontrolü yapılmadı.
  // SA için kapalı firmaya gelse de yine girebilir (admin esnekliği).

  const { data: konfig } = await admin
    .from('sistem_konfigurasyon')
    .select('sidebar_logo_url')
    .limit(1).single()
  const sidebarLogo = konfig?.sidebar_logo_url ?? null

  // Non-SA için firma logosu (GYS TA/U layout pattern'i) — Oto Yıkama'da
  // FirmaContext non-SA'ya kapalı olduğu için Sidebar firma=null görüyordu.
  let firma: { ticari_unvan: string; firma_adi?: string; logo_url?: string } | null = null
  if (!isSA && firmaId) {
    const { data: f } = await admin
      .from('firmalar')
      .select('ticari_unvan,firma_adi,logo_url')
      .eq('id', firmaId)
      .single()
    firma = (f as any) ?? null
  }

  let projeLogo: string | null = null
  let projeAdi: string | null = null
  // İO Asistan açık/kapalı — non-SA için ProjeContext boş kaldığından (FirmaContext
  // 403 dönüyor) Sidebar aktifProje'yi göremiyor. Server'da aktif projeden çözüp
  // prop olarak iletiyoruz. SA için Sidebar zaten ProjeContext'ten okur.
  let ioAsistanAktif: boolean | undefined = undefined
  if (firmaId) {
    const aktifProje = await getAktifProje(firmaId)
    if (aktifProje) {
      const { data: prj } = await admin
        .from('projeler')
        .select('ad,logo_url,io_asistan_aktif')
        .eq('id', aktifProje.id).single()
      projeLogo = (prj as any)?.logo_url ?? null
      projeAdi  = (prj as any)?.ad ?? null
      ioAsistanAktif = (prj as any)?.io_asistan_aktif !== false
    }
  }

  const navGroups = getOtoYikamaNav()

  return (
    <SAProviders>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#fafafa' }}>
        <Sidebar
          user={me as any}
          firma={firma}
          sidebarLogo={sidebarLogo}
          projeLogo={projeLogo}
          projeAdi={projeAdi}
          customNavGroups={navGroups}
          ioAsistanAktifProp={ioAsistanAktif}
        />
        <div style={{ marginLeft: 282, flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {children}
        </div>
      </div>
    </SAProviders>
  )
}
