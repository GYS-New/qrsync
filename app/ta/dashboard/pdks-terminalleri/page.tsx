import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PdksTerminalleriClient from '@/components/pdks/PdksTerminalleriClient'

export const dynamic = 'force-dynamic'

export default async function TAPdksTerminalleriPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  return <PdksTerminalleriClient base="/ta" isSA={false} tenantFirmaId={me.firma_id} />
}
