import Topbar from '@/components/layout/Topbar'
import { createAdminClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import GorevKayitlariClient, { type GorevKaydi, type IstasyonOpt, type KullaniciOpt } from '@/components/oto-yikama/GorevKayitlariClient'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaGorevKayitlariPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? getAktifFirmaId() : me.firma_id
  const admin = createAdminClient()

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

    // Önce firma'nın TÜM görevlerini metadata INNER JOIN ile çek (parent=gorevler,
    // firma_id orada — Supabase'in nested .eq quirk'inden etkilenmez).
    const { data: rows } = await admin
      .from('gorevler')
      .select(`
        id, tanim, durum, firma_id, lokasyon_id,
        olusturma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
        tamamlanma_suresi_saniye,
        olusturan_id, tamamlayan_kullanici_id, iptal_eden_id, iptal_sebep,
        metadata:oto_yikama_gorev_metadata!inner(plaka_snapshot, hedef_tarih, ekstra)
      `)
      .eq('firma_id', firmaId)
      .order('olusturma_tarihi', { ascending: false })
      .limit(1000)
    const arr = (rows ?? []) as any[]

    const userIds = [...new Set(arr.flatMap(r => [
      r.olusturan_id,
      r.tamamlayan_kullanici_id,
      r.iptal_eden_id,
    ]).filter(Boolean))] as string[]
    const lokIds = [...new Set(arr.map(r => r.lokasyon_id).filter(Boolean))] as string[]

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

    kayitlar = arr.map(r => {
      // metadata embed: Supabase 1:1 select'i tekil obje veya tek elemanlı array dönebilir
      const m = Array.isArray(r.metadata) ? r.metadata[0] : r.metadata
      return {
        gorev_id:        r.id,
        plaka:           m?.plaka_snapshot ?? '—',
        hedef_tarih:     m?.hedef_tarih ?? null,
        ekstra:          m?.ekstra === true,
        durum:           r.durum ?? null,
        lokasyon_id:     r.lokasyon_id ?? null,
        istasyon:        lokMap.get(r.lokasyon_id) ?? '—',
        olusturma_tarihi: r.olusturma_tarihi ?? null,
        baslatilma_tarihi: r.baslatilma_tarihi ?? null,
        tamamlanma_tarihi: r.tamamlanma_tarihi ?? null,
        tamamlanma_suresi_saniye: r.tamamlanma_suresi_saniye ?? null,
        olusturan:       userMap.get(r.olusturan_id) ?? '—',
        tamamlayan:      userMap.get(r.tamamlayan_kullanici_id) ?? null,
        tamamlayan_id:   r.tamamlayan_kullanici_id ?? null,
        iptal_eden:      userMap.get(r.iptal_eden_id) ?? null,
        iptal_sebep:     r.iptal_sebep ?? null,
      }
    })
    // Hedef tarihe göre desc sırala (sorgu olusturma_tarihi'ne göre geldi)
    kayitlar.sort((a, b) => {
      const ta = a.hedef_tarih ?? ''
      const tb = b.hedef_tarih ?? ''
      return tb.localeCompare(ta)
    })

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
