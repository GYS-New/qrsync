import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import CeklistRaporlariClient from '@/components/raporlar/CeklistRaporlariClient'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'

export default async function UCeklistRaporPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'ceklist-raporlari', (me as any).firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard/raporlar')

  if (!me.proje_id) {
    return (
      <div>
        <Topbar
          title="Çeklist Raporları"
          base="/u"
          breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: '/u/dashboard/raporlar' }, { label: 'Çeklist Raporları' }]}
        />
        <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>Bu hesap bir projeye bağlı değil.</div>
      </div>
    )
  }

  return (
    <div>
      <Topbar
        title="Çeklist Raporları"
        base="/u"
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: '/u/dashboard/raporlar' }, { label: 'Çeklist Raporları' }]}
      />
      <CeklistRaporlariClient base="/u" tenantFirmaId={(me as any).firma_id ?? null} lockedProjeId={me.proje_id} />
    </div>
  )
}
