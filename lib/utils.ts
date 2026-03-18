import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Europe/Istanbul',
  })
}

export function formatDateTime(date: string | Date): string {
  const d = new Date(date)
  return d.toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  })
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

export const GOREV_DURUM_LABEL: Record<string, string> = {
  // Manuel görevlerde "ACIK" veritabanı değeri uygulamada "Hazır" olarak kullanılır.
  ACIK: 'Hazır', ISLEMDE: 'İşlemde', IPTAL: 'İptal', TAMAMLANDI: 'Tamamlandı',
}

export const CANLI_DURUM_LABEL: Record<string, string> = {
  HAZIR: 'Hazır', ACIK: 'Açık', BEKLEMEDE: 'Beklemede',
  IPTAL: 'İptal', TAMAMLANDI: 'Tamamlandı', ZAMANINDA_YAPILAMAYAN: 'Zamanında Yapılamayan',
  ZAMANI_GECMIS: 'Zamanı Geçmiş',
  KAPATILDI: 'Kapatıldı',
  SILINDI: 'Silindi',
}
