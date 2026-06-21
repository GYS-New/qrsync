import Topbar from '@/components/layout/Topbar'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'
import OtoYikamaKullanicilarClient, { type YikamaKullanici } from '@/components/oto-yikama/KullanicilarClient'

export const dynamic = 'force-dynamic'

/**
 * Oto Yıkama → Kullanıcılar
 *
 * SADECE birincil atama (users.ust_lokasyon_id) ile Oto Yıkama lokasyonuna
 * atanmış personeller listelenir — yani GYS "Kullanıcılar" sayfasından
 * "Üst Lokasyon" alanına ARAÇ YIKAMA seçilmiş olanlar.
 *
 * NOT: kullanici_lokasyon_yetkileri üzerinden ek yetki verilmiş kullanıcılar
 * (TA, SA, M gibi yöneticiler veya cross-functional U'lar — örn. Mustafa
 * Yıldız) bu listede GÖSTERİLMEZ. Çünkü onlar "yıkama personeli" değil,
 * sadece görüntüleme/yönetim için ek yetki almış kişilerdir. Yıkama
 * operasyon listesi temiz kalsın.
 *
 * Read-only liste; CRUD GYS tarafında kalır.
 */
export default async function OtoYikamaKullanicilarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const supabase = createClient()
  const firmaId = await getOtoYikamaFirmaId(createAdminClient() as any, me)

  if (!firmaId) {
    return (
      <div>
        <Topbar title="Kullanıcılar" base={rolBase} breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Kullanıcılar' }]} hideScopeControls hideNotifBar hideNotifBell />
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

  // 2) SADECE users.ust_lokasyon_id ile birincil atama yapılmış kullanıcılar.
  //    kullanici_lokasyon_yetkileri (ek yetkiler) bu sayfaya dahil edilmez —
  //    bkz. dosya başındaki açıklama (yöneticiler/cross-functional kullanıcılar
  //    yıkama personeli listesini kirletmesin).
  let kullaniciAtamalari: { user_id: string; ust_lokasyon_id: string }[] = []
  if (otoUstIds.length > 0) {
    const { data: userByUstRes } = await supabase
      .from('users')
      .select('id, ust_lokasyon_id')
      .eq('firma_id', firmaId)
      .in('ust_lokasyon_id', otoUstIds)
    for (const u of (userByUstRes ?? [])) {
      if (!u.ust_lokasyon_id) continue
      kullaniciAtamalari.push({ user_id: u.id, ust_lokasyon_id: u.ust_lokasyon_id })
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
        hideScopeControls hideNotifBar hideNotifBell
      />
      <div style={{ padding: '24px 28px' }}>
        <OtoYikamaKullanicilarClient firmaId={firmaId} kullanicilar={kullanicilarPayload} />
      </div>
    </div>
  )
}
