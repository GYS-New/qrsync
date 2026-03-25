import { createClient, createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import { redirect } from 'next/navigation'
import GrupYetkileriClient from '@/components/ayarlar/GrupYetkileriClient'

export const dynamic = 'force-dynamic'

export default async function GrupYetkileriPage({ searchParams }: { searchParams: { firma_id?: string } }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  const admin = createAdminClient()

  // Firma listesi - SA firmaları seçebilir
  const { data: firmalar } = await admin
    .from('firmalar')
    .select('id,firma_adi,ticari_unvan')
    .eq('aktif', true)
    .order('ticari_unvan')

  // Seçili firma veya global
  const secilenFirmaId = searchParams.firma_id || null

  let q = admin.from('kullanici_grubu_yetkileri').select('*').order('rol').order('sayfa_kodu')
  q = secilenFirmaId ? q.eq('firma_id', secilenFirmaId) : q.is('firma_id', null)

  const { data: yetkileri } = await q

  // Firma bazlı kayıt yoksa global kayıtları başlangıç değeri olarak göster
  let initialYetkileri = yetkileri ?? []
  if (secilenFirmaId && initialYetkileri.length === 0) {
    const { data: global } = await admin
      .from('kullanici_grubu_yetkileri')
      .select('*')
      .is('firma_id', null)
      .order('rol')
      .order('sayfa_kodu')
    initialYetkileri = (global ?? []).map((y: any) => ({ ...y, firma_id: secilenFirmaId }))
  }

  return (
    <div>
      <Topbar
        title="Kullanıcı Grubu Yetkileri"
        base="/sa"
        breadcrumbs={[{ label: 'Sistem' }, { label: 'Ayarlar' }, { label: 'Kullanıcı Grubu Yetkileri' }]}
      />
      <GrupYetkileriClient
        initialYetkileri={initialYetkileri as any}
        firmaId={secilenFirmaId}
        apiEndpoint="/api/sa/grup-yetkileri"
        firmalar={(firmalar as any) ?? []}
        currentPath="/sa/dashboard/ayarlar/kullanici-grubu-yetkileri"
      />
    </div>
  )
}
