import Topbar from '@/components/layout/Topbar'
import GunlukClient from '@/components/oto-yikama/GunlukClient'
import { createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaGunlukPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const firmaId = await getOtoYikamaFirmaId(createAdminClient() as any, me)

  return (
    <div>
      <Topbar title="Canlı İşlemler" base={rolBase} hideScopeControls hideNotifBar        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Canlı İşlemler' }]} />
      {!firmaId ? (
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin.
          </div>
        </div>
      ) : (
        <GunlukClient firmaId={firmaId} />
      )}
    </div>
  )
}
