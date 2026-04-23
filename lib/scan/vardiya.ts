/**
 * Vardiya tespiti — firma.tum_vardiya_ayarlari + vardiya_sayisi üzerinden.
 *
 * firmalar tablosunda iki kolon var:
 *   - vardiya_sayisi: integer (1, 2, 3, 4) — firmanın kaç vardiya çalıştığı
 *   - tum_vardiya_ayarlari: JSON — tüm vardiya sayıları için tanımlar
 *       {
 *         "1": [{no:1, baslangic:"08:00", bitis:"17:00"}],
 *         "2": [{no:1, baslangic:"06:00", bitis:"14:00"}, {no:2, baslangic:"14:00", bitis:"22:00"}],
 *         "3": [{no:1, baslangic:"00:00", bitis:"08:00"},
 *               {no:2, baslangic:"08:00", bitis:"16:00"},
 *               {no:3, baslangic:"16:00", bitis:"00:00"}]
 *       }
 *
 * Kullanım: Aktif (şu an içinde olunan) vardiyanın TR saatli başlangıç/bitiş
 * sınırlarını UTC ISO string olarak döndürür. canli_gorevler.aktif_olma_tarihi
 * bu aralıkta olan kayıtlar o vardiyanın görevleridir.
 *
 * Bitiş "00:00" → ertesi gün 00:00'a kadar (örn 16:00-00:00 = 16:00-24:00).
 * Sarkan vardiya (başlangıç > bitiş, örn 20:00-04:00) için başlangıç dün,
 * bitiş bugün olabilir.
 */

export type VardiyaAraligi = {
  no: number
  baslangic: string  // "HH:MM"
  bitis: string      // "HH:MM"
  baslangicISO: string  // UTC ISO
  bitisISO: string      // UTC ISO
}

type VardiyaAyarItem = { no: number; baslangic: string; bitis: string }

function parseHHMM(s: string | null | undefined): { h: number; m: number } | null {
  if (typeof s !== 'string' || !s) return null
  const [hh, mm] = s.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 24 || mm < 0 || mm >= 60) return null
  return { h: hh, m: mm }
}

/** TR bugünün YYYY-MM-DD string'i (Europe/Istanbul) */
function trDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
}

/** TR saatinde "YYYY-MM-DDTHH:MM:00+03:00" → UTC ISO */
function trToUtcIso(dateStr: string, hh: number, mm: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return new Date(`${dateStr}T${pad(hh)}:${pad(mm)}:00+03:00`).toISOString()
}

/** TR gününe gün farkı ekle (negatif = önceki gün) */
function trDateAdd(dateStr: string, daysDelta: number): string {
  const d = new Date(`${dateStr}T12:00:00+03:00`) // öğlen — DST sürprizi olmasın
  d.setUTCDate(d.getUTCDate() + daysDelta)
  return trDateStr(d)
}

/**
 * Firma ayarından aktif vardiyanın sınırlarını hesapla. Null dönerse aktif
 * vardiya bulunamadı (ayar eksik/geçersiz veya şu an hiçbir vardiya içinde değil).
 */
export function aktifVardiyaAraligi(
  vardiyaSayisi: number | null | undefined,
  tumVardiyaAyarlari: Record<string, VardiyaAyarItem[]> | null | undefined,
  now: Date = new Date(),
): VardiyaAraligi | null {
  const key = String(vardiyaSayisi ?? 0)
  const ayarlar = tumVardiyaAyarlari?.[key]
  if (!Array.isArray(ayarlar) || ayarlar.length === 0) return null

  const trBugun = trDateStr(now)
  // TR şu an (dakika cinsinden gün içinde)
  const trHHMM = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour12: false, hour: '2-digit', minute: '2-digit' })
  const [trH, trM] = trHHMM.split(':').map(Number)
  const trDakika = trH * 60 + trM

  for (const v of ayarlar) {
    const bas = parseHHMM(v.baslangic)
    const bit = parseHHMM(v.bitis)
    if (!bas || !bit) continue

    const basMin = bas.h * 60 + bas.m
    let bitMin = bit.h * 60 + bit.m
    // Bitiş 00:00 → 24:00 (ertesi gün 00:00'a kadar)
    if (bitMin === 0 && basMin !== 0) bitMin = 24 * 60

    const sarkan = bitMin < basMin  // örn 20:00-04:00

    let icerideMi = false
    let baslangicTarih = trBugun
    let bitisTarih = trBugun

    if (sarkan) {
      // Başlangıç dün olabilir, bitiş bugün olabilir (veya başlangıç bugün, bitiş yarın)
      if (trDakika >= basMin) {
        // Başlangıç bugün, bitiş yarın
        icerideMi = true
        baslangicTarih = trBugun
        bitisTarih = trDateAdd(trBugun, 1)
      } else if (trDakika < bitMin) {
        // Başlangıç dün, bitiş bugün
        icerideMi = true
        baslangicTarih = trDateAdd(trBugun, -1)
        bitisTarih = trBugun
      }
    } else {
      icerideMi = trDakika >= basMin && trDakika < bitMin
      // bitMin 24*60 ise ertesi gün 00:00
      if (bitMin === 24 * 60) bitisTarih = trDateAdd(trBugun, 1)
    }

    if (icerideMi) {
      const bitH = bitMin === 24 * 60 ? 0 : bit.h
      const bitM = bitMin === 24 * 60 ? 0 : bit.m
      return {
        no: v.no,
        baslangic: v.baslangic,
        bitis: v.bitis,
        baslangicISO: trToUtcIso(baslangicTarih, bas.h, bas.m),
        bitisISO: trToUtcIso(bitisTarih, bitH, bitM),
      }
    }
  }

  return null
}
