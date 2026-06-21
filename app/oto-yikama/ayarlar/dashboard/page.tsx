import Topbar from '@/components/layout/Topbar'
import DashboardSettingsClient from '@/components/dashboard/DashboardSettingsClient'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaDashboardAyarlarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const bloklar = await ensureDashboardDefaults(me.id)

  return (
    <div>
      <Topbar
        title="Dashboard Ayarları"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Dashboard Ayarları' }]}
        hideScopeControls hideNotifBar hideNotifBell
      />
      <div style={{ padding: '24px 28px' }}>
        <DashboardSettingsClient meId={me.id} initialBloklar={(bloklar as any) ?? []} />
      </div>
    </div>
  )
}
