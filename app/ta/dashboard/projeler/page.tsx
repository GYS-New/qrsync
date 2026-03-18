import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import ProjelerClient from '@/components/projeler/ProjelerClient'

export const dynamic = 'force-dynamic'

export default async function TAProjelerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  return (
    <div>
      <Topbar
        title="Projeler"
        base="/ta"
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Projeler' }]}
      />
      <div style={{ padding: 24 }}>
        <ProjelerClient firmaId={me.firma_id} readonly={false} isSA={false} />
      </div>
    </div>
  )
}
