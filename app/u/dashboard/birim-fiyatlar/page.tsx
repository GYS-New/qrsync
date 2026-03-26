import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import BirimFiyatlarClient from '@/components/birim-fiyatlar/BirimFiyatlarClient'
import { sayfaGorebilirMi, sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function UBirimFiyatlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'birim-fiyatlar', me.firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard')

  if (!me.proje_id) {
    return (
      <div>
        <Topbar title="Birim Fiyatlar" base="/u" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
        <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>
          <div style={{ fontSize: 13 }}>Aktif proje seçilmedi.</div>
        </div>
      </div>
    )
  }

  const admin = createAdminClient()
  const { data: proje } = await admin
    .from('projeler')
    .select('id,birim_fiyat_aktif')
    .eq('id', me.proje_id)
    .single()

  if (!proje?.birim_fiyat_aktif) {
    return (
      <div>
        <Topbar title="Birim Fiyatlar" base="/u" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
        <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Birim Fiyat Sistemi Pasif</div>
          <div style={{ fontSize: 13 }}>Bu proje için birim fiyat sistemi aktif değil.</div>
        </div>
      </div>
    )
  }

  const yetki = await sayfaYetkileri(me.rol, 'birim-fiyatlar', me.firma_id ?? null)

  return (
    <div>
      <Topbar title="Birim Fiyatlar" base="/u" breadcrumbs={[{ label: 'Birim Fiyatlar' }]} />
      <div style={{ padding: '24px 28px' }}>
        <BirimFiyatlarClient projeId={proje.id} readonly={!yetki.duzenleyebilir} />
      </div>
    </div>
  )
}
