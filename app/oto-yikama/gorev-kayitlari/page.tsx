import Topbar from '@/components/layout/Topbar'
import { createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'
import GorevKayitlariClient, { type GorevKaydi, type IstasyonOpt, type KullaniciOpt } from '@/components/oto-yikama/GorevKayitlariClient'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaGorevKayitlariPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const admin = createAdminClient()
  const firmaId = await getOtoYikamaFirmaId(admin, me)

  let kayitlar: GorevKaydi[] = []
  let istasyonlar: IstasyonOpt[] = []
  let tamamlayanlar: KullaniciOpt[] = []
  let canEdit = false

  if (firmaId) {
    // Düzenleme/silme yetkisi: SA + TA
    canEdit = ['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)

    // Oto Yıkama istasyonları (lokasyon edit modal'ı için dropdown — alt lokasyonlar)
    const otoUstIds = await getOtoYikamaLokasyonIds(admin as any, firmaId)
    if (otoUstIds.size > 0) {
      const { data: istLoks } = await admin
        .from('lokasyonlar')
        .select('id, tanim, parent_id')
        .eq('firma_id', firmaId)
        .eq('aktif', true)
        .in('parent_id', [...otoUstIds])
        .order('tanim')
      istasyonlar = (istLoks ?? []).map((l: any) => ({ id: l.id, tanim: l.tanim }))
    }

    // İki ayrı sorgu + client-side join — PostgREST nested embed'i bu tabloda
    // (FK relationship cache nedeniyle) güvenilir değil.
    // 1) Tüm metadata kayıtlarını çek (arac_id de — departman/yikama_gunleri için)
    const { data: metaAll } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('gorev_id, arac_id, plaka_snapshot, hedef_tarih, ekstra, km, notlar')
      .order('hedef_tarih', { ascending: false })
      .limit(2000)
    const metaArr = (metaAll ?? []) as any[]
    const allGorevIds = metaArr.map(m => m.gorev_id).filter(Boolean)
    const allAracIds = [...new Set(metaArr.map(m => m.arac_id).filter(Boolean))] as string[]

    // 2) Firma scope'lu gorevler — yalnız metadata'lı olanlar
    // NOT: gorevler tablosunda tamamlayan/iptal_eden için ayrı kolon yok;
    //      durum değişimini yapan kişi islemi_yapan_id'de tutuluyor.
    //      TAMAMLANDI → tamamlayan, IPTAL → iptal eden olarak yorumlanır.
    const { data: gorevlerData } = allGorevIds.length > 0
      ? await admin
          .from('gorevler')
          .select(`
            id, tanim, durum, firma_id, lokasyon_id,
            olusturma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
            tamamlanma_suresi_saniye, durum_degisim_tarihi,
            olusturan_id, islemi_yapan_id, baslatan_kullanici_id,
            iptal_sebep, durum_sebep
          `)
          .eq('firma_id', firmaId)
          .in('id', allGorevIds)
      : { data: [] as any[] }
    const gorevMap = new Map(((gorevlerData ?? []) as any[]).map((g: any) => [g.id, g]))

    // 3) Sadece bu firma'ya ait metadata'ları al
    const arr = metaArr.filter(m => gorevMap.has(m.gorev_id))

    const userIds = [...new Set(arr.flatMap(m => {
      const g = gorevMap.get(m.gorev_id)
      return [g?.olusturan_id, g?.islemi_yapan_id, g?.baslatan_kullanici_id]
    }).filter(Boolean))] as string[]
    const lokIds = [...new Set(arr.map(m => gorevMap.get(m.gorev_id)?.lokasyon_id).filter(Boolean))] as string[]

    const [usersRes, loksRes, araclarRes] = await Promise.all([
      userIds.length > 0
        ? admin.from('users').select('id, isim_soyisim').in('id', userIds)
        : Promise.resolve({ data: [] as any[] }),
      lokIds.length > 0
        ? admin.from('lokasyonlar').select('id, tanim, parent_id').in('id', lokIds)
        : Promise.resolve({ data: [] as any[] }),
      allAracIds.length > 0
        ? admin.from('araclar').select('id, departman, yikama_gunleri, kullanici_adi_soyadi').in('id', allAracIds)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const userMap = new Map(((usersRes.data ?? []) as any[]).map(u => [u.id, u.isim_soyisim ?? '—']))
    const lokMap  = new Map(((loksRes.data ?? []) as any[]).map(l => [l.id, l.tanim ?? '—']))
    const aracMap = new Map(((araclarRes.data ?? []) as any[]).map(a => [a.id, a]))

    kayitlar = arr.map(m => {
      const g = gorevMap.get(m.gorev_id) ?? {} as any
      const a = aracMap.get(m.arac_id) ?? {} as any
      // İşlem yapan kişi — durum bağlamına göre:
      //   TAMAMLANDI / IPTAL / YAPILAMADI → islemi_yapan_id (terminal yapan)
      //   ISLEMDE                          → baslatan_kullanici_id (şu an çalışan)
      //   HAZIR / ACIK                     → null
      const isTamamlandi = g.durum === 'TAMAMLANDI'
      const isIptal      = g.durum === 'IPTAL'
      const isYapilamadi = g.durum === 'YAPILAMADI'
      const isIslemde    = g.durum === 'ISLEMDE'
      const islemYapanId = (isTamamlandi || isIptal || isYapilamadi)
        ? (g.islemi_yapan_id ?? null)
        : isIslemde ? (g.baslatan_kullanici_id ?? null) : null
      return {
        gorev_id:        m.gorev_id,
        plaka:           m.plaka_snapshot ?? '—',
        hedef_tarih:     m.hedef_tarih ?? null,
        ekstra:          m.ekstra === true,
        km:              m.km ?? null,
        notlar:          m.notlar ?? null,
        durum:           g.durum ?? null,
        lokasyon_id:     g.lokasyon_id ?? null,
        istasyon:        lokMap.get(g.lokasyon_id) ?? '—',
        departman:       a.departman ?? null,
        arac_kullanici:  a.kullanici_adi_soyadi ?? null,
        yikama_gunleri:  Array.isArray(a.yikama_gunleri) ? a.yikama_gunleri : [],
        olusturma_tarihi: g.olusturma_tarihi ?? null,
        baslatilma_tarihi: g.baslatilma_tarihi ?? null,
        tamamlanma_tarihi: g.tamamlanma_tarihi ?? null,
        tamamlanma_suresi_saniye: g.tamamlanma_suresi_saniye ?? null,
        olusturan:       userMap.get(g.olusturan_id) ?? '—',
        // Geri uyum: 'tamamlayan' alanı = işlem yapan (TAMAMLANDI/IPTAL/YAPILAMADI/ISLEMDE)
        tamamlayan:      islemYapanId ? (userMap.get(islemYapanId) ?? null) : null,
        tamamlayan_id:   islemYapanId,
        iptal_eden:      isIptal && islemYapanId ? (userMap.get(islemYapanId) ?? null) : null,
        iptal_sebep:     g.iptal_sebep ?? null,
        durum_sebep:     g.durum_sebep ?? null,
        durum_degisim_tarihi: g.durum_degisim_tarihi ?? null,
      }
    })
    // Geleceğe planlı henüz başlanmamış HAZIR kayıtları gizle — plan tarihi
    // gelene kadar listeyi şişirmesin. ACIK/ISLEMDE/TAMAMLANDI/IPTAL/YAPILAMADI
    // her zaman görünür; HAZIR yalnız bugün ve geçmiş tarihliler.
    const bugunTR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
    kayitlar = kayitlar.filter(k => {
      if (k.durum !== 'HAZIR') return true
      if (!k.hedef_tarih) return true
      return k.hedef_tarih <= bugunTR
    })

    // Sıralama:
    //  1) Tarih önceliği: bugün → dün → önceki günler (desc); bugünden ileri
    //     varsa (HAZIR planlı) en sona düşer.
    //  2) Aynı tarih içinde durum sırası: ISLEMDE → TAMAMLANDI → IPTAL → ACIK
    //     → diğer (HAZIR / YAPILAMADI / SILINDI).
    //  3) Aynı tarih + durum için: ISLEMDE'de baslatilma desc, TAMAMLANDI/IPTAL'de
    //     durum_degisim_tarihi desc, diğerleri olusturma_tarihi desc.
    const DURUM_SIRA: Record<string, number> = {
      ISLEMDE: 1, TAMAMLANDI: 2, IPTAL: 3, ACIK: 4, HAZIR: 5, YAPILAMADI: 6, SILINDI: 7,
    }
    function tarihRank(t: string | null): number {
      // 0 = bugün, +N = bugünden N gün geçmiş, gelecek günler 1e6+N ile en sona
      if (!t) return 1e9
      const dayMs = 86400000
      const diff = Math.round((Date.parse(bugunTR) - Date.parse(t)) / dayMs)
      return diff >= 0 ? diff : 1e6 + Math.abs(diff)
    }
    kayitlar.sort((a, b) => {
      // 1) Tarih önceliği
      const ra = tarihRank(a.hedef_tarih)
      const rb = tarihRank(b.hedef_tarih)
      if (ra !== rb) return ra - rb
      // 2) Durum sırası
      const da = DURUM_SIRA[a.durum ?? ''] ?? 99
      const db = DURUM_SIRA[b.durum ?? ''] ?? 99
      if (da !== db) return da - db
      // 3) Aynı tarih + durum: zaman sırası (yeniden eskiye)
      const ta =
        a.durum === 'ISLEMDE' ? (a.baslatilma_tarihi ?? '')
        : (a.durum === 'TAMAMLANDI' || a.durum === 'IPTAL') ? (a.tamamlanma_tarihi ?? a.olusturma_tarihi ?? '')
        : (a.olusturma_tarihi ?? '')
      const tb =
        b.durum === 'ISLEMDE' ? (b.baslatilma_tarihi ?? '')
        : (b.durum === 'TAMAMLANDI' || b.durum === 'IPTAL') ? (b.tamamlanma_tarihi ?? b.olusturma_tarihi ?? '')
        : (b.olusturma_tarihi ?? '')
      return tb.localeCompare(ta)
    })

    // 'İşlem Yapan' filtre dropdown'u — TAMAMLANDI/IPTAL/YAPILAMADI islemi
    // yapanı + ISLEMDE başlatanı kapsar (kolon mantığıyla aynı).
    const islemYapanSet = new Map<string, string>()
    for (const k of kayitlar) {
      if (k.tamamlayan_id && k.tamamlayan) islemYapanSet.set(k.tamamlayan_id, k.tamamlayan)
    }
    tamamlayanlar = [...islemYapanSet.entries()]
      .map(([id, isim]) => ({ id, isim_soyisim: isim }))
      .sort((a, b) => a.isim_soyisim.localeCompare(b.isim_soyisim, 'tr'))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Topbar
        title="Görev Kayıtları"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Görev Kayıtları' }]}
        hideScopeControls hideNotifBar      />
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {!firmaId ? (
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin.
          </div>
        ) : (
          <GorevKayitlariClient
            firmaId={firmaId}
            kayitlar={kayitlar}
            istasyonlar={istasyonlar}
            tamamlayanlar={tamamlayanlar}
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  )
}
