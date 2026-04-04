import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TemplateReportsClient from '@/components/reports/TemplateReportsClient'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function URaporlarOzellestirPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'rapor-ozellestir', (me as any).firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard/raporlar')

  return <TemplateReportsClient base="/u" isSA={false} tenantFirmaId={(me as any).firma_id ?? null} projeId={(me as any).proje_id ?? null} />
}
