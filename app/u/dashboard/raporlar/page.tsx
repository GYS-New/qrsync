import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ReportsHubClient from '@/components/reports/ReportsHubClient'
import Topbar from '@/components/layout/Topbar'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const RAPOR_TURLERI_IDS = ['ham_veri', 'grafiksel', 'rapor_ozellestir', 'sure_analiz', 'musteri_degerlendirme']

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
    ? await supabase.from('firmalar').select('firma_adi,ticari_unvan,birim_fiyat_aktif').eq('id', me.firma_id).single()
    : { data: null }
  const firmaAdi = firma?.firma_adi || firma?.ticari_unvan || null
  const birimFiyatAktif = (firma as any)?.birim_fiyat_aktif === true

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

  // Rapor bazlı yetki filtresi
  const RAPOR_YETKI_MAP: Record<string, string> = {
    ham_veri: 'ham-veri-raporlari',
    grafiksel: 'grafiksel-raporlar',
    rapor_ozellestir: 'rapor-ozellestir',
    sure_analiz: 'sure-analiz-raporlari',
    musteri_degerlendirme: 'musteri-degerlendirme',
    hakedis: 'hakedis-raporu',
  }
  const raporYetkiSonuclari = await Promise.all(
    initialRaporTurleri.map(async r => ({
      ...r,
      gorebilir: RAPOR_YETKI_MAP[r.id]
        ? await sayfaGorebilirMi(me.rol, RAPOR_YETKI_MAP[r.id], (me as any).firma_id ?? null)
        : true,
    }))
  )
  initialRaporTurleri = raporYetkiSonuclari.filter(r => r.gorebilir)

  // Süre analiz kartı için süreli görev durumu
  let sureliGorevAktif: boolean | undefined = undefined
  if (me.proje_id) {
    const admin = createAdminClient()
    const { data: loks } = await admin
      .from('lokasyonlar')
      .select('sureli_gorev_aktif')
      .eq('proje_id', me.proje_id)
      .eq('sureli_gorev_aktif', true)
      .limit(1)
    sureliGorevAktif = (loks?.length ?? 0) > 0
  }

  return (
    <ReportsHubClient
      base="/u"
      initialFirmaId={me.firma_id ?? null}
      isSA={false}
      firmaAdi={firmaAdi}
      initialRaporTurleri={initialRaporTurleri}
      sureliGorevAktif={sureliGorevAktif}
    />
  )
}
