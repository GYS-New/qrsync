/**
 * İptal sebebi (manuel görev iptali) validation.
 *
 * Hem mobil API endpoint'i (/api/app/gorev-iptal) hem web (CanliIslemlerClient.handleIptal)
 * tarafından kullanılır — junk girişleri (".....", "aaaa", sadece boşluk vs.) engeller.
 *
 * Kurallar:
 *   - Trim sonrası uzunluk: 5 — 500 karakter
 *   - En az 3 farklı karakter (".....", "aaaaaa" tipi tek-karakter spam'i engeller)
 *   - En az bir harf veya rakam içermeli (sadece noktalama/boşluk olmasın)
 */

const MIN_UZUNLUK = 5
const MAX_UZUNLUK = 500
const MIN_FARKLI_KARAKTER = 3

const HARF_RAKAM_RE = /[a-zçğıöşüA-ZÇĞİIÖŞÜ0-9]/

export type IptalSebepHata =
  | { ok: true; sebep: string }
  | { ok: false; mesaj: string; kod: 'IPTAL_SEBEP_BOS' | 'IPTAL_SEBEP_KISA' | 'IPTAL_SEBEP_UZUN' | 'IPTAL_SEBEP_GECERSIZ' }

export function iptalSebepKontrol(input: unknown): IptalSebepHata {
  const sebep = typeof input === 'string' ? input.trim() : ''

  if (!sebep) {
    return { ok: false, kod: 'IPTAL_SEBEP_BOS', mesaj: 'İptal sebebi zorunlu.' }
  }
  if (sebep.length < MIN_UZUNLUK) {
    return { ok: false, kod: 'IPTAL_SEBEP_KISA', mesaj: `İptal sebebi en az ${MIN_UZUNLUK} karakter olmalı.` }
  }
  if (sebep.length > MAX_UZUNLUK) {
    return { ok: false, kod: 'IPTAL_SEBEP_UZUN', mesaj: `İptal sebebi en fazla ${MAX_UZUNLUK} karakter olabilir.` }
  }

  const farkliKarakterSayisi = new Set(sebep.toLocaleLowerCase('tr')).size
  if (farkliKarakterSayisi < MIN_FARKLI_KARAKTER) {
    return {
      ok: false,
      kod: 'IPTAL_SEBEP_GECERSIZ',
      mesaj: 'Geçerli bir iptal sebebi girin (örn. "ekipman arızası", "personel yetişemedi"). Tekrar eden karakter veya nokta dizisi kabul edilmez.',
    }
  }

  if (!HARF_RAKAM_RE.test(sebep)) {
    return {
      ok: false,
      kod: 'IPTAL_SEBEP_GECERSIZ',
      mesaj: 'İptal sebebi en az bir harf veya rakam içermelidir.',
    }
  }

  return { ok: true, sebep }
}
