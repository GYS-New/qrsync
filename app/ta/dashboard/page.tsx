import { cookies } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import DashboardRenderer from '@/components/dashboard/DashboardRenderer'
import DashboardRefresher from '@/components/dashboard/DashboardRefresher'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getDescendantIds } from '@/lib/lokasyon/getDescendantIds'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: me } = await supabase.from('users').select('firma_id').eq('id', user.id).single()
  const firmaId = me?.firma_id ?? null

  // Aktif üst lokasyon (TA dashboard scope filtresi) — cookie'den oku
  const aktifUstLokasyonId = cookies().get('qrsync_aktif_ust_lokasyon_id')?.value ?? null

  const [bloklar, aktifProje, descendantIds] = await Promise.all([
    ensureDashboardDefaults(user.id),
    getAktifProje(firmaId),
    getDescendantIds(aktifUstLokasyonId, firmaId),
  ])

  // Oto Yıkama modülü şu an SA-only — TA için bu lokasyonları yetkiliLokIds'ten hariç tut
  let yetkiliLokIds: string[] | null = descendantIds
  if (firmaId) {
    try {
      const admin = createAdminClient()
      const otoIds = await getOtoYikamaLokasyonIds(admin, firmaId)
      if (otoIds.size > 0) {
        if (yetkiliLokIds === null) {
          // Tüm firma lokasyonları minus Oto Yıkama
          const { data: tum } = await admin.from('lokasyonlar').select('id').eq('firma_id', firmaId)
          yetkiliLokIds = (tum ?? []).map((l: any) => l.id).filter((id: string) => !otoIds.has(id))
        } else {
          yetkiliLokIds = yetkiliLokIds.filter(id => !otoIds.has(id))
        }
      }
      // Empty array Supabase .in() sorgularını patlatır → null'a düşür (tüm erişim)
      if (yetkiliLokIds && yetkiliLokIds.length === 0) yetkiliLokIds = null
    } catch {
      // Filter hata verirse orijinal yetkiliLokIds (descendantIds) kalsın
      yetkiliLokIds = descendantIds
    }
  }

  return (
    <div>
      <Topbar
        title="Gosterge Paneli"
        base="/ta"
        breadcrumbs={[{ label: 'Gosterge Paneli' }]}
      />
      <div style={{ padding: 'clamp(12px, 2vw, 28px)' }}>
        <DashboardRenderer
          bloklar={bloklar}
          firmaId={firmaId}
          isSuperAdmin={false}
          basePath="/ta"
          projeId={aktifProje?.id ?? null}
          yetkiliLokIds={yetkiliLokIds}
        />
      </div>
      <DashboardRefresher />
    </div>
  )
}
