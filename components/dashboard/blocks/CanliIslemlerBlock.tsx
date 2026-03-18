import KpiCard from '@/components/dashboard/KpiCard'
import { createClient } from '@/lib/supabase/server'

export default async function CanliIslemlerBlock({ firmaId, projeId,
  isSuperAdmin,
}: {
  firmaId: string | null
  isSuperAdmin: boolean
  projeId?: string | null
}) {
  const supabase = createClient()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Online: last 2 minutes
  const onlineSince = new Date(Date.now() - 120 * 1000).toISOString()
  const firmaFilter = (q: any) => {
    let r = firmaId ? q.eq('firma_id', firmaId) : q
    if (projeId) r = r.eq('proje_id', projeId)
    return r
  }

  const [
    { count: anlikToplam },
    { count: anlikTamam },
    { count: canliToplam },
    { count: canliTamam },
    { count: kullaniciToplam },
    { count: kullaniciOnline },
    { count: lokasyonToplam },
    { count: lokasyonGorevli },
  ] = await Promise.all([
    // Anlık görevler: bugün açılan görevler
    firmaFilter(
      supabase
        .from('gorevler')
        .select('*', { count: 'exact', head: true })
        .gte('olusturma_tarihi', today.toISOString())
    ),
    // Anlık tamamlanan
    firmaFilter(
      supabase
        .from('gorevler')
        .select('*', { count: 'exact', head: true })
        .eq('durum', 'TAMAMLANDI')
        .gte('olusturma_tarihi', today.toISOString())
    ),
    // Frekansiyel görevler: bugün açılan frekansiyel görevler
    firmaFilter(
      supabase
        .from('canli_gorevler')
        .select('*', { count: 'exact', head: true })
        .gte('olusturma_tarihi', today.toISOString())
    ),
    // Canlı tamamlanan
    firmaFilter(
      supabase
        .from('canli_gorevler')
        .select('*', { count: 'exact', head: true })
        .eq('durum', 'TAMAMLANDI')
        .gte('olusturma_tarihi', today.toISOString())
    ),
    // Kullanıcılar toplam
    firmaFilter(supabase.from('users').select('*', { count: 'exact', head: true }).eq('aktif', true)),
    // Online kullanıcılar (last_seen_at)
    firmaFilter(
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('aktif', true).gte('last_seen_at', onlineSince)
    ),
    // Lokasyonlar toplam
    firmaFilter(supabase.from('lokasyonlar').select('*', { count: 'exact', head: true }).eq('aktif', true)),
    // Görevli lokasyonlar: atanan_kullanici_id dolu
    firmaFilter(
      supabase
        .from('lokasyonlar')
        .select('*', { count: 'exact', head: true })
        .eq('aktif', true)
        .not('atanan_kullanici_id', 'is', null)
    ),
  ])

  const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <KpiCard
        label="Spesifik Görevler"
        value={anlikToplam ?? 0}
        secondaryValue={anlikTamam ?? 0}
        secondaryLabel="Tamamlanan"
        icon="✓"
        iconBg="#dcf0dc"
        showToday
        percent={pct(anlikTamam ?? 0, anlikToplam ?? 0)}
      />

      <KpiCard
        label="Frekansiyel Görevler"
        value={canliToplam ?? 0}
        secondaryValue={canliTamam ?? 0}
        secondaryLabel="Tamamlanan"
        icon="⚡"
        iconBg="#dcf0dc"
        showToday
        percent={pct(canliTamam ?? 0, canliToplam ?? 0)}
      />

      <KpiCard
        label="Kullanıcılar"
        value={kullaniciToplam ?? 0}
        secondaryValue={kullaniciOnline ?? 0}
        secondaryLabel="Online"
        icon="👥"
        iconBg="#dcf0dc"
        showToday
        percent={pct(kullaniciOnline ?? 0, kullaniciToplam ?? 0)}
      />

      <KpiCard
        label="Lokasyonlar"
        value={lokasyonToplam ?? 0}
        secondaryValue={lokasyonGorevli ?? 0}
        secondaryLabel="Görevli"
        icon="📍"
        iconBg="#dcf0dc"
        showToday
        percent={pct(lokasyonGorevli ?? 0, lokasyonToplam ?? 0)}
      />
    </div>
  )
}
