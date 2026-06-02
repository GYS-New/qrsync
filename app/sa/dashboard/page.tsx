import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import DashboardRenderer from '@/components/dashboard/DashboardRenderer'
import DashboardRefresher from '@/components/dashboard/DashboardRefresher'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getDescendantIds } from '@/lib/lokasyon/getDescendantIds'

export const dynamic = 'force-dynamic'

export default async function SADashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const firmaId = getAktifFirmaId()
  // Aktif üst lokasyon (SA dashboard scope filtresi) — cookie'den oku, TA ile aynı
  const aktifUstLokasyonId = cookies().get('qrsync_aktif_ust_lokasyon_id')?.value ?? null

  const [aktifProje, bloklar, yetkiliLokIds] = await Promise.all([
    getAktifProje(firmaId),
    ensureDashboardDefaults(user.id),
    getDescendantIds(aktifUstLokasyonId, firmaId),
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
