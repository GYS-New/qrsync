import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ReportsHubClient from '@/components/reports/ReportsHubClient'
import Topbar from '@/components/layout/Topbar'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TARaporlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const aktifProje = await getAktifProje(me.firma_id ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Raporlar" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Raporlar' }]} />
      <ProjeSecilmedi />
    </div>
  )

  const { data: firma } = me.firma_id
    ? await supabase.from('firmalar').select('firma_adi,ticari_unvan').eq('id', me.firma_id).single()
    : { data: null }
  const firmaAdi = firma?.firma_adi || firma?.ticari_unvan || null

  // Rapor türlerini SSR'da çek — client fetch gereksiz
  const admin = createAdminClient()
  const RAPOR_TURLERI_IDS = ['ham_veri', 'grafiksel', 'rapor_ozellestir', 'sure_analiz', 'musteri_degerlendirme']
  let initialRaporTurleri: any[] = []

  if (me.firma_id) {
    const { data: dbTurler } = await admin
      .from('firma_rapor_turleri')
      .select('*')
      .eq('firma_id', me.firma_id)

    if (!dbTurler || dbTurler.length === 0) {
      // İlk kez: tüm türleri aktifl olarak oluştur
      const { data: yeni } = await admin
        .from('firma_rapor_turleri')
        .insert(RAPOR_TURLERI_IDS.map(id => ({
          firma_id: me.firma_id,
          rapor_turu: id,
          aktif: true,
          olusturan_id: me.id,
          guncelleyen_id: me.id,
        })))
        .select()
      initialRaporTurleri = (yeni ?? []).filter((r: any) => r.aktif !== false).map((r: any) => ({ id: r.rapor_turu, aktif: r.aktif }))
    } else {
      initialRaporTurleri = dbTurler.filter((r: any) => r.aktif !== false).map((r: any) => ({ id: r.rapor_turu, aktif: r.aktif }))
    }
  }

  return <ReportsHubClient base="/ta" initialFirmaId={me.firma_id ?? null} isSA={false} firmaAdi={firmaAdi} initialRaporTurleri={initialRaporTurleri} />
}
