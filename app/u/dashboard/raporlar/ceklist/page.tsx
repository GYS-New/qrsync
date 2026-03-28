import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'

export default async function UCeklistRaporPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'ceklist-raporlari', (me as any).firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard/raporlar')

  return (
    <div>
      <Topbar
        title="Çeklist Raporları"
        base="/u"
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: '/u/dashboard/raporlar' }, { label: 'Çeklist Raporları' }]}
      />
      <div style={{ padding: 24 }}>
        <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#7a907a' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#506050', marginBottom: 8 }}>Çeklist Raporları</div>
          <div style={{ fontSize: 13 }}>Bu bölüm sonra düzenlenecek.</div>
        </div>
      </div>
    </div>
  )
}
