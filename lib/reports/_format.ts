// Genel Rapor / Detay Rapor için ortak format helper'ları.
// Tarih/saat string'lerini TR locale (UTC+3) olarak biçimlendirir.

export function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const trt = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(trt.getUTCDate())}.${pad(trt.getUTCMonth() + 1)}.${trt.getUTCFullYear()} ${pad(trt.getUTCHours())}:${pad(trt.getUTCMinutes())}`
}

export function formatTarihTR(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const trt = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(trt.getUTCDate())}.${pad(trt.getUTCMonth() + 1)}.${trt.getUTCFullYear()}`
}

export function formatSaatTR(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const trt = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(trt.getUTCHours())}:${pad(trt.getUTCMinutes())}`
}

export function formatGorevSaatleri(baslatilma?: string | null, tamamlanma?: string | null): string {
  const b = formatSaatTR(baslatilma)
  const t = formatSaatTR(tamamlanma)
  if (!b && !t) return '—'
  return `${b || '—'} - ${t || '—'}`
}

export function formatGorevSuresi(saniye?: number | null): string {
  if (saniye == null || saniye <= 0) return '—'
  if (saniye < 60) return `${saniye} sn`
  const dk = saniye / 60
  if (dk < 60) return `${dk.toFixed(1)} dk`
  const saat = Math.floor(dk / 60)
  const kalanDk = Math.round(dk % 60)
  return kalanDk > 0 ? `${saat} sa ${kalanDk} dk` : `${saat} sa`
}

export function tsMs(value?: string | null): number {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}
