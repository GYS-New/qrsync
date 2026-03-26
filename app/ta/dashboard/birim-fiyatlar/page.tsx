import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import BirimFiyatlarClient from '@/components/birim-fiyatlar/BirimFiyatlarClient'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TABirimFiyatlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const yetki = await sayfaYetkileri(me.rol, 'birim-fiyatlar', me.firma_id ?? null)
  if (!yetki.gorebilir) redirect('/ta/dashboard')

  const aktifProje = await getAktifProje(me.firma_id ?? null)

  if (!aktifProje) {
    return (
      <div>
        <Topbar title="Birim Fiyatlar" base="/ta" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
        <ProjeSecilmedi />
      </div>
    )
  }

  if (!aktifProje.birim_fiyat_aktif) {
    return (
      <div>
        <Topbar title="Birim Fiyatlar" base="/ta" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
        <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Birim Fiyat Sistemi Pasif</div>
          <div style={{ fontSize: 13 }}>Bu proje için birim fiyat sistemi aktif değil.</div>
        </div>
      </div>
    )
  }

  const duzenleyebilir = yetki.duzenleyebilir

  return (
    <div>
      <Topbar title="Birim Fiyatlar" base="/ta" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
      <div style={{ padding: '24px 28px' }}>
        <BirimFiyatlarClient projeId={aktifProje.id} readonly={!duzenleyebilir} />
      </div>
    </div>
  )
}
