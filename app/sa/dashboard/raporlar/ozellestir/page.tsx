import Topbar from '@/components/layout/Topbar'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TemplateReportsClient from '@/components/reports/TemplateReportsClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function SARaporlarOzellestirPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const { data: firmaData } = firmaId
    ? await supabase.from('firmalar').select('rapor_ozellestir_aktif').eq('id', firmaId).single()
    : { data: null }
  if (firmaData?.rapor_ozellestir_aktif === false) {
    return (
      <div>
        <Topbar title="Rapor Özelleştir" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: '/sa/dashboard/raporlar' }, { label: 'Rapor Özelleştir' }]} />
        <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a' }}>Bu firma için Rapor Özelleştir özelliği aktif değil.</div>
      </div>
    )
  }

  return (
    <TemplateReportsClient
      base="/sa"
      isSA
      projeId={aktifProje?.id ?? null}
    />
  )
}
