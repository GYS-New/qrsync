import { createClient, createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import { redirect } from 'next/navigation'
import GrupYetkileriClient from '@/components/ayarlar/GrupYetkileriClient'

export const dynamic = 'force-dynamic'

export default async function TAGrupYetkileriPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')
  if (!me.firma_id) redirect('/ta/dashboard')

  const admin = createAdminClient()

  // Firma bazlı kayıtları çek; yoksa global kayıtları fallback olarak göster
  const { data: firmaYetkileri } = await admin
    .from('kullanici_grubu_yetkileri')
    .select('*')
    .eq('firma_id', me.firma_id)
    .in('rol', ['musteri', 'tenant_user'])
    .order('rol')
    .order('sayfa_kodu')

  // Firma bazlı hiç kayıt yoksa global kayıtları başlangıç değeri olarak kullan
  let initialYetkileri = firmaYetkileri ?? []
  if (initialYetkileri.length === 0) {
    const { data: globalYetkileri } = await admin
      .from('kullanici_grubu_yetkileri')
      .select('*')
      .is('firma_id', null)
      .in('rol', ['musteri', 'tenant_user'])
      .order('rol')
      .order('sayfa_kodu')

    // Global kayıtları firma bazlı gibi göster (firma_id override ile)
    initialYetkileri = (globalYetkileri ?? []).map((y: any) => ({
      ...y,
      firma_id: me.firma_id,
    }))
  }

  return (
    <div>
      <Topbar
        title="Kullanıcı Grubu Yetkileri"
        base="/ta"
        breadcrumbs={[{ label: 'Sistem' }, { label: 'Ayarlar' }, { label: 'Kullanıcı Grubu Yetkileri' }]}
      />
      <GrupYetkileriClient
        initialYetkileri={initialYetkileri as any}
        firmaId={me.firma_id}
        apiEndpoint="/api/ta/grup-yetkileri"
        limitRoller={['musteri', 'tenant_user']}
        gizliSayfalar={['firmalar', 'projeler']}
      />
    </div>
  )
}
