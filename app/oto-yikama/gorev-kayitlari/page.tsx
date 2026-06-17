import Topbar from '@/components/layout/Topbar'
import { createAdminClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import GorevKayitlariClient, { type GorevKaydi } from '@/components/oto-yikama/GorevKayitlariClient'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaGorevKayitlariPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? getAktifFirmaId() : me.firma_id
  const admin = createAdminClient()

  let kayitlar: GorevKaydi[] = []

  if (firmaId) {
    const { data: rows } = await admin
      .from('oto_yikama_gorev_metadata')
      .select(`
        gorev_id, plaka_snapshot, hedef_tarih, ekstra,
        gorev:gorevler!inner(
          id, tanim, durum, firma_id, lokasyon_id,
          olusturma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
          tamamlanma_suresi_saniye,
          olusturan_id, tamamlayan_kullanici_id, iptal_eden_id, iptal_sebep
        )
      `)
      .eq('gorev.firma_id', firmaId)
      .order('hedef_tarih', { ascending: false })
      .limit(1000)
    const arr = (rows ?? []) as any[]

    const userIds = [...new Set(arr.flatMap(r => [
      r.gorev?.olusturan_id,
      r.gorev?.tamamlayan_kullanici_id,
      r.gorev?.iptal_eden_id,
    ]).filter(Boolean))] as string[]
    const lokIds = [...new Set(arr.map(r => r.gorev?.lokasyon_id).filter(Boolean))] as string[]

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

    kayitlar = arr.map(r => ({
      gorev_id:        r.gorev_id,
      plaka:           r.plaka_snapshot ?? '—',
      hedef_tarih:     r.hedef_tarih,
      ekstra:          r.ekstra === true,
      durum:           r.gorev?.durum ?? null,
      istasyon:        lokMap.get(r.gorev?.lokasyon_id) ?? '—',
      olusturma_tarihi: r.gorev?.olusturma_tarihi ?? null,
      baslatilma_tarihi: r.gorev?.baslatilma_tarihi ?? null,
      tamamlanma_tarihi: r.gorev?.tamamlanma_tarihi ?? null,
      tamamlanma_suresi_saniye: r.gorev?.tamamlanma_suresi_saniye ?? null,
      olusturan:       userMap.get(r.gorev?.olusturan_id) ?? '—',
      tamamlayan:      userMap.get(r.gorev?.tamamlayan_kullanici_id) ?? null,
      iptal_eden:      userMap.get(r.gorev?.iptal_eden_id) ?? null,
      iptal_sebep:     r.gorev?.iptal_sebep ?? null,
    }))
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
          <GorevKayitlariClient kayitlar={kayitlar} />
        )}
      </div>
    </div>
  )
}
