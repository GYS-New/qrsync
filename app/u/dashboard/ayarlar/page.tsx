import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import AyarlarClient from '@/components/ayarlar/AyarlarClient'
import { redirect } from 'next/navigation'

export default async function AyarlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
const meId = authUser.id

  const { data: me } = await supabase.from('users').select('*').eq('id', meId).single()

  return (
    <div>
      <Topbar title="Ayarlar" base="/u" breadcrumbs={[{ label: 'Sistem' }, { label: 'Ayarlar' }]} />
      <div style={{ padding: '24px 28px' }}>
        <AyarlarClient meId={meId} initialMe={(me as any)} />
      </div>
    </div>
  )
}
