import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import SAProviders from '@/components/layout/SAProviders'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export default async function SALayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: user } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  if (!user || (user.rol !== 'super_admin' && user.rol !== 'alt_super_admin')) redirect('/login')

  const admin = createAdminClient()
  // Uygulama logosu
  const { data: konfig } = await admin.from('sistem_konfigurasyon').select('uygulama_logo_url,sidebar_logo_url').limit(1).single()
  const sidebarLogo = konfig?.sidebar_logo_url ?? null

  // Aktif proje logosu
  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  let projeLogo: string | null = null
  let projeAdi: string | null = null
  if (aktifProje) {
    const { data: prj } = await admin.from('projeler').select('ad,logo_url').eq('id', aktifProje.id).single()
    projeLogo = (prj as any)?.logo_url ?? null
    projeAdi = (prj as any)?.ad ?? null
  }

  return (
    <SAProviders>
      <div style={{ display:'flex', minHeight:'100vh', background:'#f7f9f7' }}>
        <Sidebar user={user} firma={null} sidebarLogo={sidebarLogo} projeLogo={projeLogo} projeAdi={projeAdi} />
        <div style={{ marginLeft:282, flex:1, minWidth:0, overflow:'hidden', display:'flex', flexDirection:'column', minHeight:'100vh' }}>
          {children}
        </div>
      </div>
    </SAProviders>
  )
}
