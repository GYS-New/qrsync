import { createClient, createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import SistemIzlemeClient from '@/components/sistem/SistemIzlemeClient'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function SASistemLoglariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/login')

  const admin = createAdminClient()
  const { data: firmalar } = await admin
    .from('firmalar')
    .select('id, firma_adi, ticari_unvan')
    .eq('aktif', true)
    .order('firma_adi')

  return (
    <div>
      <Topbar title="Sistem Logları" base="/sa" breadcrumbs={[{ label: 'Sistem' }, { label: 'Sistem Logları' }]} />
      <SistemIzlemeClient isSA={true} firmalarListesi={firmalar ?? []} showUyarilar={true} />
    </div>
  )
}
