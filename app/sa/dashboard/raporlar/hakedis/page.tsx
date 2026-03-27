import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import HakedisRaporClient from '@/components/reports/HakedisRaporClient'
import Topbar from '@/components/layout/Topbar'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function SAHakedisRaporPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  const firmaId = getAktifFirmaId()
  if (!firmaId) return (
    <div>
      <Topbar title="Hakediş Raporu" base="/sa" breadcrumbs={[{ label: 'Raporlar', href: '/sa/dashboard/raporlar' }, { label: 'Hakediş Raporu' }]} />
      <ProjeSecilmedi />
    </div>
  )

  // Firma birim fiyat aktif mi kontrol et
  const admin = createAdminClient()
  const { data: firma } = await admin.from('firmalar').select('birim_fiyat_aktif').eq('id', firmaId).single()
  if (!firma?.birim_fiyat_aktif) redirect('/sa/dashboard/raporlar')

  const aktifProje = await getAktifProje(firmaId)
  if (!aktifProje) return (
    <div>
      <Topbar title="Hakediş Raporu" base="/sa" breadcrumbs={[{ label: 'Raporlar', href: '/sa/dashboard/raporlar' }, { label: 'Hakediş Raporu' }]} />
      <ProjeSecilmedi />
    </div>
  )

  return <HakedisRaporClient firmaId={firmaId} projeId={aktifProje.id} base="/sa" />
}
