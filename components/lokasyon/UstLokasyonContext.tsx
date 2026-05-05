'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useProje } from '@/components/projeler/ProjeContext'

export type UstLokasyon = { id: string; tanim: string }

type UstLokCtx = {
  ustLokasyonlar: UstLokasyon[]
  aktifUstLokasyon: UstLokasyon | null
  setAktifUstLokasyon: (l: UstLokasyon | null) => void
  loading: boolean
}

const UstLokCtx = createContext<UstLokCtx | null>(null)
const COOKIE_KEY = 'qrsync_aktif_ust_lokasyon_id'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

function setCookie(name: string, value: string, days = 30) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`
}

function deleteCookie(name: string) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
}

/**
 * Üst lokasyon (root, parent_id IS NULL) seçim provider.
 * Aktif proje değişince listeyi yeniden çeker. Aktif proje yoksa firma scope'lu
 * tüm root lokasyonları gösterir. Cookie tabanlı, sayfa reload ile server
 * component'ler güncel filtre okur.
 */
export function UstLokasyonProvider({ children, firmaId }: { children: React.ReactNode; firmaId: string | null }) {
  const router = useRouter()
  const { aktifProje } = useProje()
  const [ustLokasyonlar, setUstLokasyonlar] = useState<UstLokasyon[]>([])
  const [aktifUstLokasyon, setAktifState] = useState<UstLokasyon | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchList = useCallback(async () => {
    if (!firmaId) {
      setUstLokasyonlar([])
      setAktifState(null)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const p = new URLSearchParams({ firmaId })
      if (aktifProje?.id) p.set('projeId', aktifProje.id)
      const res = await fetch(`/api/lokasyonlar-list?${p.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      const list: UstLokasyon[] = (Array.isArray(data) ? data : [])
        .filter((l: any) => !l.parent_id)
        .map((l: any) => ({ id: l.id, tanim: l.tanim }))
        .sort((a: UstLokasyon, b: UstLokasyon) => a.tanim.localeCompare(b.tanim, 'tr'))
      setUstLokasyonlar(list)

      const saved = getCookie(COOKIE_KEY)
      if (saved) {
        const found = list.find(l => l.id === saved)
        if (found) setAktifState(found)
        else { deleteCookie(COOKIE_KEY); setAktifState(null) }
      } else {
        setAktifState(null)
      }
    } catch {
      // sessizce geç
    } finally {
      setLoading(false)
    }
  }, [firmaId, aktifProje?.id])

  useEffect(() => { fetchList() }, [fetchList])

  const setAktifUstLokasyon = useCallback((l: UstLokasyon | null) => {
    setAktifState(l)
    if (l) setCookie(COOKIE_KEY, l.id)
    else deleteCookie(COOKIE_KEY)
    // SA/TA server component'leri cookie'yi okusun diye tam reload
    if (typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/ta') || window.location.pathname.startsWith('/sa'))) {
      window.location.reload()
      return
    }
    router.refresh()
  }, [router])

  return (
    <UstLokCtx.Provider value={{ ustLokasyonlar, aktifUstLokasyon, setAktifUstLokasyon, loading }}>
      {children}
    </UstLokCtx.Provider>
  )
}

export function useUstLokasyon(): UstLokCtx {
  const ctx = useContext(UstLokCtx)
  if (!ctx) {
    return { ustLokasyonlar: [], aktifUstLokasyon: null, setAktifUstLokasyon: () => {}, loading: false }
  }
  return ctx
}
