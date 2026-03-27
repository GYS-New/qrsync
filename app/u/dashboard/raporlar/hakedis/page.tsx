import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import HakedisRaporClient from '@/components/reports/HakedisRaporClient'
import Topbar from '@/components/layout/Topbar'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function UHakedisRaporPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'raporlar', me.firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard')

  // Firma birim fiyat aktif mi?
  const admin = createAdminClient()
  const { data: firma } = me.firma_id
    ? await admin.from('firmalar').select('birim_fiyat_aktif').eq('id', me.firma_id).single()
    : { data: null }
  if (!firma?.birim_fiyat_aktif) redirect('/u/dashboard/raporlar')

  if (!me.proje_id) return (
    <div>
      <Topbar title="Hakediş Raporu" base="/u" breadcrumbs={[{ label: 'Raporlar', href: '/u/dashboard/raporlar' }, { label: 'Hakediş Raporu' }]} />
      <ProjeSecilmedi />
    </div>
  )

  return <HakedisRaporClient firmaId={me.firma_id!} projeId={me.proje_id} base="/u" />
}
