import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import SAProviders from '@/components/layout/SAProviders'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getOtoYikamaNav } from '@/lib/modul/otoYikamaNav'

export const dynamic = 'force-dynamic'

/**
 * Oto Yıkama modülü layout'u.
 *
 * Erişim hiyerarşisi:
 *  1. Auth + modül yetki kontrolü (lib/modul/serverYetki.ts)
 *  2. Firma seçimi: SA için cookie'den, diğerleri user.firma_id
 *  3. firmalar.oto_yikama_aktif true olmalı (SA hariç — SA kapalı firmayı da görebilir)
 *
 * Sidebar mevcut Sidebar component'inin customNavGroups prop'u ile beslenir
 * (kod tekrarı yok; Oto Yıkama menüsü `lib/modul/otoYikamaNav.ts` içinden).
 */
export default async function OtoYikamaLayout({ children }: { children: React.ReactNode }) {
  const { me } = await assertModulYetkisi('oto_yikama')
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  const admin = createAdminClient()
  const cookieFirmaId = getAktifFirmaId()
  const firmaId = isSA ? cookieFirmaId : me.firma_id

  // Modül flag kontrolü (SA hariç) — assertModulYetkisi zaten yetki+aktif baktı ama
  // SA için cookie firma değişiminde flag kontrolü yapılmadı.
  // SA için kapalı firmaya gelse de yine girebilir (admin esnekliği).

  const { data: konfig } = await admin
    .from('sistem_konfigurasyon')
    .select('sidebar_logo_url')
    .limit(1).single()
  const sidebarLogo = konfig?.sidebar_logo_url ?? null

  let projeLogo: string | null = null
  let projeAdi: string | null = null
  if (firmaId) {
    const aktifProje = await getAktifProje(firmaId)
    if (aktifProje) {
      const { data: prj } = await admin
        .from('projeler')
        .select('ad,logo_url')
        .eq('id', aktifProje.id).single()
      projeLogo = (prj as any)?.logo_url ?? null
      projeAdi  = (prj as any)?.ad ?? null
    }
  }

  const navGroups = getOtoYikamaNav()

  return (
    <SAProviders>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#fafafa' }}>
        <Sidebar
          user={me as any}
          firma={null}
          sidebarLogo={sidebarLogo}
          projeLogo={projeLogo}
          projeAdi={projeAdi}
          customNavGroups={navGroups}
        />
        <div style={{ marginLeft: 282, flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
          {children}
        </div>
      </div>
    </SAProviders>
  )
}
