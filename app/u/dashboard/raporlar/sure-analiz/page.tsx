import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SureAnalizClient from '@/components/reports/SureAnalizClient'
import Topbar from '@/components/layout/Topbar'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function URaporlarSureAnalizPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'raporlar', (me as any).firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard')

  if (!me.proje_id) return (
    <div>
      <Topbar title="Süre Analiz Raporları" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Raporlar', href: '/u/dashboard/raporlar' }, { label: 'Süre Analiz Raporları' }]} />
      <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>Bu hesap bir projeye bağlı değil.</div>
    </div>
  )

  return (
    <SureAnalizClient
      base="/u"
      isSA={false}
      tenantFirmaId={me.firma_id ?? null}
      projeId={me.proje_id}
    />
  )
}
