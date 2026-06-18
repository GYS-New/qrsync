import Topbar from '@/components/layout/Topbar'
import { createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'
import ArsivClient, { type ArsivKaydi, type IstasyonOpt, type KullaniciOpt } from '@/components/oto-yikama/ArsivClient'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaArsivPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const admin = createAdminClient()
  const firmaId = await getOtoYikamaFirmaId(admin, me)

  let kayitlar: ArsivKaydi[] = []
  let istasyonlar: IstasyonOpt[] = []
  let tamamlayanlar: KullaniciOpt[] = []

  if (firmaId) {
    // Tek tablo sorgusu — plaka/hedef_tarih/durum zaten arşivde
    const { data: rows } = await admin
      .from('oto_yikama_arsiv')
      .select(`
        gorev_id, plaka_snapshot, hedef_tarih, ekstra, durum, lokasyon_id,
        olusturma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
        tamamlanma_suresi_saniye, olusturan_id, islemi_yapan_id, iptal_sebep,
        arsivleme_tarihi
      `)
      .eq('firma_id', firmaId)
      .order('hedef_tarih', { ascending: false })
      .limit(5000)
    const arr = (rows ?? []) as any[]

    const userIds = [...new Set(arr.flatMap(r => [r.olusturan_id, r.islemi_yapan_id]).filter(Boolean))] as string[]
    const lokIds = [...new Set(arr.map(r => r.lokasyon_id).filter(Boolean))] as string[]

    const [usersRes, loksRes] = await Promise.all([
      userIds.length > 0
        ? admin.from('users').select('id, isim_soyisim').in('id', userIds)
        : Promise.resolve({ data: [] as any[] }),
      lokIds.length > 0
        ? admin.from('lokasyonlar').select('id, tanim').in('id', lokIds)
        : Promise.resolve({ data: [] as any[] }),
    ])
    const userMap = new Map(((usersRes.data ?? []) as any[]).map(u => [u.id, u.isim_soyisim ?? '—']))
    const lokMap  = new Map(((loksRes.data ?? []) as any[]).map(l => [l.id, l.tanim ?? '—']))

    kayitlar = arr.map(r => {
      const isTamamlandi = r.durum === 'TAMAMLANDI'
      const isIptal      = r.durum === 'IPTAL'
      const islemKisiId  = r.islemi_yapan_id ?? null
      return {
        gorev_id:        r.gorev_id,
        plaka:           r.plaka_snapshot ?? '—',
        hedef_tarih:     r.hedef_tarih ?? null,
        ekstra:          r.ekstra === true,
        durum:           r.durum ?? null,
        istasyon:        lokMap.get(r.lokasyon_id) ?? '—',
        olusturma_tarihi: r.olusturma_tarihi ?? null,
        baslatilma_tarihi: r.baslatilma_tarihi ?? null,
        tamamlanma_tarihi: r.tamamlanma_tarihi ?? null,
        tamamlanma_suresi_saniye: r.tamamlanma_suresi_saniye ?? null,
        arsivleme_tarihi: r.arsivleme_tarihi ?? null,
        olusturan:       userMap.get(r.olusturan_id) ?? '—',
        tamamlayan:      isTamamlandi && islemKisiId ? (userMap.get(islemKisiId) ?? null) : null,
        tamamlayan_id:   isTamamlandi ? islemKisiId : null,
        iptal_eden:      isIptal && islemKisiId ? (userMap.get(islemKisiId) ?? null) : null,
        iptal_sebep:     r.iptal_sebep ?? null,
      }
    })

    // İstasyon filtresi için arşivde geçen lokasyonlar
    const istSet = new Map<string, string>()
    for (const r of arr) {
      if (r.lokasyon_id) istSet.set(r.lokasyon_id, lokMap.get(r.lokasyon_id) ?? '—')
    }
    istasyonlar = [...istSet.entries()].map(([id, tanim]) => ({ id, tanim }))
      .sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))

    // Tamamlayan dropdown
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
        title="Arşiv"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Arşiv' }]}
        hideScopeControls hideNotifBar
      />
      <div style={{ padding: '24px 28px' }}>
        {!firmaId ? (
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin.
          </div>
        ) : (
          <ArsivClient
            kayitlar={kayitlar}
            istasyonlar={istasyonlar}
            tamamlayanlar={tamamlayanlar}
          />
        )}
      </div>
    </div>
  )
}
