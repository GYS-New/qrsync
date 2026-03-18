export function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

export function normalizeEmail(value: unknown) {
  return normalizeText(value).toLowerCase()
}

export function parseBool(value: unknown, defaultValue = true) {
  const v = normalizeText(value).toLowerCase()
  if (!v) return defaultValue
  if (['1', 'true', 'evet', 'aktif', 'yes'].includes(v)) return true
  if (['0', 'false', 'hayir', 'hayır', 'pasif', 'no'].includes(v)) return false
  return defaultValue
}

export function toIsoDateTime(value: unknown): string {
  const raw = normalizeText(value)
  if (!raw) return ''

  // "YYYY-MM-DD HH:mm" veya "YYYY-MM-DD" formatı → T yoksa tarayıcı/Node UTC sanır.
  // Bu tarihlerin Türkiye saati (UTC+3) olduğunu varsayarak offset ekle.
  let normalized = raw
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw)) {
    // "2026-03-17 09:00" → "2026-03-17T09:00:00+03:00"
    normalized = raw.replace(' ', 'T')
    if (!normalized.includes('+') && !normalized.endsWith('Z')) {
      normalized = normalized.slice(0, 16) + ':00+03:00'
    }
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // Sadece tarih → gün başı Türkiye saati
    normalized = raw + 'T00:00:00+03:00'
  }

  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) throw new Error(`Geçersiz tarih: ${raw}`)
  return d.toISOString()
}
