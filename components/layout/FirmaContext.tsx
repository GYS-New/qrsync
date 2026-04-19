'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const STORAGE_KEY = 'qrsync_sa_firma_id'
const COOKIE_KEY = 'qrsync_sa_firma_id'

type Firma = { id: string; firma_adi?: string; ticari_unvan?: string; birim_fiyat_aktif?: boolean; manuel_push_aktif?: boolean; manuel_push_u_rolu?: boolean; manuel_push_m_rolu?: boolean }

type FirmaCtx = {
  firmaId: string | null
  setFirmaId: (id: string | null) => void
  firmalar: Firma[]
  loading: boolean
}

const Ctx = createContext<FirmaCtx | null>(null)

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

export function FirmaProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [firmaId, setFirmaIdState] = useState<string | null>(null)
  const [firmalar, setFirmalar] = useState<Firma[]>([])
  const [loading, setLoading] = useState(true)

  // Mount'ta localStorage'dan oku + firmalar listesini çek
  useEffect(() => {
    fetch('/api/firmalar/liste', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((data: Firma[]) => {
        setFirmalar(data)
        try {
          const saved = getCookie(COOKIE_KEY) ?? localStorage.getItem(STORAGE_KEY)
          if (saved && data.some(f => f.id === saved)) {
            setFirmaIdState(saved)
          } else {
            // İlk kez girildiyse default olarak ilk firmayı seç
            const first = data?.[0]?.id ?? null
            if (first) {
              setFirmaIdState(first)
              localStorage.setItem(STORAGE_KEY, first)
              setCookie(COOKIE_KEY, first)
            }
          }
        } catch {}
        setLoading(false)
      })
  }, [])

  const setFirmaId = useCallback((id: string | null) => {
    setFirmaIdState(id)
    try {
      if (id) {
        localStorage.setItem(STORAGE_KEY, id)
        setCookie(COOKIE_KEY, id)
      } else {
        localStorage.removeItem(STORAGE_KEY)
        deleteCookie(COOKIE_KEY)
      }
    } catch {}
    // Server component'lerin cookie'yi yeniden okuması için refresh
    router.refresh()
  }, [router])

  return (
    <Ctx.Provider value={{ firmaId, setFirmaId, firmalar, loading }}>
      {children}
    </Ctx.Provider>
  )
}

// Güvenli hook — SA dışı sayfalarda (provider yoksa) null döndürür
export function useFirma(): FirmaCtx {
  const ctx = useContext(Ctx)
  if (!ctx) return { firmaId: null, setFirmaId: () => {}, firmalar: [], loading: false }
  return ctx
}
