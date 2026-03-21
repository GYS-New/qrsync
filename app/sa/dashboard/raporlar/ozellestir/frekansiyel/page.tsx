import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import Topbar from '@/components/layout/Topbar'
import GenelRaporKarti from '@/components/reports/GenelRaporKarti'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SAFrekansiyel() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')
  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  return <GenelRaporKarti base="/sa" isSA projeId={aktifProje?.id ?? null} />
}
