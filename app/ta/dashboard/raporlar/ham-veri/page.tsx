import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReportsClient from '@/components/reports/ReportsClient'
import Topbar from '@/components/layout/Topbar'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TARaporlarHamVeriPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')
  if (!await sayfaGorebilirMi(me.rol, 'ham-veri-raporlari', me.firma_id ?? null)) redirect('/ta/dashboard/raporlar')

  const aktifProje = await getAktifProje(me.firma_id ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Ham Veri Raporlari" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Raporlar' }, { label: 'Ham Veri' }]} />
      <ProjeSecilmedi />
    </div>
  )

  const { data: firma } = me.firma_id
    ? await supabase.from('firmalar').select('firma_adi,ticari_unvan').eq('id', me.firma_id).single()
    : { data: null }
  const firmaAdi = firma?.firma_adi || firma?.ticari_unvan || null

  return <ReportsClient base="/ta" title="Ham Veri Raporlari" initialFirmaId={me.firma_id ?? null} isSA={false} firmaAdi={firmaAdi} projeId={aktifProje.id} />
}
