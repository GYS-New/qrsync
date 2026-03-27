import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import HakedisRaporClient from '@/components/reports/HakedisRaporClient'
import Topbar from '@/components/layout/Topbar'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TAHakedisRaporPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  // Yetki kontrolü — raporlar sayfası yetkisi
  const gorebilir = await sayfaGorebilirMi(me.rol, 'raporlar', me.firma_id ?? null)
  if (!gorebilir) redirect('/ta/dashboard')

  // Firma birim fiyat aktif mi?
  const admin = createAdminClient()
  const { data: firma } = me.firma_id
    ? await admin.from('firmalar').select('birim_fiyat_aktif').eq('id', me.firma_id).single()
    : { data: null }
  if (!firma?.birim_fiyat_aktif) redirect('/ta/dashboard/raporlar')

  const aktifProje = await getAktifProje(me.firma_id ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Hakediş Raporu" base="/ta" breadcrumbs={[{ label: 'Raporlar', href: '/ta/dashboard/raporlar' }, { label: 'Hakediş Raporu' }]} />
      <ProjeSecilmedi />
    </div>
  )

  return <HakedisRaporClient firmaId={me.firma_id!} projeId={aktifProje.id} base="/ta" />
}
