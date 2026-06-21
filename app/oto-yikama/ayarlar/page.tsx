import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import AyarlarClient from '@/components/ayarlar/AyarlarClient'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaAyarlarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const supabase = createClient()
  const { data: userRow } = await supabase.from('users').select('*').eq('id', me.id).single()

  return (
    <div>
      <Topbar
        title="Profil Ayarları"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Profil Ayarları' }]}
        hideScopeControls hideNotifBar hideNotifBell
      />
      <div style={{ padding: '24px 28px' }}>
        <AyarlarClient meId={me.id} initialMe={(userRow as any)} />
      </div>
    </div>
  )
}
