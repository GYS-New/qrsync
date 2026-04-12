'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Dashboard auto-refresh: 30 saniyede bir router.refresh() çağırarak
 * tüm server component'lerin verilerini yeniler.
 * Animasyonlu pulse efekti ile "canlı" hissi verir.
 */
export default function DashboardRefresher() {
  const router = useRouter()
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setPulse(true)
      router.refresh()
      setTimeout(() => setPulse(false), 600)
    }, 30000) // 30 saniye

    return () => clearInterval(interval)
  }, [router])

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      borderRadius: 24,
      background: pulse ? '#dcfce7' : '#f8fafc',
      border: '1px solid #e2e8f0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
      transition: 'background 0.3s ease',
      fontSize: 13,
      fontWeight: 500,
      color: pulse ? '#16a34a' : '#64748b',
      pointerEvents: 'none',
    }}>
      <span style={{
        width: 9,
        height: 9,
        borderRadius: '50%',
        background: pulse ? '#22c55e' : '#94a3b8',
        transition: 'background 0.3s ease',
        animation: pulse ? 'canliPulse 0.6s ease' : 'none',
      }} />
      <span>Canlı</span>
    </div>
  )
}
