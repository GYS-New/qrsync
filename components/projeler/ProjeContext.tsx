'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'

export type Proje = {
  id: string
  ad: string
  aciklama?: string | null
  renk?: string
  aktif: boolean
  logo_url?: string | null
  birim_fiyat_aktif?: boolean
  personel_takibi_aktif?: boolean
  sureli_gorev_aktif?: boolean
  manuel_push_aktif?: boolean
  manuel_push_u_rolu?: boolean
  manuel_push_m_rolu?: boolean
}

type ProjeCtx = {
  projeler: Proje[]
  aktifProje: Proje | null
  setAktifProje: (p: Proje | null) => void
  loading: boolean
  reload: () => void
}

const ProjeContext = createContext<ProjeCtx | null>(null)
const COOKIE_KEY = 'qrsync_aktif_proje_id'

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

export function ProjeProvider({
  children,
  firmaId,
}: {
  children: React.ReactNode
  firmaId: string | null
}) {
  const router = useRouter()
  const [projeler, setProjeler] = useState<Proje[]>([])
  const [aktifProje, setAktifProjeState] = useState<Proje | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProjeler = useCallback(async () => {
    if (!firmaId) {
      setProjeler([])
      setAktifProjeState(null)
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const res = await fetch(`/api/projeler?firma_id=${firmaId}`)
      const data: Proje[] = await res.json()
      const aktifler = data.filter(p => p.aktif)
      setProjeler(aktifler)

      const saved = getCookie(COOKIE_KEY)
      if (saved) {
        const found = aktifler.find(p => p.id === saved)
        setAktifProjeState(found ?? null)
      } else {
        setAktifProjeState(null)
      }
    } catch {
      // sessizce geç
    } finally {
      setLoading(false)
    }
  }, [firmaId])

  useEffect(() => { fetchProjeler() }, [fetchProjeler])

  const setAktifProje = useCallback((p: Proje | null) => {
    setAktifProjeState(p)
    if (p) setCookie(COOKIE_KEY, p.id)
    else deleteCookie(COOKIE_KEY)
    // SA ve TA tarafında server component'ler cookie'yi yeniden okuması için tam reload
    if (typeof window !== 'undefined' &&
      (window.location.pathname.startsWith('/ta') || window.location.pathname.startsWith('/sa'))) {
      window.location.reload()
      return
    }
    router.refresh()
  }, [router])

  return (
    <ProjeContext.Provider value={{ projeler, aktifProje, setAktifProje, loading, reload: fetchProjeler }}>
      {children}
    </ProjeContext.Provider>
  )
}

export function useProje(): ProjeCtx {
  const ctx = useContext(ProjeContext)
  if (!ctx) {
    // Provider yoksa (örn. U layout) güvenli boş değer dön
    return { projeler: [], aktifProje: null, setAktifProje: () => {}, loading: false, reload: () => {} }
  }
  return ctx
}
