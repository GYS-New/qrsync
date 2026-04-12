import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import DashboardRenderer from '@/components/dashboard/DashboardRenderer'
import DashboardRefresher from '@/components/dashboard/DashboardRefresher'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: me } = await supabase.from('users').select('firma_id').eq('id', user.id).single()
  const firmaId = me?.firma_id ?? null

  const [bloklar, aktifProje] = await Promise.all([
    ensureDashboardDefaults(user.id),
    getAktifProje(firmaId),
  ])

  return (
    <div>
      <Topbar
        title="Gosterge Paneli"
        base="/ta"
        breadcrumbs={[{ label: 'Gosterge Paneli' }]}
      />
      <div style={{ padding: '24px 28px' }}>
        <DashboardRenderer bloklar={bloklar} firmaId={firmaId} isSuperAdmin={false} basePath="/ta" projeId={aktifProje?.id ?? null} />
      </div>
      <DashboardRefresher />
    </div>
  )
}
