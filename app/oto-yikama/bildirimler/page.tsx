import Topbar from '@/components/layout/Topbar'
import BildirimlerClient from '@/components/bildirim/BildirimlerClient'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Oto Yıkama → Bildirimler
 *
 * Sadece 'oto_yikama_onay' tipindeki bildirimleri listeler — GYS bildirimleri
 * bu sayfada görünmez (ATALIAN TA talebi). Tanımsız plaka onay bekleyen
 * yıkamalar için amire gelen bildirimler burada.
 */
export default async function OtoYikamaBildirimlerPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)

  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const meId = authUser.id

  const { data: items } = await supabase
    .from('bildirimler')
    .select('*')
    .eq('alici_id', meId)
    .eq('tip', 'oto_yikama_onay')
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
      <BildirimlerClient meId={meId} initialItems={(items as any) ?? []} />
    </div>
  )
}
