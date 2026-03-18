import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import SuperAdminlerClient from '@/components/users/SuperAdminlerClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SASuperAdminlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()

  // Sadece super_admin erişebilir (alt_super_admin bu sayfayı göremez)
  if (!me || me.rol !== 'super_admin') {
    redirect('/sa/dashboard')
  }

  const { data: users } = await supabase
    .from('users')
    .select('*')
    .in('rol', ['super_admin', 'alt_super_admin'])
    .order('kayit_tarihi', { ascending: false })

  return (
    <div>
      <Topbar
        title="Süper Adminler"
        base="/sa"
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Süper Adminler' }]}
      />
      <SuperAdminlerClient
        initialUsers={(users as any) ?? []}
        currentUserId={authUser.id}
      />
    </div>
  )
}
