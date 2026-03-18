import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MusteriDegerlendirmeRaporClient from '@/components/reports/MusteriDegerlendirmeRaporClient'

export const dynamic = 'force-dynamic'

export default async function SAMusteriDegerlendirmePage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')
  return <MusteriDegerlendirmeRaporClient base="/sa" isSA />
}
