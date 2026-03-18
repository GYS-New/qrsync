import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import QuickReportsPageClient from '@/components/reports/QuickReportsPageClient'
import Topbar from '@/components/layout/Topbar'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TAGrafikselRaporlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const aktifProje = await getAktifProje(me.firma_id ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Grafiksel Raporlar" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Raporlar' }, { label: 'Grafiksel' }]} />
      <ProjeSecilmedi />
    </div>
  )

  return <QuickReportsPageClient base="/ta" title="Grafiksel Raporlar" initialFirmaId={me.firma_id ?? null} isSA={false} projeId={aktifProje.id} />
}
