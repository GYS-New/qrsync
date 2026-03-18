'use client'

import { useEffect } from 'react'

// Sends a lightweight heartbeat to keep users.last_seen_at fresh.
// This enables real online user tracking ("online" = seen within last 2 minutes).
export default function Heartbeat() {
  useEffect(() => {
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
  }, [])

  return null
}
