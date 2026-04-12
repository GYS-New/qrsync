import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import BildirimBar from '@/components/dashboard/BildirimBar'

export default async function ULayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: user } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  if (!user || (user.rol !== 'tenant_user' && user.rol !== 'musteri')) redirect('/login')
  const { data: firma } = user.firma_id
    ? await supabase.from('firmalar').select('ticari_unvan,firma_adi,logo_url,birim_fiyat_aktif').eq('id', user.firma_id).single()
    : { data: null }
  // U/M rolleri proje_id'ye bağlıdır — sidebar footer için proje adını çek
  const { data: proje } = user.proje_id
    ? await supabase.from('projeler').select('ad,logo_url').eq('id', user.proje_id).single()
    : { data: null }
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#fafafa' }}>
      <Sidebar user={user} firma={firma} projeAdi={proje?.ad ?? null} projeLogo={(proje as any)?.logo_url ?? null} birimFiyatAktifProp={(firma as any)?.birim_fiyat_aktif === true} />
      <div style={{ marginLeft: 282, flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <BildirimBar rol={user.rol} propFirmaId={user.firma_id} propProjeId={user.proje_id} />
        {children}
      </div>
    </div>
  )
}
