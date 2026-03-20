import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PersonelTakibiClient from '@/components/personel-takibi/PersonelTakibiClient'

export const dynamic = 'force-dynamic'

export default async function SAPersonelTakibiPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  return <PersonelTakibiClient base="/sa" isSA />
}
