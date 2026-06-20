import { createAdminClient } from '@/lib/supabase/server'
import YikamaTakvimiChart from './YikamaTakvimiChart'

/**
 * Yıkama Takvimi — bugün dahil önümüzdeki 7 gün için her gün:
 *   - planlı (toplam görev sayısı)
 *   - tamamlanan
 * Recharts stacked bar chart ile görsel.
 *
 * Server'da veri çek + client'a prop geçir (chart Recharts client comp).
 */
export default async function YikamaTakvimiBlock({ firmaId }: { firmaId: string }) {
  const admin = createAdminClient()
  const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())

  // 7 günü önceden hesapla
  const trMs = Date.now()
  const gunler: { tarih: string; gunAdi: string; etiket: string; isToday: boolean }[] = []
  const gunAdlari = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
  for (let i = 0; i < 7; i++) {
    const d = new Date(trMs + i * 86400000)
    const trIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d)
    const gunIndex = new Date(trIso + 'T12:00:00Z').getUTCDay()
    gunler.push({
      tarih: trIso,
      gunAdi: gunAdlari[gunIndex],
      etiket: trIso.slice(8, 10) + '.' + trIso.slice(5, 7),
      isToday: trIso === bugun,
    })
  }
  const bitisTarih = gunler[gunler.length - 1].tarih

  // Tek sorguda 7 günün planlarını çek
  const { data: rows } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('hedef_tarih, gorev:gorevler!inner(durum, firma_id)')
    .eq('gorev.firma_id', firmaId)
    .gte('hedef_tarih', bugun)
    .lte('hedef_tarih', bitisTarih)

  // Tarih → { tamamlanan, kalan }
  const sayac = new Map<string, { tamamlanan: number; kalan: number }>()
  for (const r of (rows ?? []) as any[]) {
    const e = sayac.get(r.hedef_tarih) ?? { tamamlanan: 0, kalan: 0 }
    if (r.gorev?.durum === 'TAMAMLANDI') e.tamamlanan++
    else e.kalan++
    sayac.set(r.hedef_tarih, e)
  }

  const chartData = gunler.map(g => {
    const v = sayac.get(g.tarih) ?? { tamamlanan: 0, kalan: 0 }
    return {
      etiketKisa: g.gunAdi,
      tarih: g.etiket,
      Planlanan:  v.tamamlanan + v.kalan,  // toplam = tamamlanan + henüz kalan
      Tamamlanan: v.tamamlanan,
      isToday: g.isToday,
    }
  })

  return <YikamaTakvimiChart data={chartData} />
}
