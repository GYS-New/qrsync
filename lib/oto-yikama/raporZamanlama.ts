/**
 * Otomatik rapor mail gönderimi yardımcıları.
 *
 * Tüm hesaplamalar TR saat dilimine (Europe/Istanbul) göre yapılır.
 * Cron her 15dk'da bir kontrol edip sonraki_gonderim_tarihi <= now() ve
 * aktif=true kayıtları işler.
 */

export type TekrarTipi = 'gunluk' | 'haftalik' | 'aylik'

/**
 * Sonraki gönderim tarihini hesaplar — UTC ISO döner.
 * Tek başına ileri-tarihli bir kontrol yapar; "bugün için saat geçtiyse
 * yarına/sonraki haftaya/sonraki aya" sarar.
 *
 * @param tekrar    'gunluk' | 'haftalik' | 'aylik'
 * @param gunSecimi haftalık → [ISO gün 1..7]; aylık → [ayın günü 1..28]; gunluk → []
 * @param saat      'HH:MM' (TR)
 * @param baz       Referans tarih (varsayılan: now). Hesap bundan sonraki ilk uygun andır.
 */
export function sonrakiGonderimZamani(
  tekrar: TekrarTipi,
  gunSecimi: number[] | null | undefined,
  saat: string,
  baz: Date = new Date(),
): Date {
  const [hh, mm] = saat.split(':').map(s => parseInt(s, 10))

  // TR şu anki tarih bileşenleri
  const trParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(baz)
  const get = (t: string) => parseInt(trParts.find(p => p.type === t)?.value ?? '0', 10)
  const trYil = get('year'), trAy = get('month'), trGun = get('day')
  const trSaat = get('hour'), trDak = get('minute')

  // TR şimdi → dakika cinsinden gün içi konum
  const simdiDk = trSaat * 60 + trDak
  const hedefDk = hh * 60 + mm

  if (tekrar === 'gunluk') {
    // Bugün saat geçtiyse yarın, geçmediyse bugün
    const eklenecekGun = hedefDk > simdiDk ? 0 : 1
    return trZamaniUtcye(trYil, trAy, trGun + eklenecekGun, hh, mm)
  }

  if (tekrar === 'haftalik') {
    // gunSecimi[0] = ISO gün (1=Pzt..7=Paz)
    const hedefIsoGun = (gunSecimi && gunSecimi.length > 0 ? gunSecimi[0] : 1)
    // Bugünün ISO günü
    const bugunIsoGun = isoDow(trYil, trAy, trGun)
    let gunFarki = hedefIsoGun - bugunIsoGun
    if (gunFarki < 0) gunFarki += 7
    // Aynı gün ve saat geçtiyse → 7 gün sonra
    if (gunFarki === 0 && hedefDk <= simdiDk) gunFarki = 7
    return trZamaniUtcye(trYil, trAy, trGun + gunFarki, hh, mm)
  }

  if (tekrar === 'aylik') {
    // gunSecimi[0] = ayın günü (1..28)
    const hedefGun = Math.min(28, Math.max(1, gunSecimi && gunSecimi.length > 0 ? gunSecimi[0] : 1))
    // Bu ay hedef gün geçtiyse → sonraki ay
    let yil = trYil, ay = trAy
    if (trGun > hedefGun || (trGun === hedefGun && hedefDk <= simdiDk)) {
      ay += 1
      if (ay > 12) { ay = 1; yil += 1 }
    }
    return trZamaniUtcye(yil, ay, hedefGun, hh, mm)
  }

  // Fallback
  return trZamaniUtcye(trYil, trAy, trGun + 1, hh, mm)
}

/**
 * Rapor tarih aralığı (önceki periyot) — Excel için baslangic/bitis (YYYY-MM-DD, TR).
 *
 * günlük  → önceki gün
 * haftalık → önceki Pzt-Paz haftası
 * aylık   → önceki ayın tamamı
 */
export function raporAraligi(tekrar: TekrarTipi, baz: Date = new Date()): {
  baslangic: string; bitis: string; etiket: string
} {
  const trIso = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d)
  const bugun = trIso(baz)
  const [by, bm, bg] = bugun.split('-').map(Number)

  if (tekrar === 'gunluk') {
    const dun = new Date(Date.UTC(by, bm - 1, bg - 1, 12, 0, 0))
    const dunIso = trIso(dun)
    return { baslangic: dunIso, bitis: dunIso, etiket: `${fmtTrTarih(dunIso)} (günlük)` }
  }

  if (tekrar === 'haftalik') {
    // Önceki hafta Pzt-Paz (ISO standart: Pzt başlangıç)
    const bugunIsoGun = isoDow(by, bm, bg)
    // Bu haftanın Pazartesisi
    const buPzt = new Date(Date.UTC(by, bm - 1, bg - (bugunIsoGun - 1), 12, 0, 0))
    // Önceki hafta = buPzt - 7
    const oncekiPzt = new Date(buPzt.getTime() - 7 * 86400000)
    const oncekiPaz = new Date(buPzt.getTime() - 1 * 86400000)
    const ba = trIso(oncekiPzt), bi = trIso(oncekiPaz)
    return { baslangic: ba, bitis: bi, etiket: `${fmtTrTarih(ba)} – ${fmtTrTarih(bi)} (haftalık)` }
  }

  // aylik — önceki ayın tüm günleri
  let yPrev = by, mPrev = bm - 1
  if (mPrev < 1) { mPrev = 12; yPrev -= 1 }
  const ilkGun = `${yPrev}-${String(mPrev).padStart(2, '0')}-01`
  // Önceki ayın son günü = bu ayın 1 - 1
  const sonGunDate = new Date(Date.UTC(by, bm - 1, 1, 12, 0, 0))
  sonGunDate.setUTCDate(0)
  const sonGun = trIso(sonGunDate)
  const ayAd = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'][mPrev - 1]
  return { baslangic: ilkGun, bitis: sonGun, etiket: `${ayAd} ${yPrev} (aylık)` }
}

// ── Yardımcılar ─────────────────────────────────────────────

function fmtTrTarih(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/** TR (y,ay,gun,saat,dk) → UTC Date. Day overflow için Date constructor normalleştirir. */
function trZamaniUtcye(yil: number, ay: number, gun: number, saat: number, dk: number): Date {
  // TR = UTC+3 (DST yok 2016+). Yerel TR saatini UTC'ye çevir → 3 saat çıkar.
  return new Date(Date.UTC(yil, ay - 1, gun, saat - 3, dk, 0))
}

/** TR (y,ay,gun) → ISO weekday (1=Pzt..7=Paz). */
function isoDow(yil: number, ay: number, gun: number): number {
  const d = new Date(Date.UTC(yil, ay - 1, gun, 12, 0, 0))
  const g = d.getUTCDay() // 0=Paz..6=Cmt
  return g === 0 ? 7 : g
}
