import { cookies } from 'next/headers'

export const FIRMA_COOKIE = 'qrsync_sa_firma_id'

export function getAktifFirmaId(): string | null {
  const cookieStore = cookies()
  return cookieStore.get(FIRMA_COOKIE)?.value ?? null
}

