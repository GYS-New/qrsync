import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AnketDetayClient from '@/components/anket/AnketDetayClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SAAnketDetayPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')
  return <AnketDetayClient base="/sa" anketId={params.id} />
}
