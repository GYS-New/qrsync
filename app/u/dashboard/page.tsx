import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import DashboardRenderer from '@/components/dashboard/DashboardRenderer'
import DashboardRefresher from '@/components/dashboard/DashboardRefresher'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: me } = await supabase
    .from('users')
    .select('firma_id,proje_id')
    .eq('id', user.id)
    .single()

  const firmaId  = me?.firma_id  ?? null
  const projeId  = me?.proje_id  ?? null   // U kendi projesini görür

  const [bloklar, yetkiliLokIds] = await Promise.all([
    ensureDashboardDefaults(user.id),
    firmaId ? getYetkiliLokasyonIds(supabase, firmaId, projeId) : null,
  ])

  return (
    <div>
      <Topbar
        title="Gösterge Paneli"
        base="/u"
        breadcrumbs={[{ label: 'Gösterge Paneli' }]}
        actions={
          <span style={{ fontSize: 13, color: '#6b7280' }}>
            {new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        }
      />
      <div style={{ padding: '24px 28px' }}>
        <DashboardRenderer
          bloklar={bloklar}
          firmaId={firmaId}
          projeId={projeId}
          isSuperAdmin={false}
          basePath="/u"
          yetkiliLokIds={yetkiliLokIds}
        />
      </div>
      <DashboardRefresher />
    </div>
  )
}
