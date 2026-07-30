'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Sends a lightweight heartbeat to keep users.last_seen_at fresh.
// This enables real online user tracking ("online" = seen within last 2 minutes).
//
// Transit sayfalarda DISABLE:
// /login, /modul-sec, /fms, /auth/callback gibi kısa ömürlü redirect sayfalarında
// heartbeat mount olur, POST tetiklenir ve `supabase.auth.getUser()` session refresh
// yapabilir. Sayfa aynı anda redirect çağırır → yeni cookie henüz istemci tarafına
// yazılmadan bir sonraki sayfaya (özellikle cross-domain SSO akışında fms.iogys.com.tr)
// eski cookie gönderilir → session yeniden başlar → dashboard→login→parent loop.
// FMS-only kullanıcıların yaşadığı sonsuz döngü tam bu race condition.
const TRANSIT_PATHS = new Set([
  '/login',
  '/modul-sec',
  '/fms',
  '/forgot-password',
  '/reset-password',
])

function isTransit(pathname: string | null): boolean {
  if (!pathname) return true
  if (TRANSIT_PATHS.has(pathname)) return true
  if (pathname.startsWith('/auth/')) return true
  return false
}

export default function Heartbeat() {
  const pathname = usePathname()

  useEffect(() => {
    if (isTransit(pathname)) return

    let stopped = false
    let timer: any

    const ping = async () => {
      try {
        await fetch('/api/heartbeat', { method: 'POST' })
      } catch {
        // ignore
      }
    }

    // initial ping
    ping()

    // ping periodically
    timer = setInterval(() => {
      if (!stopped) ping()
    }, 30_000)

    // ping on focus/visibility
    const onFocus = () => ping()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') ping()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stopped = true
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [pathname])

  return null
}
