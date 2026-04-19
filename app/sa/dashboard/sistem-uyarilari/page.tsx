import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import SistemAlertsClient from '@/components/sistem-alerts/SistemAlertsClient'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function SASistemUyarilariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/login')

  return (
    <div>
      <Topbar title="Sistem Uyarıları" base="/sa" breadcrumbs={[{ label: 'Sistem' }, { label: 'Sistem Uyarıları' }]} />
      <SistemAlertsClient />
    </div>
  )
}
