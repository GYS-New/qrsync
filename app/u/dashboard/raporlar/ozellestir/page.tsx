import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TemplateReportsClient from '@/components/reports/TemplateReportsClient'
import Topbar from '@/components/layout/Topbar'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function URaporlarOzellestirPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'raporlar')
  if (!gorebilir) redirect('/u/dashboard')

  const { data: firmaData } = me?.firma_id
    ? await supabase.from('firmalar').select('rapor_ozellestir_aktif').eq('id', me.firma_id).single()
    : { data: null }

  if (firmaData?.rapor_ozellestir_aktif === false) {
    return (
      <div>
        <Topbar title="Rapor Özelleştir" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Raporlar', href: '/u/dashboard/raporlar' }, { label: 'Rapor Özelleştir' }]} />
        <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>Bu firma için Rapor Özelleştir özelliği aktif değil.</div>
      </div>
    )
  }

  if (!me.proje_id) return (
    <div>
      <Topbar title="Rapor Özelleştir" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Raporlar', href: '/u/dashboard/raporlar' }, { label: 'Rapor Özelleştir' }]} />
      <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>Bu hesap bir projeye bağlı değil.</div>
    </div>
  )

  return (
    <TemplateReportsClient
      base="/u"
      isSA={false}
      tenantFirmaId={me.firma_id ?? null}
      projeId={me.proje_id}
    />
  )
}
