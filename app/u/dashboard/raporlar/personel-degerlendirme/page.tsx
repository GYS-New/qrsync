import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import PersonelDegerlendirmeClient from '@/components/reports/PersonelDegerlendirmeClient'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function UPersonelDegerlendirmePage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'personel-degerlendirme-raporlari', (me as any).firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard/raporlar')

  if (!me.proje_id) return (
    <div>
      <Topbar title="Personel Değerlendirme Raporu" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Raporlar', href: '/u/dashboard/raporlar' }, { label: 'Personel Değerlendirme' }]} />
      <div style={{ padding: '48px 28px', textAlign: 'center', color: '#6b7280' }}>Bu hesap bir projeye bağlı değil.</div>
    </div>
  )

  return (
    <PersonelDegerlendirmeClient
      base="/u"
      isSA={false}
      tenantFirmaId={me.firma_id ?? null}
      projeId={me.proje_id}
    />
  )
}
