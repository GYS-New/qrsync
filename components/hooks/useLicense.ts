'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useLicenseExpired(firmaId: string | null | undefined) {
  const supabase = createClient()
  const [expired, setExpired] = useState(false)
  const [validUntil, setValidUntil] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!firmaId)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!firmaId) {
        setExpired(false)
        setValidUntil(null)
        setLoading(false)
        return
      }
      setLoading(true)
      const { data, error } = await supabase.from('firmalar').select('lisans_gecerlilik_tarihi').eq('id', firmaId).single()
      if (cancelled) return
      if (error) {
        setExpired(false)
        setValidUntil(null)
        setLoading(false)
        return
      }
      const v = (data as any)?.lisans_gecerlilik_tarihi ?? null
      setValidUntil(v)
      if (!v) {
        setExpired(false)
      } else {
        const now = new Date()
        const until = new Date(v)
        setExpired(now.getTime() > until.getTime())
      }
      setLoading(false)
    }
    run()
    return () => { cancelled = true }
  }, [firmaId])

  return { expired, validUntil, loading }
}
