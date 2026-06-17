import Topbar from '@/components/layout/Topbar'
import { createClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import OtoYikamaKullanicilarClient, { type YikamaKullanici } from '@/components/oto-yikama/KullanicilarClient'

export const dynamic = 'force-dynamic'

/**
 * Oto Yıkama → Kullanıcılar
 *
 * Bu modüle yetkili kullanıcılar: `kullanici_lokasyon_yetkileri` üzerinden
 * Oto Yıkama üst lokasyonlarına atanmış olan personeller. Atama GYS
 * Kullanıcı Yetkileri tarafında "Lokasyon Yetkileri" sekmesinden yönetilir
 * (mevcut LokasyonYetkileriPanel).
 *
 * Read-only liste; CRUD GYS tarafında kalır.
 */
export default async function OtoYikamaKullanicilarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const supabase = createClient()
  const firmaId = isSA ? getAktifFirmaId() : me.firma_id

  if (!firmaId) {
    return (
      <div>
        <Topbar title="Kullanıcılar" base={rolBase} breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Kullanıcılar' }]} hideScopeControls hideNotifBar />
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin.
          </div>
        </div>
      </div>
    )
  }

  // 1) Oto Yıkama üst lokasyonları
  const { data: otoLoklar } = await supabase
    .from('lokasyonlar')
    .select('id, tanim')
    .eq('firma_id', firmaId)
    .eq('oto_yikama_lokasyon', true)
  const otoUstIds = (otoLoklar ?? []).map((l: any) => l.id)
  const otoLokAdMap = new Map((otoLoklar ?? []).map((l: any) => [l.id as string, l.tanim as string]))

  // 2) İki kaynak: yetki kaynağı tutarlılığı için her ikisi de dahil edilir
  //    (lib/modul/yetkiliModuller.ts ve /api/app/me ile aynı mantık)
  //    A) kullanici_lokasyon_yetkileri'nde Oto Yıkama lokasyonuna atanmış
  //    B) users.ust_lokasyon_id'si Oto Yıkama lokasyonuna işaret eden
  let kullaniciAtamalari: { user_id: string; ust_lokasyon_id: string }[] = []
  if (otoUstIds.length > 0) {
    const [yetkiRes, userByUstRes] = await Promise.all([
      supabase
        .from('kullanici_lokasyon_yetkileri')
        .select('user_id, ust_lokasyon_id')
        .eq('firma_id', firmaId)
        .in('ust_lokasyon_id', otoUstIds),
      supabase
        .from('users')
        .select('id, ust_lokasyon_id')
        .eq('firma_id', firmaId)
        .in('ust_lokasyon_id', otoUstIds),
    ])
    const birlesim = new Map<string, Set<string>>()
    for (const r of (yetkiRes.data ?? [])) {
      const set = birlesim.get(r.user_id) ?? new Set<string>()
      set.add(r.ust_lokasyon_id)
      birlesim.set(r.user_id, set)
    }
    for (const u of (userByUstRes.data ?? [])) {
      if (!u.ust_lokasyon_id) continue
      const set = birlesim.get(u.id) ?? new Set<string>()
      set.add(u.ust_lokasyon_id)
      birlesim.set(u.id, set)
    }
    for (const [user_id, ustSet] of birlesim) {
      for (const ust_lokasyon_id of ustSet) {
        kullaniciAtamalari.push({ user_id, ust_lokasyon_id })
      }
    }
  }

  // 3) Kullanıcı detayları
  const userIds = Array.from(new Set(kullaniciAtamalari.map(a => a.user_id)))
  const { data: userlar } = userIds.length > 0
    ? await supabase
        .from('users')
        .select('id, isim_soyisim, email, rol, aktif')
        .in('id', userIds)
        .order('isim_soyisim')
    : { data: [] as any[] }

  // 4) user_id → atanmış lokasyon ad listesi
  const userLokMap = new Map<string, string[]>()
  for (const a of kullaniciAtamalari) {
    const ad = otoLokAdMap.get(a.ust_lokasyon_id) ?? '—'
    const arr = userLokMap.get(a.user_id) ?? []
    arr.push(ad)
    userLokMap.set(a.user_id, arr)
  }

  // Server datası → client'ın beklediği YikamaKullanici[] formatı
  const kullanicilarPayload: YikamaKullanici[] = (userlar ?? []).map((u: any) => ({
    id: u.id,
    isim_soyisim: u.isim_soyisim ?? null,
    email: u.email ?? null,
    rol: u.rol,
    aktif: u.aktif !== false,
    atanmis_istasyonlar: userLokMap.get(u.id) ?? [],
  }))

  return (
    <div>
      <Topbar
        title="Kullanıcılar"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Kullanıcılar' }]}
        hideScopeControls hideNotifBar
      />
      <div style={{ padding: '24px 28px' }}>
        <OtoYikamaKullanicilarClient firmaId={firmaId} kullanicilar={kullanicilarPayload} />
      </div>
    </div>
  )
}
