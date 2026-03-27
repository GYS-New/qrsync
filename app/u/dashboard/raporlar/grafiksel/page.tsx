import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import QuickReportsPageClient from '@/components/reports/QuickReportsPageClient'
import Topbar from '@/components/layout/Topbar'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function URaporlarGrafikselPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'grafiksel-raporlar', (me as any).firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard/raporlar')

  if (!me.proje_id) return (
    <div>
      <Topbar title="Grafiksel Raporlar" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Raporlar', href: '/u/dashboard/raporlar' }, { label: 'Grafiksel' }]} />
      <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>Bu hesap bir projeye bağlı değil.</div>
    </div>
  )

  return (
    <QuickReportsPageClient
      base="/u"
      title="Grafiksel Raporlar"
      initialFirmaId={me.firma_id ?? null}
      isSA={false}
      projeId={me.proje_id}
    />
  )
}
