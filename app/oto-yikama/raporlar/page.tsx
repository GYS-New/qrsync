import Topbar from '@/components/layout/Topbar'
import RaporlarClient from '@/components/oto-yikama/RaporlarClient'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaRaporlarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)

  return (
    <div>
      <Topbar title="Raporlar" base={rolBase} hideScopeControls hideNotifBar
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Raporlar' }]} />
      <RaporlarClient />
    </div>
  )
}
