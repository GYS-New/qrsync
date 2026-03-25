import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ReportsHubClient from '@/components/reports/ReportsHubClient'
import Topbar from '@/components/layout/Topbar'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const RAPOR_TURLERI_IDS = ['ham_veri', 'grafiksel', 'ceklist', 'rapor_ozellestir', 'sure_analiz', 'musteri_degerlendirme']

export default async function URaporlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  // Yetki kontrolü
  const gorebilir = await sayfaGorebilirMi(me.rol, 'raporlar', (me as any).firma_id ?? null)
  if (!gorebilir) redirect('/u/dashboard')

  const { data: firma } = me.firma_id
    ? await supabase.from('firmalar').select('firma_adi,ticari_unvan').eq('id', me.firma_id).single()
    : { data: null }
  const firmaAdi = firma?.firma_adi || firma?.ticari_unvan || null

  const admin = createAdminClient()
  let initialRaporTurleri: { id: string; aktif: boolean }[] = []

  if (me.firma_id) {
    const { data: dbTurler } = await admin
      .from('firma_rapor_turleri')
      .select('*')
      .eq('firma_id', me.firma_id)

    if (!dbTurler || dbTurler.length === 0) {
      initialRaporTurleri = RAPOR_TURLERI_IDS.map(id => ({ id, aktif: true }))
    } else {
      const mevcutIds = new Set(dbTurler.map((r: any) => r.rapor_turu))
      const eksikIds = RAPOR_TURLERI_IDS.filter(id => !mevcutIds.has(id))
      initialRaporTurleri = [
        ...dbTurler.map((r: any) => ({ id: r.rapor_turu, aktif: r.aktif !== false })),
        ...eksikIds.map(id => ({ id, aktif: true })),
      ]
    }
  }

  // Müşteri değerlendirme yetki kontrolü
  const musteriGorebilir = await sayfaGorebilirMi(me.rol, 'musteri-degerlendirme', (me as any).firma_id ?? null)
  if (!musteriGorebilir) {
    initialRaporTurleri = initialRaporTurleri.filter((r) => r.id !== 'musteri_degerlendirme')
  }

  return (
    <ReportsHubClient
      base="/u"
      initialFirmaId={me.firma_id ?? null}
      isSA={false}
      firmaAdi={firmaAdi}
      initialRaporTurleri={initialRaporTurleri}
    />
  )
}
