import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import ProjelerSAWrapper from '@/components/projeler/ProjelerSAWrapper'

export const dynamic = 'force-dynamic'

export default async function SAProjelerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) redirect('/sa/dashboard')

  return (
    <div>
      <Topbar
        title="Projeler"
        base="/sa"
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Projeler' }]}
      />
      <ProjelerSAWrapper />
    </div>
  )
}
