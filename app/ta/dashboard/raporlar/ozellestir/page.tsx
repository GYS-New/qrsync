import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TemplateReportsClient from '@/components/reports/TemplateReportsClient'
import Topbar from '@/components/layout/Topbar'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TARaporlarOzellestirPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')
  if (!await sayfaGorebilirMi(me.rol, 'rapor-ozellestir', me.firma_id ?? null)) redirect('/ta/dashboard/raporlar')

  const aktifProje = await getAktifProje(me?.firma_id ?? null)
  const { data: firmaData } = me?.firma_id
    ? await supabase.from('firmalar').select('rapor_ozellestir_aktif').eq('id', me.firma_id).single()
    : { data: null }
  if (firmaData?.rapor_ozellestir_aktif === false) {
    return (
      <div>
        <Topbar title="Rapor Özelleştir" base="/ta" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: '/ta/dashboard/raporlar' }, { label: 'Rapor Özelleştir' }]} />
        <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>Bu firma için Rapor Özelleştir özelliği aktif değil.</div>
      </div>
    )
  }
  if (!aktifProje) return (
    <div>
      <Topbar title="Rapor Özelleştir" base="/ta" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Özelleştir' }]} />
      <ProjeSecilmedi />
    </div>
  )

  return (
    <TemplateReportsClient
      base="/ta"
      isSA={false}
      tenantFirmaId={me.firma_id ?? null}
      projeId={aktifProje.id}
    />
  )
}

