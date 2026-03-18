import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import SAProviders from '@/components/layout/SAProviders'

export default async function SALayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
if (!authUser) redirect('/login')
  const { data: user } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  if (!user || (user.rol !== 'super_admin' && user.rol !== 'alt_super_admin')) redirect('/login')
  return (
    <SAProviders>
      <div style={{ display:'flex', minHeight:'100vh', background:'#f7f9f7' }}>
        <Sidebar user={user} firma={null} />
        <div style={{ marginLeft:282, flex:1, display:'flex', flexDirection:'column', minHeight:'100vh' }}>
          {children}
        </div>
      </div>
    </SAProviders>
  )
}
