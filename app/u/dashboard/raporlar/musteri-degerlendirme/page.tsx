import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MusteriDegerlendirmeRaporClient from '@/components/reports/MusteriDegerlendirmeRaporClient'
import Topbar from '@/components/layout/Topbar'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'

export default async function URaporlarMusteriDegerlendirmePage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  // Hem raporlar hem müşteri değerlendirme yetki kontrolü
  const [raporGorebilir, musteriGorebilir] = await Promise.all([
    sayfaGorebilirMi(me.rol, 'raporlar', (me as any).firma_id ?? null),
    sayfaGorebilirMi(me.rol, 'musteri-degerlendirme', (me as any).firma_id ?? null),
  ])
  if (!raporGorebilir || !musteriGorebilir) redirect('/u/dashboard/raporlar')

  if (!me.proje_id) return (
    <div>
      <Topbar title="Müşteri Değerlendirmeleri" base="/u"
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Raporlar', href: '/u/dashboard/raporlar' }, { label: 'Müşteri Değerlendirmeleri' }]} />
      <div style={{ padding: '48px 28px', textAlign: 'center', color: '#9a7b6a' }}>Bu hesap bir projeye bağlı değil.</div>
    </div>
  )

  return (
    <MusteriDegerlendirmeRaporClient
      base="/u"
      isSA={false}
      initialFirmaId={me.firma_id ?? null}
      projeId={me.proje_id}
    />
  )
}
