import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import { ProjeProvider } from '@/components/projeler/ProjeContext'
import { UstLokasyonProvider } from '@/components/lokasyon/UstLokasyonContext'
import FirmaDurumBanner from '@/components/firmalar/FirmaDurumBanner'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { TesterProvider } from '@/components/layout/TesterContext'
import KritikUyariModal from '@/components/bildirim/KritikUyariModal'
import StickyTheadPolyfill from '@/components/ui/sticky-thead-polyfill'

function getFirmaDurum(firma: any): { durum: 'pasif' | 'lisans_doldu' | null; lisansTarihi: string | null } {
  if (!firma) return { durum: null, lisansTarihi: null }

  // Aktif kontrolü
  if (firma.aktif === false) {
    return { durum: 'pasif', lisansTarihi: null }
  }

  // Lisans kontrolü
  if (firma.lisans_gecerlilik_tarihi) {
    const bitis = new Date(firma.lisans_gecerlilik_tarihi)
    if (bitis < new Date()) {
      return { durum: 'lisans_doldu', lisansTarihi: firma.lisans_gecerlilik_tarihi }
    }
  }

  return { durum: null, lisansTarihi: null }
}

export default async function TALayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: user } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  if (!user || user.rol !== 'tenant_admin') redirect('/login')

  const { data: firma } = user.firma_id
    ? await supabase.from('firmalar')
        .select('ticari_unvan,firma_adi,logo_url,aktif,lisans_gecerlilik_tarihi,birim_fiyat_aktif')
        .eq('id', user.firma_id)
        .single()
    : { data: null }

  const { durum, lisansTarihi } = getFirmaDurum(firma)

  // Aktif proje logosu
  const aktifProje = user.firma_id ? await getAktifProje(user.firma_id) : null
  let projeLogo: string | null = null
  if (aktifProje) {
    const admin = createAdminClient()
    const { data: prj } = await admin.from('projeler').select('logo_url').eq('id', aktifProje.id).single()
    projeLogo = (prj as any)?.logo_url ?? null
  }

  const isTester = (user as any).is_tester === true

  return (
    <ProjeProvider firmaId={user.firma_id ?? null}>
      <UstLokasyonProvider firmaId={user.firma_id ?? null}>
        <TesterProvider isTester={isTester}>
          <StickyTheadPolyfill />
          <div style={{ display: 'flex', minHeight: 'calc(100vh / 0.75)', background: '#fafafa', zoom: 0.75 }}>
            <Sidebar user={user} firma={firma} birimFiyatAktifProp={(firma as any)?.birim_fiyat_aktif === true} projeLogo={projeLogo} />
            <div style={{ marginLeft: 282, flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
              <FirmaDurumBanner durum={durum} lisansTarihi={lisansTarihi} />
              {children}
            </div>
          </div>
          <KritikUyariModal />
        </TesterProvider>
      </UstLokasyonProvider>
    </ProjeProvider>
  )
}
