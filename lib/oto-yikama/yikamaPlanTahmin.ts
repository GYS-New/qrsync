/**
 * Yıkama planı tahmin helper'ı — cron RPC oto_yikama_gorev_uret_ertesi_gun()
 * mantığının TypeScript karşılığı. Verilen tarih aralığı için her aktif aracın
 * hangi günlerde yıkanacağını hesaplar. Görev üretilmeyen geleceği (Aylık/Yıllık
 * takvim görünümünde) "planlı/HAZIR" olarak göstermek için kullanılır.
 *
 * Kanonik kurallar (RPC ile birebir aynı tutulmalı):
 *   HAFTALIK: yikama_gunleri içinde ISO gün (Pzt=1..Paz=7) var mı?
 *   BIHAFTA:  HAFTALIK + (target - ref) / 7 hafta farkı % aralık == 0 ve hafta_farki >= 0
 *   AYLIK:    target.gün == ref.gün (yikama_gunleri kullanılmaz) ve ay_farki >= 0
 *
 * Cron'un ön-şartı: varsayilan_lokasyon_id ve yikama_frekans_tip dolu OLMALI.
 * Aynı koşul tahminde de uygulanır — yoksa cron zaten görev üretmez.
 */

export type TahminArac = {
  id: string
  plaka: string
  departman: string | null
  varsayilan_lokasyon_id: string | null
  yikama_frekans_tip: 'HAFTALIK' | 'BIHAFTA' | 'AYLIK' | null
  yikama_frekans_aralik: number | null
  yikama_referans_tarih: string | null  // YYYY-MM-DD
  yikama_gunleri: number[] | null
  aktif: boolean
}

export type TahminPlan = {
  tarih: string             // YYYY-MM-DD
  arac_id: string
  plaka: string
  departman: string | null
  lokasyon_id: string | null
}

/** YYYY-MM-DD → Date (UTC noon — TZ saat dilimi kayması olmasın). */
function isoToDate(iso: string): Date {
  return new Date(iso + 'T12:00:00Z')
}

/** Date → YYYY-MM-DD (UTC günü baz alır — isoToDate ile simetrik). */
function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** ISO weekday: Pzt=1..Paz=7 */
function isoDow(d: Date): number {
  const g = d.getUTCDay() // 0=Paz..6=Cmt
  return g === 0 ? 7 : g
}

/** İki tarih arası tam gün farkı (UTC). */
function gunFarki(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000)
}

/**
 * Tek araç + tek tarih için "yıkanacak mı?" kontrolü.
 * Aktif değilse / lokasyon yoksa / frekans tipi yoksa → false.
 */
export function aracYikanacakMi(arac: TahminArac, tarih: Date): boolean {
  if (!arac.aktif) return false
  if (!arac.varsayilan_lokasyon_id) return false
  if (!arac.yikama_frekans_tip) return false

  const dow = isoDow(tarih)
  const gunler = arac.yikama_gunleri ?? []

  if (arac.yikama_frekans_tip === 'HAFTALIK') {
    return gunler.includes(dow)
  }

  if (arac.yikama_frekans_tip === 'BIHAFTA') {
    if (!arac.yikama_referans_tarih) return false
    if (!gunler.includes(dow)) return false
    const ref = isoToDate(arac.yikama_referans_tarih)
    const haftaFarki = Math.floor(gunFarki(tarih, ref) / 7)
    if (haftaFarki < 0) return false
    const aralik = Math.max(1, arac.yikama_frekans_aralik ?? 1)
    return haftaFarki % aralik === 0
  }

  if (arac.yikama_frekans_tip === 'AYLIK') {
    if (!arac.yikama_referans_tarih) return false
    const ref = isoToDate(arac.yikama_referans_tarih)
    const ayFarki =
      (tarih.getUTCFullYear() - ref.getUTCFullYear()) * 12 +
      (tarih.getUTCMonth() - ref.getUTCMonth())
    if (ayFarki < 0) return false
    return tarih.getUTCDate() === ref.getUTCDate()
  }

  return false
}

/**
 * Aralıktaki tüm araç-gün eşleşmelerini hesaplar.
 * Sınır içeren (start ve end dahil). YYYY-MM-DD string girer.
 */
export function aralikPlanTahmin(
  araclar: TahminArac[],
  baslangicIso: string,
  bitisIso: string,
): TahminPlan[] {
  const baslangic = isoToDate(baslangicIso)
  const bitis = isoToDate(bitisIso)
  if (bitis.getTime() < baslangic.getTime()) return []

  const sonuc: TahminPlan[] = []
  // Aktif + uygun araçları tek seferlik filtrele
  const uygunAraclar = araclar.filter(a => a.aktif && a.varsayilan_lokasyon_id && a.yikama_frekans_tip)

  const toplamGun = gunFarki(bitis, baslangic) + 1
  for (let i = 0; i < toplamGun; i++) {
    const gun = new Date(baslangic.getTime() + i * 86400000)
    const iso = dateToIso(gun)
    for (const a of uygunAraclar) {
      if (aracYikanacakMi(a, gun)) {
        sonuc.push({
          tarih: iso,
          arac_id: a.id,
          plaka: a.plaka,
          departman: a.departman,
          lokasyon_id: a.varsayilan_lokasyon_id,
        })
      }
    }
  }
  return sonuc
}
