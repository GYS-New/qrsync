import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import PushLogClient from '@/components/push/PushLogClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'

export default async function UPushLogPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me) redirect('/login')
  if (!me.firma_id) redirect('/login')

  // Yetki: push-log sayfasını görebilir mi?
  const yetki = await sayfaYetkileri(me.rol, 'push-log', me.firma_id)
  if (!yetki.gorebilir) redirect('/u/dashboard')

  return (
    <div>
      <Topbar title="Push Bildirim Geçmişi" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Push Bildirim Geçmişi' }]} />
      <PushLogClient firmaId={me.firma_id} projeId={me.proje_id ?? null} />
    </div>
  )
}
