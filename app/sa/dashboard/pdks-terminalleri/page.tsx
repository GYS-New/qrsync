import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PdksTerminalleriClient from '@/components/pdks/PdksTerminalleriClient'

export const dynamic = 'force-dynamic'

export default async function SAPdksTerminalleriPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  return <PdksTerminalleriClient base="/sa" isSA />
}
