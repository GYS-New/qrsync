'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

const STORAGE_KEY = 'qrsync_sa_firma_id'
const COOKIE_KEY = 'qrsync_sa_firma_id'

type Firma = { id: string; firma_adi?: string; ticari_unvan?: string; birim_fiyat_aktif?: boolean; rapor_ozellestir_aktif?: boolean; manuel_push_aktif?: boolean; manuel_push_u_rolu?: boolean; manuel_push_m_rolu?: boolean; oto_yikama_aktif?: boolean }

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
  // Window focus'ta da yeniden çek — firma pasif/aktif değiştiğinde
  // başka sekmedeyse switcher anında güncellensin
  useEffect(() => {
    let cancelled = false
    function refetch(initial = false) {
      fetch('/api/firmalar/liste', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : [])
        .then((data: Firma[]) => {
          if (cancelled) return
          setFirmalar(data)
          try {
            const saved = getCookie(COOKIE_KEY) ?? localStorage.getItem(STORAGE_KEY)
            const savedAktif = saved && data.some(f => f.id === saved)
            if (savedAktif) {
              if (initial) setFirmaIdState(saved as string)
            } else {
              // Saved firma artık listede yok (pasifleştirildi/silindi) → temizle
              // ve ilk aktif firmayı seç
              const first = data?.[0]?.id ?? null
              setFirmaIdState(first)
              if (first) {
                localStorage.setItem(STORAGE_KEY, first)
                setCookie(COOKIE_KEY, first)
              } else {
                localStorage.removeItem(STORAGE_KEY)
                deleteCookie(COOKIE_KEY)
              }
              if (saved && !savedAktif && !initial) router.refresh()
            }
          } catch {}
          if (initial) setLoading(false)
        })
    }
    refetch(true)
    function onFocus() { refetch(false) }
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [router])

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
