import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import DashboardRenderer from '@/components/dashboard/DashboardRenderer'
import DashboardRefresher from '@/components/dashboard/DashboardRefresher'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function SADashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const firmaId = getAktifFirmaId()
  // SA'da üst lokasyon seçici YOK — scope filtresi sadece TA'da uygulanır.
  // Cookie'den okumuyoruz ki TA ile giriş yapıp seçim bırakıp SA'ya geçen
  // kullanıcıda eski filtre sızmasın.
  const yetkiliLokIds: string[] | null = null

  const [aktifProje, bloklar] = await Promise.all([
    getAktifProje(firmaId),
    ensureDashboardDefaults(user.id),
  ])

  return (
    <div>
      <Topbar
        title="Gösterge Paneli"
        base="/sa"
        breadcrumbs={[{ label: 'Gösterge Paneli' }]}
      />
      <div style={{ padding: 'clamp(12px, 2vw, 28px)' }}>
        <DashboardRenderer
          bloklar={bloklar}
          firmaId={firmaId}
          projeId={aktifProje?.id ?? null}
          isSuperAdmin
          basePath="/sa"
          yetkiliLokIds={yetkiliLokIds}
        />
      </div>
      <DashboardRefresher />
    </div>
  )
}
