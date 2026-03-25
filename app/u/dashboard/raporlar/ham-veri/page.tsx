import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReportsClient from '@/components/reports/ReportsClient'
import Topbar from '@/components/layout/Topbar'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function URaporlarHamVeriPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'raporlar', (me as any).firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard')

  if (!me.proje_id) return (
    <div>
      <Topbar title="Ham Veri Raporları" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Raporlar', href: '/u/dashboard/raporlar' }, { label: 'Ham Veri' }]} />
      <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>Bu hesap bir projeye bağlı değil.</div>
    </div>
  )

  const { data: firma } = me.firma_id
    ? await supabase.from('firmalar').select('firma_adi,ticari_unvan').eq('id', me.firma_id).single()
    : { data: null }
  const firmaAdi = firma?.firma_adi || firma?.ticari_unvan || null

  return (
    <ReportsClient
      base="/u"
      title="Ham Veri Raporları"
      initialFirmaId={me.firma_id ?? null}
      isSA={false}
      firmaAdi={firmaAdi}
      projeId={me.proje_id}
    />
  )
}
