import Topbar from '@/components/layout/Topbar'
import { createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'
import RaporGonderimiClient from '@/components/oto-yikama/RaporGonderimiClient'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaRaporGonderimiPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const admin = createAdminClient()
  const firmaId = await getOtoYikamaFirmaId(admin, me)

  return (
    <div>
      <Topbar
        title="Rapor Gönderimi"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Rapor Gönderimi' }]}
        hideScopeControls hideNotifBar      />
      <div style={{ padding: '24px 28px' }}>
        {!firmaId ? (
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin.
          </div>
        ) : (
          <RaporGonderimiClient firmaId={firmaId} />
        )}
      </div>
    </div>
  )
}
