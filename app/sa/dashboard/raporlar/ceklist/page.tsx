import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'

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
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: '/sa/dashboard/raporlar' }, { label: 'Çeklist Raporları' }]}
      />
      <div style={{ padding: 24 }}>
        <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#7a907a' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#506050', marginBottom: 8 }}>Çeklist Raporları</div>
          <div style={{ fontSize: 13 }}>Bu bölüm sonra düzenlenecek.</div>
        </div>
      </div>
    </div>
  )
}
