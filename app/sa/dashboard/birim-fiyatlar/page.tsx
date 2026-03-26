import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import BirimFiyatlarClient from '@/components/birim-fiyatlar/BirimFiyatlarClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function SABirimFiyatlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  const firmaId = getAktifFirmaId()
  const aktifProje = await getAktifProje(firmaId)

  if (!aktifProje) {
    return (
      <div>
        <Topbar title="Birim Fiyatlar" base="/sa" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
        <ProjeSecilmedi />
      </div>
    )
  }

  if (!aktifProje.birim_fiyat_aktif) {
    return (
      <div>
        <Topbar title="Birim Fiyatlar" base="/sa" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
        <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Birim Fiyat Sistemi Pasif</div>
          <div style={{ fontSize: 13 }}>Bu proje için birim fiyat sistemi aktif değil. Proje ayarlarından etkinleştirilebilir.</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Topbar title="Birim Fiyatlar" base="/sa" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
      <div style={{ padding: '24px 28px' }}>
        <BirimFiyatlarClient projeId={aktifProje.id} />
      </div>
    </div>
  )
}
