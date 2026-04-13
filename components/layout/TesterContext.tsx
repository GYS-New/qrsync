'use client'

import { createContext, useContext, useEffect, useRef } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

const Ctx = createContext<boolean>(false)

export function TesterProvider({ isTester, children }: { isTester: boolean; children: React.ReactNode }) {
  const { toast } = useToast()
  const patchedRef = useRef(false)

  // Global fetch intercept — tester ise POST/PATCH/DELETE engellensin
  useEffect(() => {
    if (!isTester || patchedRef.current) return
    patchedRef.current = true

    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const method = (init?.method || (typeof input !== 'string' ? (input as Request).method : undefined) || 'GET').toUpperCase()
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
        const url = typeof input === 'string' ? input : (input as Request).url
        // Sadece bizim API route'larına yapılan yazma isteklerini engelle
        const isOurApi = url.includes('/api/') && !url.includes('/auth/')
        if (!isOurApi) {
          return originalFetch(input, init)
        }
        toast({ type: 'error', title: 'Yetkiniz yok', message: 'Test modunda değişiklik yapamazsınız.' })
        return new Response(JSON.stringify({ error: 'Tester — yazma engellendi' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return originalFetch(input, init)
    }

    return () => {
      window.fetch = originalFetch
      patchedRef.current = false
    }
  }, [isTester, toast])

  return <Ctx.Provider value={isTester}>{children}</Ctx.Provider>
}

/** Tester mi? */
export function useTester() {
  return useContext(Ctx)
}
