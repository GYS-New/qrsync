import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import BildirimlerClient from '@/components/bildirim/BildirimlerClient'
import { redirect } from 'next/navigation'

export default async function UBildirimlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
const meId = authUser.id

  const { data: items } = await supabase
    .from('bildirimler')
    .select('*')
    .eq('alici_id', meId)
    .order('tarih', { ascending: false })
    .limit(200)

  return (
    <div>
      <Topbar title="Bildirimler" base="/u" breadcrumbs={[{ label:'Sistem' }, { label:'Bildirimler' }]} />
      <BildirimlerClient meId={meId} initialItems={(items as any) ?? []} />
    </div>
  )
}
