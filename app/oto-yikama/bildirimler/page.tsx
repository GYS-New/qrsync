import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import BildirimlerClient from '@/components/bildirim/BildirimlerClient'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaBildirimlerPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const supabase = createClient()
  const { data: items } = await supabase
    .from('bildirimler')
    .select('*')
    .eq('alici_id', me.id)
    .order('tarih', { ascending: false })
    .limit(200)

  return (
    <div>
      <Topbar
        title="Bildirimler"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Bildirimler' }]}
        hideScopeControls hideNotifBar
      />
      <BildirimlerClient meId={me.id} initialItems={(items as any) ?? []} />
    </div>
  )
}
