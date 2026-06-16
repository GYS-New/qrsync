import Topbar from '@/components/layout/Topbar'
import { createClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'

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
        <Topbar title="Kullanıcılar" base={rolBase} breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Kullanıcılar' }]} hideScopeControls />
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

  const rolEtiket = (r: string) => ({
    super_admin: 'SA', alt_super_admin: '2.SA',
    tenant_admin: 'TA', tenant_user: 'U', musteri: 'M',
  } as any)[r] ?? r

  return (
    <div>
      <Topbar
        title="Kullanıcılar"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Kullanıcılar' }]}
        hideScopeControls
      />
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Oto Yıkama Kullanıcıları</h2>
              <p style={{ marginTop: 6, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                Oto Yıkama üst lokasyonuna atanmış personeller bu modüle erişim yetkisine sahiptir.
                Atama, GYS → Sistem Ayarları → Kullanıcı Yetkileri → Lokasyon Yetkileri'nden yapılır.
              </p>
            </div>
            <div style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 999 }}>
              {userlar?.length ?? 0} kullanıcı
            </div>
          </div>

          {(userlar?.length ?? 0) === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
              {otoUstIds.length === 0
                ? 'Bu firmada Oto Yıkama olarak işaretlenmiş üst lokasyon yok.'
                : 'Oto Yıkama lokasyonuna atanmış personel yok.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>İsim Soyisim</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>E-posta</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>Rol</th>
                    <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>Atanmış Lokasyonlar</th>
                    <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {userlar?.map((u: any) => (
                    <tr key={u.id}>
                      <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', fontWeight: 600, color: '#0f172a' }}>{u.isim_soyisim ?? '—'}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>{u.email ?? '—'}</td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                        <span style={{ background: '#f3f4f6', padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: '#374151' }}>{rolEtiket(u.rol)}</span>
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', color: '#374151' }}>
                        {(userLokMap.get(u.id) ?? []).join(', ')}
                      </td>
                      <td style={{ padding: '12px', borderBottom: '1px solid #f1f5f9', textAlign: 'center' }}>
                        {u.aktif ? (
                          <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Aktif</span>
                        ) : (
                          <span style={{ color: '#b91c1c', fontWeight: 700 }}>Pasif</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
