/**
 * Vardiya tespiti — verilen bir referans zamana göre (genellikle iş başı giris_saati)
 * firmanın tanımlı vardiyalarından hangisine ait olduğunu bulur.
 *
 * firmalar tablosu:
 *   - vardiya_sayisi: integer (1..4)
 *   - tum_vardiya_ayarlari: {
 *       "1": [{ no, baslangic, bitis }],
 *       "2": [ ... 2 vardiya ],
 *       "3": [ ... 3 vardiya ],
 *       "4": [ ... 4 vardiya ]
 *     }
 *
 * Kurallar (mobil ekip + Ozcan kararı, 2026-04-23):
 *   - Tolerans aralığı: [baslangic − 30 dk,  baslangic + 6 saat]
 *   - Personel vardiya öncesi en fazla 30 dk erken, en fazla 6 saat geç iş başı yapar.
 *   - İş başı saati bu aralığa düşen bir vardiya varsa → o vardiya aktif.
 *   - Birden fazla vardiyaya denk gelirse → başlangıca en yakın olan (henüz başlayan).
 *   - Hiçbir vardiyaya denk gelmezse → en yakın geçmiş başlamış vardiya (edge case fallback).
 *
 * ISO sınırları: Vardiyanın TR günündeki başlangıç/bitiş saatlerine göre UTC ISO.
 * Sarkan vardiya (örn 20:00-04:00) ve bitis "00:00" (ertesi gün 00:00) durumları
 * ayrıca ele alınır.
 */

export type VardiyaAraligi = {
  no: number
  baslangic: string
  bitis: string
  baslangicISO: string
  bitisISO: string
}

type VardiyaAyarItem = { no: number; baslangic: string; bitis: string }

function parseHHMM(s: string | null | undefined): { h: number; m: number } | null {
  if (typeof s !== 'string' || !s) return null
  const [hh, mm] = s.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 24 || mm < 0 || mm >= 60) return null
  return { h: hh, m: mm }
}

function trDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
}

function trHourMinute(d: Date): { h: number; m: number } {
  const hhmm = d.toLocaleTimeString('en-GB', {
    timeZone: 'Europe/Istanbul',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
  const [h, m] = hhmm.split(':').map(Number)
  return { h, m }
}

function trDateAdd(dateStr: string, daysDelta: number): string {
  const d = new Date(`${dateStr}T12:00:00+03:00`)
  d.setUTCDate(d.getUTCDate() + daysDelta)
  return trDateStr(d)
}

function trToUtcIso(dateStr: string, hh: number, mm: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return new Date(`${dateStr}T${pad(hh)}:${pad(mm)}:00+03:00`).toISOString()
}

/** TR günü + dakika ofseti olarak (normalize: 24:00 = sonraki gün 00:00) */
function vardiyaSiniriISO(trGunu: string, dakika: number): string {
  const gunDelta = Math.floor(dakika / (24 * 60))
  const kalan = ((dakika % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(kalan / 60)
  const m = kalan % 60
  const hedefGun = gunDelta === 0 ? trGunu : trDateAdd(trGunu, gunDelta)
  return trToUtcIso(hedefGun, h, m)
}

/**
 * İş başı (referans) tarihinden hangi vardiyada olduğumuzu belirle.
 *
 * @param vardiyaSayisi  firmalar.vardiya_sayisi
 * @param tumAyarlar     firmalar.tum_vardiya_ayarlari
 * @param referansIso    Genellikle mesai.giris_saati. Null ise şu an.
 */
export function aktifVardiyaAraligi(
  vardiyaSayisi: number | null | undefined,
  tumAyarlar: Record<string, VardiyaAyarItem[]> | null | undefined,
  referansIso?: string | null,
): VardiyaAraligi | null {
  const key = String(vardiyaSayisi ?? 0)
  const ayarlar = tumAyarlar?.[key]
  if (!Array.isArray(ayarlar) || ayarlar.length === 0) return null

  const ref = referansIso ? new Date(referansIso) : new Date()
  if (!Number.isFinite(ref.getTime())) return null

  const trGunu = trDateStr(ref)
  const trHM = trHourMinute(ref)
  const refDakika = trHM.h * 60 + trHM.m

  type Aday = {
    v: VardiyaAyarItem
    basMin: number      // Vardiya başlangıcı (TR dakika, gün içinde)
    bitMin: number      // Vardiya bitişi (normalize: 24*60 = ertesi 00:00, >24*60 = sarkan)
    basGun: number      // baslangicISO hangi gün delta? (0=bugün, -1=dün)
    bitGun: number      // bitisISO hangi gün delta?
  }

  const adaylar: Aday[] = []
  for (const v of ayarlar) {
    const bas = parseHHMM(v.baslangic)
    const bit = parseHHMM(v.bitis)
    if (!bas || !bit) continue
    const basMin = bas.h * 60 + bas.m
    let bitMin = bit.h * 60 + bit.m
    if (bitMin === 0 && basMin !== 0) bitMin = 24 * 60
    // Bitis'in başlangıçtan küçük olması sarkan vardiya demek — ertesi güne kaydır
    if (bitMin <= basMin && bitMin !== 24 * 60) bitMin += 24 * 60

    // Aday 1: Vardiya bugün başlar
    adaylar.push({ v, basMin, bitMin, basGun: 0, bitGun: bitMin >= 24 * 60 ? 1 : 0 })
    // Aday 2: Vardiya dün başlamış ve bugüne sarkmış (sarkan vardiya için)
    if (bitMin > 24 * 60 || bitMin === 24 * 60) {
      adaylar.push({ v, basMin: basMin - 24 * 60, bitMin: bitMin - 24 * 60, basGun: -1, bitGun: bitMin - 24 * 60 >= 24 * 60 ? 1 : 0 })
    }
  }

  // Tolerans: [basMin - 30, basMin + 360]
  const TOLERANS_ONCE = 30
  const TOLERANS_SONRA = 6 * 60

  const icerdekiler = adaylar.filter(a =>
    refDakika >= a.basMin - TOLERANS_ONCE && refDakika <= a.basMin + TOLERANS_SONRA
  )

  let secili: Aday | null = null
  if (icerdekiler.length > 0) {
    // Birden fazla → başlangıca en yakın olan
    icerdekiler.sort((a, b) => Math.abs(refDakika - a.basMin) - Math.abs(refDakika - b.basMin))
    secili = icerdekiler[0]
  } else {
    // Fallback: en yakın geçmiş başlamış + henüz bitmemiş vardiya
    const baslamisVeDevamEden = adaylar.filter(a => refDakika >= a.basMin && refDakika < a.bitMin)
    if (baslamisVeDevamEden.length > 0) {
      baslamisVeDevamEden.sort((a, b) => b.basMin - a.basMin) // en son başlayan önce
      secili = baslamisVeDevamEden[0]
    }
  }

  if (!secili) return null

  return {
    no: secili.v.no,
    baslangic: secili.v.baslangic,
    bitis: secili.v.bitis,
    baslangicISO: vardiyaSiniriISO(trDateAdd(trGunu, secili.basGun), secili.basMin - secili.basGun * 24 * 60),
    bitisISO: vardiyaSiniriISO(trDateAdd(trGunu, secili.bitGun), secili.bitMin - secili.bitGun * 24 * 60),
  }
}
