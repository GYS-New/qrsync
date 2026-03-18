'use client'

import { useEffect, useState } from 'react'

export const SA_FIRMA_KEY = 'qrsync_sa_firma_id'

export function useSAFirmaId(initialFirmaId?: string | null): string | null {
  const [firmaId, setFirmaId] = useState<string | null>(() => {
    if (initialFirmaId) return initialFirmaId
    if (typeof window === 'undefined') return null
    try { return localStorage.getItem(SA_FIRMA_KEY) } catch { return null }
  })

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SA_FIRMA_KEY)
      if (saved !== firmaId) setFirmaId(saved)
    } catch {}

    function onFirmaChange(e: Event) {
      const detail = (e as CustomEvent).detail
      setFirmaId(detail.firmaId ?? null)
    }
    window.addEventListener('sa-firma-change', onFirmaChange)
    return () => window.removeEventListener('sa-firma-change', onFirmaChange)
  }, [])

  return firmaId
}
