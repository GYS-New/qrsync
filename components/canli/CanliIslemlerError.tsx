'use client'

import { useEffect, useRef, useState } from 'react'

const RETRY_KEY = 'canli-islemler-error-retry'
// 15 sn'lik pencere içinde max 2 otomatik retry (1.5 sn, sonra 3 sn delay).
// Pencere dışında counter sıfırlanır → tek seferlik transient hatadan sonra
// uzun ara verilirse yeniden 2 hak tanınır.
const RETRY_WINDOW_MS = 15000
const MAX_AUTO_RETRIES = 2
const RETRY_DELAYS_MS = [1500, 3000]

/**
 * Canlı İşlemler sayfası için error boundary (dashboard error.tsx'ler de aynısını
 * kullanıyor — re-export ile).
 *
 * Tipik tetikleyici: Railway proxy'sinden HTTP/2 stream drop / 503 / RSC fetch fail.
 * Bu durumda Next.js iç state'i corrupt olur (örn. useMemo içinde null .get()).
 *
 * Strateji:
 * - 15 sn'lik pencere içinde max 2 otomatik retry. Delay: 1.5 sn → 3 sn.
 * - Pencere dolduktan sonra (veya 2 retry tükenince) manuel "Tekrar Dene" butonu.
 * - Retry sayacı sessionStorage'da tutulur (reset → fail → remount döngüsünde
 *   sonsuz retry'ı engellemek için).
 */
export default function CanliIslemlerError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [autoRetryDone, setAutoRetryDone] = useState(false)
  const didScheduleRef = useRef(false)

  useEffect(() => {
    console.error('[canli-islemler error]', error?.message, error?.digest)
  }, [error])

  useEffect(() => {
    if (didScheduleRef.current) return
    didScheduleRef.current = true

    // Pencere kontrol: ilk hata zamanını ve retry sayısını oku
    let firstTryTs = 0
    let retryCount = 0
    try {
      const raw = sessionStorage.getItem(RETRY_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { firstTryTs?: number; count?: number }
        firstTryTs = Number(parsed.firstTryTs ?? 0)
        retryCount = Number(parsed.count ?? 0)
      }
    } catch {}

    const now = Date.now()
    const windowExpired = !firstTryTs || (now - firstTryTs) > RETRY_WINDOW_MS
    if (windowExpired) {
      firstTryTs = now
      retryCount = 0
    }

    if (retryCount >= MAX_AUTO_RETRIES) {
      // Pencere içinde retry hakkı tükendi — manuel buton göster
      setAutoRetryDone(true)
      return
    }

    const delay = RETRY_DELAYS_MS[retryCount] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(RETRY_KEY, JSON.stringify({
          firstTryTs, count: retryCount + 1,
        }))
      } catch {}
      reset()
    }, delay)

    return () => clearTimeout(timer)
  }, [reset])

  if (!autoRetryDone) {
    return (
      <div style={{ padding: 60, textAlign: 'center', minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#1f2937', borderRadius: '50%', animation: 'cisErrSpin 0.8s linear infinite' }} />
        <div style={{ fontSize: 14, color: '#6b7280', fontWeight: 600 }}>Bağlantı yenileniyor…</div>
        <style>{`@keyframes cisErrSpin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: 28, maxWidth: 540, margin: '40px auto', background: '#fff', border: '1px solid #fca5a5', borderRadius: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>Bağlantı sorunu</div>
      <div style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 18, lineHeight: 1.6 }}>
        Sunucuya geçici olarak ulaşılamadı. Sayfayı yenilemek için butona basabilirsiniz.
      </div>
      <button
        onClick={() => {
          try { sessionStorage.removeItem(RETRY_KEY) } catch {}
          reset()
        }}
        style={{ padding: '10px 24px', background: '#1f2937', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
      >
        Tekrar Dene
      </button>
    </div>
  )
}
