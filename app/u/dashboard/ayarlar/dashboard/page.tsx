import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import DashboardSettingsClient from '@/components/dashboard/DashboardSettingsClient'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { redirect } from 'next/navigation'

export default async function DashboardAyarlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const meId = authUser.id

  const bloklar = await ensureDashboardDefaults(meId)

  return (
    <div>
      <Topbar
        title="Dashboard Ayarları"
        base="/u"
        breadcrumbs={[{ label: 'Sistem' }, { label: 'Ayarlar' }, { label: 'Dashboard Ayarları' }]}
      />
      <div style={{ padding: '24px 28px' }}>
        <DashboardSettingsClient meId={meId} initialBloklar={(bloklar as any) ?? []} />
      </div>
    </div>
  )
}
