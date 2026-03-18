'use client'

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'

type Ctx = {
  isLoading: boolean
  start: () => void
  stop: () => void
}

const RouteLoadingContext = createContext<Ctx | null>(null)

export function RouteLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(false)
  const [token, setToken] = useState(0)

  const api = useMemo<Ctx>(
    () => ({
      isLoading,
      start: () => {
        setIsLoading(true)
        setToken((t) => t + 1)
      },
      stop: () => setIsLoading(false),
    }),
    [isLoading]
  )

  // Safety: if route doesn't change for any reason, auto-stop after a short time.
  useEffect(() => {
    if (!isLoading) return
    const t = setTimeout(() => setIsLoading(false), 8000)
    return () => clearTimeout(t)
  }, [isLoading, token])

  // When route changes, stop loader (gives immediate feedback for slower client fetches)
  useEffect(() => {
    setIsLoading(false)
  }, [pathname])

  return <RouteLoadingContext.Provider value={api}>{children}</RouteLoadingContext.Provider>
}

export function useRouteLoading() {
  const ctx = useContext(RouteLoadingContext)
  if (!ctx) throw new Error('useRouteLoading must be used within RouteLoadingProvider')
  return ctx
}

export function RouteLoadingOverlay() {
  const { isLoading } = useRouteLoading()
  if (!isLoading) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 14,
          border: '1px solid #d6e4d6',
          background: '#fff',
          boxShadow: '0 14px 40px rgba(15,40,15,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span className="verde-spinner" />
        <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2d3f2d' }}>Yükleniyor…</div>
      </div>
    </div>
  )
}
