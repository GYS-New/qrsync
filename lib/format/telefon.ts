/**
 * Türkiye telefon numarası standartlaştırma.
 *
 * Hedef format: "0 5XX XXX XX XX" (15 karakter, başında 0 + 4 grup)
 * - Kullanıcı ne yazarsa yazsın rakamları çıkartıp formatlar
 * - Mid-typing'i bozmaz: kısmi input için ne kadar varsa o kadar formatlar
 * - +90 prefix'ini otomatik temizler
 * - 10 haneli (sıfırsız) girilirse başına 0 ekler
 *
 * Boş/null/undefined için '' döner — caller TELEFON_DEFAULT'a düşmek isterse kendi karar verir.
 */

export const TELEFON_DEFAULT = '0 555 555 55 55'

export function formatTelefon(raw: string | null | undefined): string {
  if (!raw) return ''
  let digits = String(raw).replace(/\D/g, '')

  // +90 / 90 prefix temizle (uzun versiyon: 12+ hane)
  if (digits.length > 10 && digits.startsWith('90')) {
    digits = digits.slice(2)
  }

  // 10 haneli (5XXXXXXXXX) ise başına 0 ekle
  if (digits.length === 10 && !digits.startsWith('0')) {
    digits = '0' + digits
  }

  // Maksimum 11 hane (0 5XX XXX XX XX = 11 rakam)
  digits = digits.slice(0, 11)

  // Format: 0 XXX XXX XX XX (gruplar: 1-3-3-2-2)
  let out = ''
  if (digits.length > 0) out = digits.slice(0, 1)
  if (digits.length > 1) out += ' ' + digits.slice(1, 4)
  if (digits.length > 4) out += ' ' + digits.slice(4, 7)
  if (digits.length > 7) out += ' ' + digits.slice(7, 9)
  if (digits.length > 9) out += ' ' + digits.slice(9, 11)

  return out
}

/**
 * Kayıt için telefonu hazırla:
 *  - Boş gelirse TELEFON_DEFAULT döner
 *  - Dolu gelirse formatTelefon uygulanır
 *
 * Backend create/update endpoint'lerinde kullanılır.
 */
export function normalizeTelefonForSave(raw: string | null | undefined): string {
  const formatted = formatTelefon(raw)
  return formatted || TELEFON_DEFAULT
}
