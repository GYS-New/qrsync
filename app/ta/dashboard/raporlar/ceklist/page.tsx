import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import CeklistRaporlariClient from '@/components/raporlar/CeklistRaporlariClient'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'

export default async function TACeklistRaporPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'ceklist-raporlari', (me as any).firma_id ?? null)
  if (!gorebilir) redirect('/ta/dashboard/raporlar')

  return (
    <div>
      <Topbar
        title="Çeklist Raporları"
        base="/ta"
        breadcrumbs={[
          { label: 'Yönetim' },
          { label: 'Rapor Merkezi', href: '/ta/dashboard/raporlar' },
          { label: 'Çeklist Raporları' },
        ]}
      />
      <CeklistRaporlariClient base="/ta" tenantFirmaId={(me as any).firma_id ?? null} />
    </div>
  )
}
