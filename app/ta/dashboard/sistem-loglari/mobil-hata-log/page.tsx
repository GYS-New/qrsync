import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import MobilHataLogClient from '@/components/mobil-hata-log/MobilHataLogClient'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function TAMobilHataLogPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/login')
  if (!me.firma_id) redirect('/login')

  return (
    <div>
      <Topbar title="Mobil Hata Log" base="/ta"
        breadcrumbs={[{ label: 'Sistem' }, { label: 'Sistem Logları', href: '/ta/dashboard/sistem-loglari' }, { label: 'Mobil Hata Log' }]} />
      <MobilHataLogClient isSA={false} />
    </div>
  )
}
