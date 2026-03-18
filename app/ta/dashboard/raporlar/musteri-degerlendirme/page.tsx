import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MusteriDegerlendirmeRaporClient from '@/components/reports/MusteriDegerlendirmeRaporClient'
import Topbar from '@/components/layout/Topbar'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function TAMusteriDegerlendirmePage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const aktifProje = await getAktifProje(me.firma_id ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Müşteri Değerlendirmeleri" base="/ta"
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: '/ta/dashboard/raporlar' }, { label: 'Müşteri Değerlendirmeleri' }]} />
      <ProjeSecilmedi />
    </div>
  )

  return (
    <MusteriDegerlendirmeRaporClient
      base="/ta"
      isSA={false}
      initialFirmaId={me.firma_id ?? null}
      projeId={aktifProje.id}
    />
  )
}
