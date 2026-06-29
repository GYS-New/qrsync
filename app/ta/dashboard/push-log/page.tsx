import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import PushLogClient from '@/components/push/PushLogClient'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function TAPushLogPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', authUser.id).single()
  const firmaId = me?.firma_id
  if (!firmaId) redirect('/login')

  const aktifProje = await getAktifProje(firmaId)
  if (!aktifProje) return (
    <div>
      <Topbar title="Push Bildirim Geçmişi" base="/ta" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Push Bildirim Geçmişi' }]} />
      <ProjeSecilmedi />
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Topbar
        title="Push Bildirim Geçmişi"
        base="/ta"
        breadcrumbs={[{ label: 'Yönetim' }, { label: aktifProje.ad }, { label: 'Push Bildirim Geçmişi' }]}
      />
      <PushLogClient firmaId={firmaId} projeId={aktifProje.id} canDelete={true} />
    </div>
  )
}
