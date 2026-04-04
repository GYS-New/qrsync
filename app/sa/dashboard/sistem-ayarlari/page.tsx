import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import SistemAyarlariClient from '@/components/sistem-ayarlari/SistemAyarlariClient'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function SASistemAyarlariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('rol')
    .eq('id', authUser.id)
    .single()

  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    redirect('/sa/dashboard')
  }

  const meId = authUser.id
  const bloklar = await ensureDashboardDefaults(meId)

  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const projeId = aktifProje?.id ?? null

  let lokasyonlar: any[] = []
  if (firmaId) {
    let q = supabase
      .from('lokasyonlar')
      .select('id, tanim, parent_id, aktif, hedef_sure_dakika, min_sure_dakika, max_sure_dakika')
      .eq('firma_id', firmaId)
      .order('tanim', { ascending: true })
    if (projeId) q = (q as any).eq('proje_id', projeId)
    const { data } = await q
    lokasyonlar = data ?? []
  }

  return (
    <div>
      <Topbar
        title="Sistem Ayarları"
        base="/sa"
        breadcrumbs={[{ label: 'Sistem' }, { label: 'Sistem Ayarları' }]}
      />
      <SistemAyarlariClient
        meId={meId}
        initialBloklar={(bloklar as any) ?? []}
        lokasyonlar={lokasyonlar}
      />
    </div>
  )
}
