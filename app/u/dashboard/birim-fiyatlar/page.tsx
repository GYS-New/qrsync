import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import BirimFiyatlarClient from '@/components/birim-fiyatlar/BirimFiyatlarClient'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function UBirimFiyatlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const yetki = await sayfaYetkileri(me.rol, 'birim-fiyatlar', me.firma_id ?? null)
  if (!yetki.gorebilir) redirect('/u/dashboard')

  if (!me.proje_id) {
    return (
      <div>
        <Topbar title="Birim Fiyatlar" base="/u" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
        <ProjeSecilmedi />
      </div>
    )
  }

  return (
    <div>
      <Topbar title="Birim Fiyatlar" base="/u" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
      <div style={{ padding: '24px 28px' }}>
        <BirimFiyatlarClient projeId={me.proje_id} readonly={!yetki.duzenleyebilir} />
      </div>
    </div>
  )
}
