import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import CeklistRaporlariClient from '@/components/raporlar/CeklistRaporlariClient'

export const dynamic = 'force-dynamic'

export default async function SACeklistRaporPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  return (
    <div>
      <Topbar
        title="Çeklist Raporları"
        base="/sa"
        breadcrumbs={[
          { label: 'Yönetim' },
          { label: 'Rapor Merkezi', href: '/sa/dashboard/raporlar' },
          { label: 'Çeklist Raporları' },
        ]}
      />
      <CeklistRaporlariClient base="/sa" />
    </div>
  )
}
