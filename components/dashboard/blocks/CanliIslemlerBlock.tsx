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

export default async function CanliIslemlerBlock({ firmaId, projeId, isSuperAdmin }: {
  firmaId: string | null
  isSuperAdmin: boolean
  projeId?: string | null
}) {
  const supabase = createClient()
  const today = bugunTR()
  const onlineSince = new Date(Date.now() - 120 * 1000).toISOString()

  // Görev sorguları: firma + proje filtresi
  const gorevFilter = (q: any) => {
    let r = firmaId ? q.eq('firma_id', firmaId) : q
    if (projeId) r = r.eq('proje_id', projeId)
    return r
  }
  // Kullanıcı/Lokasyon sorguları: SADECE firma filtresi
  // (proje_id bu tablolarda farklı anlam taşır, count'u bozar)
  const firmaOnly = (q: any) => firmaId ? q.eq('firma_id', firmaId) : q

  const results = await Promise.allSettled([
    gorevFilter(supabase.from('gorevler').select('*', { count: 'exact', head: true }).gte('olusturma_tarihi', today.toISOString())),
    gorevFilter(supabase.from('gorevler').select('*', { count: 'exact', head: true }).eq('durum', 'TAMAMLANDI').gte('olusturma_tarihi', today.toISOString())),
    gorevFilter(supabase.from('canli_gorevler').select('*', { count: 'exact', head: true }).gte('olusturma_tarihi', today.toISOString())),
    gorevFilter(supabase.from('canli_gorevler').select('*', { count: 'exact', head: true }).eq('durum', 'TAMAMLANDI').gte('olusturma_tarihi', today.toISOString())),
    firmaOnly(supabase.from('users').select('*', { count: 'exact', head: true }).eq('aktif', true)),
    firmaOnly(supabase.from('users').select('*', { count: 'exact', head: true }).eq('aktif', true).gte('last_seen_at', onlineSince)),
    firmaOnly(supabase.from('lokasyonlar').select('*', { count: 'exact', head: true }).eq('aktif', true)),
    firmaOnly(supabase.from('lokasyonlar').select('*', { count: 'exact', head: true }).eq('aktif', true).not('atanan_kullanici_id', 'is', null)),
  ])

  const n = (r: PromiseSettledResult<any>): number =>
    r.status === 'fulfilled' ? (r.value?.count ?? 0) : 0

  const anlikToplam     = n(results[0])
  const anlikTamam      = n(results[1])
  const canliToplam     = n(results[2])
  const canliTamam      = n(results[3])
  const kullaniciToplam = n(results[4])
  const kullaniciOnline = n(results[5])
  const lokasyonToplam  = n(results[6])
  const lokasyonGorevli = n(results[7])

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <KpiCard
        label="Spesifik Görevler"
        value={anlikToplam}
        secondaryValue={anlikTamam}
        secondaryLabel="Tamamlanan"
        icon="✓"
        iconBg="#dcf0dc"
        showToday
        percent={pct(anlikTamam, anlikToplam)}
      />
      <KpiCard
        label="Frekansiyel Görevler"
        value={canliToplam}
        secondaryValue={canliTamam}
        secondaryLabel="Tamamlanan"
        icon="⚡"
        iconBg="#dcf0dc"
        showToday
        percent={pct(canliTamam, canliToplam)}
      />
      <KpiCard
        label="Kullanıcılar"
        value={kullaniciToplam}
        secondaryValue={kullaniciOnline}
        secondaryLabel="Online"
        icon="👥"
        iconBg="#dcf0dc"
        percent={pct(kullaniciOnline, kullaniciToplam)}
      />
      <KpiCard
        label="Lokasyonlar"
        value={lokasyonToplam}
        secondaryValue={lokasyonGorevli}
        secondaryLabel="Görevli"
        icon="📍"
        iconBg="#dcf0dc"
        percent={pct(lokasyonGorevli, lokasyonToplam)}
      />
    </div>
  )
}
