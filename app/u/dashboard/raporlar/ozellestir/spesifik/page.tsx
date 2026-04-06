import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SpesifikRaporKarti from '@/components/reports/SpesifikRaporKarti'
import Topbar from '@/components/layout/Topbar'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function USpesifik() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'raporlar', (me as any).firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard')

  if (!me.proje_id) return (
    <div>
      <Topbar title="Spesifik Görevler Raporu" base="/u"
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Özelleştir', href: '/u/dashboard/raporlar/ozellestir' }, { label: 'Spesifik' }]} />
      <div style={{ padding: '48px 28px', textAlign: 'center', color: '#9a7b6a' }}>Bu hesap bir projeye bağlı değil.</div>
    </div>
  )

  return (
    <SpesifikRaporKarti
      base="/u"
      isSA={false}
      tenantFirmaId={me.firma_id ?? null}
      projeId={me.proje_id}
    />
  )
}
