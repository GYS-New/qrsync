import { createAdminClient } from '@/lib/supabase/server'
import YikamaTakvimiChart from './YikamaTakvimiChart'
import { aralikPlanTahmin, type TahminArac } from '@/lib/oto-yikama/yikamaPlanTahmin'

/**
 * Yıkama Takvimi — bu hafta (Pzt-Pz) için her gün:
 *   - Planlanan (mevcut görevler ∪ araç kurallarından tahmin)
 *   - Tamamlanan (gerçek TAMAMLANDI olanlar)
 *
 * Cron ertesi günü gece 23:55'te ürettiği için gelecek günlerin metadata'sı
 * henüz yok — bu yüzden TakvimClient ile aynı pattern: aktif araç
 * kurallarından tahmini plan hesaplanır + gerçek görevlerle merge edilir.
 * (Önceden sadece metadata'ya bakıyordu → "Planlanan: 0" görünüyordu.)
 */
export default async function YikamaTakvimiBlock({ firmaId }: { firmaId: string }) {
  const admin = createAdminClient()
  const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())

  // Bu haftanın Pazartesi başlangıcı (TR konvansiyonu) — bugünden hafta başına
  // kaç gün geriye gidilecek? Pazar=0 → 6, diğerleri → dow-1.
  const bugunDt = new Date(bugun + 'T12:00:00Z')
  const dow = bugunDt.getUTCDay()
  const offset = dow === 0 ? 6 : dow - 1
  const pazartesi = new Date(bugunDt)
  pazartesi.setUTCDate(pazartesi.getUTCDate() - offset)

  const gunler: { tarih: string; gunAdi: string; etiket: string; isToday: boolean }[] = []
  const gunAdlari = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
  for (let i = 0; i < 7; i++) {
    const d = new Date(pazartesi)
    d.setUTCDate(d.getUTCDate() + i)
    const trIso = d.toISOString().slice(0, 10)
    const gunIndex = d.getUTCDay()
    gunler.push({
      tarih: trIso,
      gunAdi: gunAdlari[gunIndex],
      etiket: trIso.slice(8, 10) + '.' + trIso.slice(5, 7),
      isToday: trIso === bugun,
    })
  }
  const baslangicTarih = gunler[0].tarih
  const bitisTarih = gunler[gunler.length - 1].tarih

  // 1) Gerçek görevler — metadata + gorevler join
  // NOT: Sayac'a SADECE planli (ekstra=false, onay_durumu != ONAY_BEKLIYOR) satirlar eklenir —
  // KPI kartlari ile ayni tanim (Bugun Planli = 39). Aksi halde takvim "Planlanan 50"
  // gosterirken KPI "Planli 39" gosterip tutarsizlik olusturuyor.
  // gercekKeySet ise TUM satirlari icerir — plansiz/ekstra yikanmis arac icin ayni gunde
  // tahminin de eklenmesini engellemek icin.
  const [{ data: rows }, { data: araclar }, { data: skipRows }] = await Promise.all([
    admin
      .from('oto_yikama_gorev_metadata')
      .select('arac_id, hedef_tarih, ekstra, onay_durumu, gorev:gorevler!inner(durum, firma_id)')
      .eq('gorev.firma_id', firmaId)
      .gte('hedef_tarih', baslangicTarih)
      .lte('hedef_tarih', bitisTarih),
    // 2) Aktif araçlar — kural-bazlı tahmin için
    admin
      .from('araclar')
      .select('id, plaka, departman, varsayilan_lokasyon_id, yikama_frekans_tip, yikama_frekans_aralik, yikama_referans_tarih, yikama_gunleri, aktif')
      .eq('firma_id', firmaId)
      .eq('aktif', true),
    // 3) Skip kayıtları — takvimden 'Tümünü Sil' / bireysel iptal ile yazılır.
    // Tahmin merge'de bu (arac_id, tarih) çiftleri sayılmamalı; aksi halde
    // kullanıcı iptal etse bile grafikte hâlâ planlı görünür (2026-07-14 bug).
    admin
      .from('oto_yikama_gorev_skip')
      .select('arac_id, tarih')
      .eq('firma_id', firmaId)
      .gte('tarih', baslangicTarih)
      .lte('tarih', bitisTarih),
  ])

  // Gerçek görev key seti (arac_id|tarih) — tahminden bunları çıkar
  const gercekKeySet = new Set<string>()
  const sayac = new Map<string, { tamamlanan: number; planli: number }>()
  for (const r of (rows ?? []) as any[]) {
    if (r.arac_id) gercekKeySet.add(`${r.hedef_tarih}|${r.arac_id}`)
    // Planli tanimi: ekstra=false AND onay_durumu != 'ONAY_BEKLIYOR'
    const isPlanli = r.ekstra === false && r.onay_durumu !== 'ONAY_BEKLIYOR'
    if (!isPlanli) continue
    const e = sayac.get(r.hedef_tarih) ?? { tamamlanan: 0, planli: 0 }
    if (r.gorev?.durum === 'TAMAMLANDI') e.tamamlanan++
    e.planli++  // gerçek planli görev
    sayac.set(r.hedef_tarih, e)
  }

  // Skip seti — kullanıcı iptal ettiyse tahminden çıkar
  const skipSet = new Set<string>()
  for (const s of (skipRows ?? []) as any[]) {
    skipSet.add(`${s.tarih}|${s.arac_id}`)
  }

  // 4) Tahmini plan — gerçek olmayan günler/araçlar için (haftanın tamamı)
  const tahminAraclar = (araclar ?? []) as TahminArac[]
  const tahminler = aralikPlanTahmin(tahminAraclar, baslangicTarih, bitisTarih)
  for (const t of tahminler) {
    const key = `${t.tarih}|${t.arac_id}`
    if (gercekKeySet.has(key)) continue   // gerçek görev varsa atla
    if (skipSet.has(key)) continue         // kullanıcı iptal etmiş — atla
    const e = sayac.get(t.tarih) ?? { tamamlanan: 0, planli: 0 }
    e.planli++
    sayac.set(t.tarih, e)
  }

  const chartData = gunler.map(g => {
    const v = sayac.get(g.tarih) ?? { tamamlanan: 0, planli: 0 }
    return {
      etiketKisa: g.gunAdi,
      tarih: g.etiket,
      Planlanan:  v.planli,
      Tamamlanan: v.tamamlanan,
      isToday: g.isToday,
    }
  })

  return <YikamaTakvimiChart data={chartData} />
}
