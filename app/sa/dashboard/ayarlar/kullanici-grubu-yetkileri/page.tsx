import { createClient, createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import { redirect } from 'next/navigation'
import GrupYetkileriClient from '@/components/ayarlar/GrupYetkileriClient'

export const dynamic = 'force-dynamic'

export default async function GrupYetkileriPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol').eq('id', authUser.id).single()
  if (!me || me.rol !== 'super_admin') redirect('/sa/dashboard')

  const admin = createAdminClient()
  const { data: yetkileri } = await admin
    .from('kullanici_grubu_yetkileri')
    .select('*')
    .is('firma_id', null)
    .order('rol')
    .order('sayfa_kodu')

  return (
    <div>
      <Topbar
        title="Kullanıcı Grubu Yetkileri"
        base="/sa"
        breadcrumbs={[{ label: 'Sistem' }, { label: 'Ayarlar' }, { label: 'Kullanıcı Grubu Yetkileri' }]}
      />
      <GrupYetkileriClient initialYetkileri={(yetkileri as any) ?? []} />
    </div>
  )
}
