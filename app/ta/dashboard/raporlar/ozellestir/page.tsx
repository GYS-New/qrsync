import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TemplateReportsClient from '@/components/reports/TemplateReportsClient'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TARaporlarOzellestirPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')
  if (!await sayfaGorebilirMi(me.rol, 'rapor-ozellestir', me.firma_id ?? null)) redirect('/ta/dashboard/raporlar')

  const aktifProje = await getAktifProje(me.firma_id ?? null)

  return <TemplateReportsClient base="/ta" isSA={false} tenantFirmaId={me.firma_id ?? null} projeId={aktifProje?.id ?? null} />
}
