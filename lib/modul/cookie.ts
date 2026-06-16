import { cookies } from 'next/headers'
import type { ModulKodu } from './yetkiliModuller'

/**
 * Aktif modül cookie'sini yönetir.
 *
 * Cookie adı: `iogys_aktif_modul` (mobil ile tutarlı — local storage anahtarı aynı).
 *
 * Yaşam: kullanıcı oturumu kapatana / "Modül Değiştir" tıklayana kadar.
 * httpOnly DEĞİL — UI tarafı (Topbar gibi) modülü okuyup gösterebilsin diye.
 * Hassas veri değil; sadece UX state'i.
 */

export const AKTIF_MODUL_COOKIE = 'iogys_aktif_modul'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 yıl

const GECERLI_MODULLER = new Set<ModulKodu>(['gys', 'oto_yikama', 'fms'])

/** Server component / route handler'larda kullanılır. */
export function getAktifModul(): ModulKodu | null {
  const c = cookies().get(AKTIF_MODUL_COOKIE)
  const val = c?.value
  if (val && (GECERLI_MODULLER as Set<string>).has(val)) {
    return val as ModulKodu
  }
  return null
}

/** Server action / route handler'larda yazma. */
export function setAktifModul(modul: ModulKodu): void {
  cookies().set(AKTIF_MODUL_COOKIE, modul, {
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
  })
}

/** Modül değiştir akışı veya logout sırasında. */
export function clearAktifModul(): void {
  cookies().delete(AKTIF_MODUL_COOKIE)
}

/**
 * Modül kodundan o modülün varsayılan landing URL'ini döner.
 * GYS için rol bazlı dashboard (mevcut davranış korunur).
 */
export function modulLandingUrl(modul: ModulKodu, rol: string): string {
  if (modul === 'gys') {
    if (rol === 'super_admin' || rol === 'alt_super_admin') return '/sa/dashboard'
    if (rol === 'tenant_admin') return '/ta/dashboard'
    return '/u/dashboard' // tenant_user + musteri
  }
  if (modul === 'oto_yikama') return '/oto-yikama/dashboard'
  if (modul === 'fms')        return '/fms/dashboard'
  return '/modul-sec'
}
