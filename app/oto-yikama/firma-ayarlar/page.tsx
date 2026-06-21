import { createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import FirmaAyarlarClient from '@/components/firmalar/FirmaAyarlarClient'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaFirmaAyarlarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const admin = createAdminClient()
  const firmaId = await getOtoYikamaFirmaId(admin as any, me)
  const { data: firma } = firmaId
    ? await admin.from('firmalar').select('*').eq('id', firmaId).single()
    : { data: null }

  return (
    <div>
      <Topbar
        title="Firma Ayarları"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Firma Ayarları' }]}
        hideScopeControls hideNotifBar
      />
      <div style={{ padding: '24px 28px' }}>
        {firma ? (
          <FirmaAyarlarClient firma={firma as any} />
        ) : (
          <div className="verde-card" style={{ padding: 18 }}>Firma bulunamadı.</div>
        )}
      </div>
    </div>
  )
}
