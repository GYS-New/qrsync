import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import SpesifikRaporKarti from '@/components/reports/SpesifikRaporKarti'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SASpesifik() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')
  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  return <SpesifikRaporKarti base="/sa" isSA projeId={aktifProje?.id ?? null} />
}
