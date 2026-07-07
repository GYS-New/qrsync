import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import UcretlendirmePolitikasiClient from '@/components/ucretlendirme-politikasi/UcretlendirmePolitikasiClient'

export const dynamic = 'force-dynamic'

export default async function SAUcretlendirmePolitikasiPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) {
    redirect('/sa/dashboard')
  }

  return (
    <div>
      <Topbar
        title="GYS Ücretlendirme Politikası"
        base="/sa"
        hideScopeControls
        hideNotifBar
        breadcrumbs={[{ label: 'Sistem' }, { label: 'Ücretlendirme Politikası' }]}
      />
      <div style={{ padding: '24px 28px' }}>
        <UcretlendirmePolitikasiClient />
      </div>
    </div>
  )
}
