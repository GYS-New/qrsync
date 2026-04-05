import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import SAProviders from '@/components/layout/SAProviders'

export default async function SALayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: user } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  if (!user || (user.rol !== 'super_admin' && user.rol !== 'alt_super_admin')) redirect('/login')

  // Uygulama logosu
  const admin = createAdminClient()
  const { data: konfig } = await admin.from('sistem_konfigurasyon').select('uygulama_logo_url').limit(1).single()
  const uygulamaLogo = konfig?.uygulama_logo_url ?? null

  return (
    <SAProviders>
      <div style={{ display:'flex', minHeight:'100vh', background:'#f7f9f7' }}>
        <Sidebar user={user} firma={null} uygulamaLogo={uygulamaLogo} />
        <div style={{ marginLeft:282, flex:1, minWidth:0, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:'100vh' }}>
          {children}
        </div>
      </div>
    </SAProviders>
  )
}
