import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import SistemAyarlariClient from '@/components/sistem-ayarlari/SistemAyarlariClient'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'

export const dynamic = 'force-dynamic'

export default async function TASistemAyarlariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('rol, firma_id')
    .eq('id', authUser.id)
    .single()

  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const meId = authUser.id
  const firmaId = me.firma_id as string
  const bloklar = await ensureDashboardDefaults(meId)

  const aktifProje = await getAktifProje(firmaId)
  if (!aktifProje) {
    return (
      <div>
        <Topbar
          title="Sistem Ayarları"
          base="/ta"
          breadcrumbs={[{ label: 'Sistem' }, { label: 'Sistem Ayarları' }]}
        />
        <ProjeSecilmedi />
      </div>
    )
  }

  const { data: lokasyonlar } = await supabase
    .from('lokasyonlar')
    .select('id, tanim, parent_id, aktif, hedef_sure_dakika, min_sure_dakika, max_sure_dakika')
    .eq('firma_id', firmaId)
    .eq('proje_id', aktifProje.id)
    .order('tanim', { ascending: true })

  return (
    <div>
      <Topbar
        title="Sistem Ayarları"
        base="/ta"
        breadcrumbs={[{ label: 'Sistem' }, { label: aktifProje.ad }, { label: 'Sistem Ayarları' }]}
      />
      <SistemAyarlariClient
        meId={meId}
        initialBloklar={(bloklar as any) ?? []}
        lokasyonlar={lokasyonlar ?? []}
        isSA={false}
        firmaId={firmaId}
        projeId={aktifProje.id}
      />
    </div>
  )
}
