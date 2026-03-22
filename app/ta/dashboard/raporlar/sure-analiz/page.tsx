import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import Topbar from '@/components/layout/Topbar'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import SureAnalizClient from '@/components/reports/SureAnalizClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function TASureAnalizPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')
  const aktifProje = await getAktifProje(me?.firma_id ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Süre Analiz Raporları" base="/ta" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: '/ta/dashboard/raporlar' }, { label: 'Süre Analiz Raporları' }]} />
      <ProjeSecilmedi />
    </div>
  )
  return <SureAnalizClient base="/ta" isSA={false} tenantFirmaId={me.firma_id ?? null} projeId={aktifProje.id} />
}
