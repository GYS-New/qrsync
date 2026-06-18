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
    // İki ayrı sorgu + client-side join
    // 1) Tüm metadata kayıtlarını çek
    const { data: metaAll } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('gorev_id, plaka_snapshot, hedef_tarih, ekstra')
      .order('hedef_tarih', { ascending: false })
      .limit(2000)
    const metaArr = (metaAll ?? []) as any[]
    const allGorevIds = metaArr.map(m => m.gorev_id).filter(Boolean)

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
            tamamlanma_suresi_saniye,
            olusturan_id, islemi_yapan_id, iptal_sebep
          `)
          .eq('firma_id', firmaId)
          .in('id', allGorevIds)
      : { data: [] as any[] }
    const gorevMap = new Map(((gorevlerData ?? []) as any[]).map((g: any) => [g.id, g]))

    // 3) Sadece bu firma'ya ait metadata'ları al
    const arr = metaArr.filter(m => gorevMap.has(m.gorev_id))

    const userIds = [...new Set(arr.flatMap(m => {
      const g = gorevMap.get(m.gorev_id)
      return [g?.olusturan_id, g?.islemi_yapan_id]
    }).filter(Boolean))] as string[]
    const lokIds = [...new Set(arr.map(m => gorevMap.get(m.gorev_id)?.lokasyon_id).filter(Boolean))] as string[]

    const [usersRes, loksRes] = await Promise.all([
      userIds.length > 0
        ? admin.from('users').select('id, isim_soyisim').in('id', userIds)
        : Promise.resolve({ data: [] as any[] }),
      lokIds.length > 0
        ? admin.from('lokasyonlar').select('id, tanim, parent_id').in('id', lokIds)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const userMap = new Map(((usersRes.data ?? []) as any[]).map(u => [u.id, u.isim_soyisim ?? '—']))
    const lokMap  = new Map(((loksRes.data ?? []) as any[]).map(l => [l.id, l.tanim ?? '—']))

    kayitlar = arr.map(m => {
      const g = gorevMap.get(m.gorev_id) ?? {} as any
      // islemi_yapan_id durum bağlamına göre yorumlanır
      const isTamamlandi = g.durum === 'TAMAMLANDI'
      const isIptal      = g.durum === 'IPTAL'
      const islemKisiId  = g.islemi_yapan_id ?? null
      return {
        gorev_id:        m.gorev_id,
        plaka:           m.plaka_snapshot ?? '—',
        hedef_tarih:     m.hedef_tarih ?? null,
        ekstra:          m.ekstra === true,
        durum:           g.durum ?? null,
        lokasyon_id:     g.lokasyon_id ?? null,
        istasyon:        lokMap.get(g.lokasyon_id) ?? '—',
        olusturma_tarihi: g.olusturma_tarihi ?? null,
        baslatilma_tarihi: g.baslatilma_tarihi ?? null,
        tamamlanma_tarihi: g.tamamlanma_tarihi ?? null,
        tamamlanma_suresi_saniye: g.tamamlanma_suresi_saniye ?? null,
        olusturan:       userMap.get(g.olusturan_id) ?? '—',
        tamamlayan:      isTamamlandi && islemKisiId ? (userMap.get(islemKisiId) ?? null) : null,
        tamamlayan_id:   isTamamlandi ? islemKisiId : null,
        iptal_eden:      isIptal && islemKisiId ? (userMap.get(islemKisiId) ?? null) : null,
        iptal_sebep:     g.iptal_sebep ?? null,
      }
    })
    // Hedef tarihe göre desc sırala
    kayitlar.sort((a, b) => (b.hedef_tarih ?? '').localeCompare(a.hedef_tarih ?? ''))

    // Tamamlayan dropdown'u (sadece tamamlanmışlarda görünen kişiler)
    const tamamlayanSet = new Map<string, string>()
    for (const k of kayitlar) {
      if (k.tamamlayan_id && k.tamamlayan) tamamlayanSet.set(k.tamamlayan_id, k.tamamlayan)
    }
    tamamlayanlar = [...tamamlayanSet.entries()]
      .map(([id, isim]) => ({ id, isim_soyisim: isim }))
      .sort((a, b) => a.isim_soyisim.localeCompare(b.isim_soyisim, 'tr'))
  }

  return (
    <div>
      <Topbar
        title="Görev Kayıtları"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Görev Kayıtları' }]}
        hideScopeControls hideNotifBar
      />
      <div style={{ padding: '24px 28px' }}>
        {!firmaId ? (
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin.
          </div>
        ) : (
          <GorevKayitlariClient
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
