import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import DashboardRenderer from '@/components/dashboard/DashboardRenderer'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'

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

  const bloklar = await ensureDashboardDefaults(user.id)

  return (
    <div>
      <Topbar
        title="Gösterge Paneli"
        base="/u"
        breadcrumbs={[{ label: 'Gösterge Paneli' }]}
        actions={
          <span style={{ fontSize: 13, color: '#9a7b6a' }}>
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
        />
      </div>
    </div>
  )
}
