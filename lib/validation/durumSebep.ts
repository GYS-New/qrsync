/**
 * Manuel görev durum değişiminde girilen gerekçe validation.
 *
 * Mig 099 sonrası TÜM manuel durum değişimleri için zorunlu (sadece IPTAL değil).
 * Bu helper UI ve API katmanında ortak kullanılır.
 *
 * Kurallar iptalSebepKontrol ile aynı (kodu tek noktada tutmak için):
 *   - Trim sonrası 5-500 karakter
 *   - En az 3 farklı karakter (".....", "aaaaaa" tipi spam engeli)
 *   - En az bir harf veya rakam
 */

const MIN_UZUNLUK = 5
const MAX_UZUNLUK = 500
const MIN_FARKLI_KARAKTER = 3
const HARF_RAKAM_RE = /[a-zçğıöşüA-ZÇĞİIÖŞÜ0-9]/

export type DurumSebepHata =
  | { ok: true; sebep: string }
  | { ok: false; mesaj: string; kod: 'DURUM_SEBEP_BOS' | 'DURUM_SEBEP_KISA' | 'DURUM_SEBEP_UZUN' | 'DURUM_SEBEP_GECERSIZ' }

export function durumSebepKontrol(input: unknown): DurumSebepHata {
  const sebep = typeof input === 'string' ? input.trim() : ''

  if (!sebep) {
    return { ok: false, kod: 'DURUM_SEBEP_BOS', mesaj: 'Gerekçe zorunlu.' }
  }
  if (sebep.length < MIN_UZUNLUK) {
    return { ok: false, kod: 'DURUM_SEBEP_KISA', mesaj: `Gerekçe en az ${MIN_UZUNLUK} karakter olmalı.` }
  }
  if (sebep.length > MAX_UZUNLUK) {
    return { ok: false, kod: 'DURUM_SEBEP_UZUN', mesaj: `Gerekçe en fazla ${MAX_UZUNLUK} karakter olabilir.` }
  }

  const farkliKarakterSayisi = new Set(sebep.toLocaleLowerCase('tr')).size
  if (farkliKarakterSayisi < MIN_FARKLI_KARAKTER) {
    return {
      ok: false,
      kod: 'DURUM_SEBEP_GECERSIZ',
      mesaj: 'Geçerli bir gerekçe girin (örn. "müşteri talebiyle", "kontrol amaçlı"). Tekrar eden karakter veya nokta dizisi kabul edilmez.',
    }
  }
  if (!HARF_RAKAM_RE.test(sebep)) {
    return { ok: false, kod: 'DURUM_SEBEP_GECERSIZ', mesaj: 'Gerekçe en az bir harf veya rakam içermelidir.' }
  }
  return { ok: true, sebep }
}
