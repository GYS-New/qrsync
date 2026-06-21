import Topbar from '@/components/layout/Topbar'
import RaporlarClient from '@/components/oto-yikama/RaporlarClient'
import { createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaRaporlarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const firmaId = await getOtoYikamaFirmaId(createAdminClient() as any, me)

  return (
    <div>
      <Topbar title="Raporlar" base={rolBase} hideScopeControls hideNotifBar hideNotifBell
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Raporlar' }]} />
      {!firmaId ? (
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin.
          </div>
        </div>
      ) : (
        <RaporlarClient firmaId={firmaId} />
      )}
    </div>
  )
}
