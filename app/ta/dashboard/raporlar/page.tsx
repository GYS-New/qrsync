import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ReportsHubClient from '@/components/reports/ReportsHubClient'
import Topbar from '@/components/layout/Topbar'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// firma_rapor_turleri tablosundaki ID'ler alt çizgi ile — tutarlı olması için sabit liste burada
const RAPOR_TURLERI_IDS = ['ham_veri', 'grafiksel', 'ceklist', 'rapor_ozellestir', 'sure_analiz', 'musteri_degerlendirme']

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
      // İlk kez: tüm türleri aktif olarak oluştur
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
      initialRaporTurleri = (yeni ?? []).map((r: any) => ({ id: r.rapor_turu, aktif: r.aktif !== false }))
    } else {
      // DB'de kayıt var ama bazı türler eksik olabilir — eksikleri aktif ekle
      const mevcutIds = new Set(dbTurler.map((r: any) => r.rapor_turu))
      const eksikIds = RAPOR_TURLERI_IDS.filter(id => !mevcutIds.has(id))

      if (eksikIds.length > 0) {
        await admin
          .from('firma_rapor_turleri')
          .insert(eksikIds.map(id => ({
            firma_id: me.firma_id,
            rapor_turu: id,
            aktif: true,
            olusturan_id: me.id,
            guncelleyen_id: me.id,
          })))
        // Eksik olanları aktif olarak listeye ekle
        const eksikTurler = eksikIds.map(id => ({ id, aktif: true }))
        initialRaporTurleri = [
          ...dbTurler.map((r: any) => ({ id: r.rapor_turu, aktif: r.aktif !== false })),
          ...eksikTurler,
        ]
      } else {
        initialRaporTurleri = dbTurler.map((r: any) => ({ id: r.rapor_turu, aktif: r.aktif !== false }))
      }
    }
  }

  // Müşteri değerlendirme yetki kontrolü (sayfa_kodu tire ile — GrupYetkileriClient ile tutarlı)
  const musteriGorebilir = await sayfaGorebilirMi(me.rol, 'musteri-degerlendirme', (me as any).firma_id ?? null)
  if (!musteriGorebilir) {
    // Kart ID'si alt çizgi ile — ReportsHubClient ile tutarlı
    initialRaporTurleri = initialRaporTurleri.filter((r) => r.id !== 'musteri_degerlendirme')
  }

  
  // Süre analiz kartı için süreli görev durumu
  let sureliGorevAktif: boolean | undefined = undefined
  if (aktifProje) {
    const admin = createAdminClient()
    const { data: loks } = await admin
      .from('lokasyonlar')
      .select('sureli_gorev_aktif')
      .eq('proje_id', aktifProje.id)
      .eq('sureli_gorev_aktif', true)
      .limit(1)
    sureliGorevAktif = (loks?.length ?? 0) > 0
  }

return <ReportsHubClient base="/ta" initialFirmaId={me.firma_id ?? null} isSA={false} firmaAdi={firmaAdi} initialRaporTurleri={initialRaporTurleri} sureliGorevAktif={sureliGorevAktif} birimFiyatAktif={birimFiyatAktif} />
}
