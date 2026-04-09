import KpiCard from '@/components/dashboard/KpiCard'
import { createClient } from '@/lib/supabase/server'

/** Türkiye saatiyle bugünün UTC başlangıcını döndürür (UTC+3) */
function bugunTR(): Date {
  const now = new Date()
  const trOffset = 3 * 60 * 60 * 1000
  const trNow = new Date(now.getTime() + trOffset)
  trNow.setUTCHours(0, 0, 0, 0)
  return new Date(trNow.getTime() - trOffset)
}

export default async function CanliIslemlerBlock({ firmaId, projeId, isSuperAdmin, yetkiliLokIds }: {
  firmaId: string | null
  isSuperAdmin: boolean
  projeId?: string | null
  yetkiliLokIds?: string[] | null
}) {
  const supabase = createClient()
  const today = bugunTR()
  const todayISO = today.toISOString()
  const onlineSince = new Date(Date.now() - 120 * 1000).toISOString()

  // Görev sorguları: firma + proje + lokasyon yetki filtresi
  const gf = (q: any) => {
    let r = firmaId ? q.eq('firma_id', firmaId) : q
    if (projeId) r = r.eq('proje_id', projeId)
    if (yetkiliLokIds && yetkiliLokIds.length > 0) r = r.in('lokasyon_id', yetkiliLokIds)
    return r
  }
  // Kullanıcı/Lokasyon: sadece firma filtresi
  const ff = (q: any) => firmaId ? q.eq('firma_id', firmaId) : q

  const results = await Promise.allSettled([
    // [0] Spesifik toplam bugün
    gf(supabase.from('gorevler').select('*', { count: 'exact', head: true }).gte('olusturma_tarihi', todayISO)),
    // [1] Spesifik tamamlanan bugün
    gf(supabase.from('gorevler').select('*', { count: 'exact', head: true }).eq('durum', 'TAMAMLANDI').gte('olusturma_tarihi', todayISO)),

    // [2] Frekansiyel canlı toplam bugün
    gf(supabase.from('canli_gorevler').select('*', { count: 'exact', head: true }).gte('olusturma_tarihi', todayISO)),
    // [3] Frekansiyel canlı tamamlanan bugün
    gf(supabase.from('canli_gorevler').select('*', { count: 'exact', head: true }).eq('durum', 'TAMAMLANDI').gte('olusturma_tarihi', todayISO)),

    // [4] Frekansiyel ARŞİV toplam bugün (arşive taşınanlar)
    gf(supabase.from('canli_gorevler_arsiv').select('*', { count: 'exact', head: true }).gte('olusturma_tarihi', todayISO)),
    // [5] Frekansiyel ARŞİV tamamlanan bugün
    gf(supabase.from('canli_gorevler_arsiv').select('*', { count: 'exact', head: true })
      .in('durum', ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN']).gte('olusturma_tarihi', todayISO)),

    // [6] Kullanıcılar toplam (proje filtreli)
    firmaId
      ? (projeId
          ? supabase.from('users').select('*', { count: 'exact', head: true }).eq('firma_id', firmaId).eq('proje_id', projeId).eq('aktif', true)
          : supabase.from('users').select('*', { count: 'exact', head: true }).eq('firma_id', firmaId).eq('aktif', true))
      : supabase.from('users').select('*', { count: 'exact', head: true }).eq('aktif', true),
    // [7] Online mobil kullanıcılar (device_tokens.son_kullanim son 10dk — sadece firma filtresi, proje filtresi yok)
    ff(supabase.from('device_tokens').select('user_id').eq('aktif', true).gte('son_kullanim', new Date(Date.now() - 10 * 60 * 1000).toISOString())),
    // [8] Lokasyonlar toplam (lokasyon yetki filtreli)
    (() => { let lq = supabase.from('lokasyonlar').select('*', { count: 'exact', head: true }).eq('aktif', true); if (firmaId) lq = lq.eq('firma_id', firmaId); if (yetkiliLokIds && yetkiliLokIds.length > 0) lq = lq.in('id', yetkiliLokIds); return lq })(),
    // [9] Görevli lokasyonlar — frekansiyel (bugün tüm durumlar)
    gf(supabase.from('canli_gorevler').select('lokasyon_id').gte('aktif_olma_tarihi', todayISO).limit(3000)),
    // [10] Görevli lokasyonlar — spesifik (bugün tüm durumlar)
    gf(supabase.from('gorevler').select('lokasyon_id').gte('olusturma_tarihi', todayISO).limit(3000)),
  ])

  const n = (r: PromiseSettledResult<any>): number =>
    r.status === 'fulfilled' ? (r.value?.count ?? 0) : 0

  const anlikToplam = n(results[0])
  const anlikTamam  = n(results[1])

  // Frekansiyel = canlı + arşiv (aynı görev iki tabloda olmaz, doğrudan toplanır)
  const canliToplam  = n(results[2]) + n(results[4])
  const canliTamam   = n(results[3]) + n(results[5])

  const kullaniciToplam = n(results[6])
  // Online: unique user_id sayısı (bir kullanıcının birden fazla cihazı olabilir)
  const kullaniciOnline = results[7].status === 'fulfilled' && Array.isArray(results[7].value?.data)
    ? new Set(results[7].value.data.map((r: any) => r.user_id)).size
    : 0
  const lokasyonToplam  = n(results[8])
  // Bugün görevi olan unique lokasyon sayısı (frekansiyel + spesifik birleşik)
  const lokIdSet = new Set<string>()
  if (results[9].status === 'fulfilled' && Array.isArray(results[9].value?.data))
    results[9].value.data.forEach((r: any) => r.lokasyon_id && lokIdSet.add(r.lokasyon_id))
  if (results[10].status === 'fulfilled' && Array.isArray(results[10].value?.data))
    results[10].value.data.forEach((r: any) => r.lokasyon_id && lokIdSet.add(r.lokasyon_id))
  const lokasyonGorevli = lokIdSet.size

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <KpiCard
        label="Spesifik Görevler"
        value={anlikToplam}
        secondaryValue={anlikTamam}
        secondaryLabel="Tamamlanan"
        icon="✓"
        iconBg="#e5e7eb"
        showToday
        percent={pct(anlikTamam, anlikToplam)}
      />
      <KpiCard
        label="Frekansiyel Görevler"
        value={canliToplam}
        secondaryValue={canliTamam}
        secondaryLabel="Tamamlanan"
        icon="⚡"
        iconBg="#e5e7eb"
        showToday
        percent={pct(canliTamam, canliToplam)}
      />
      <KpiCard
        label="Kullanıcılar"
        value={kullaniciToplam}
        secondaryValue={kullaniciOnline}
        secondaryLabel="Mobil Online"
        icon="👥"
        iconBg="#e5e7eb"
        percent={pct(kullaniciOnline, kullaniciToplam)}
      />
      <KpiCard
        label="Lokasyonlar"
        value={lokasyonToplam}
        secondaryValue={lokasyonGorevli}
        secondaryLabel="Görevli"
        icon="📍"
        iconBg="#e5e7eb"
        percent={pct(lokasyonGorevli, lokasyonToplam)}
      />
    </div>
  )
}
