import Topbar from '@/components/layout/Topbar'
import GunlukClient from '@/components/oto-yikama/GunlukClient'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaGunlukPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)

  return (
    <div>
      <Topbar title="Canlı İşlemler" base={rolBase} hideScopeControls hideNotifBar
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Canlı İşlemler' }]} />
      <GunlukClient />
    </div>
  )
}
