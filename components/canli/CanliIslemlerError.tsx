'use client'

import { useEffect, useRef, useState } from 'react'

const RETRY_KEY = 'canli-islemler-error-last-retry'
const RETRY_COOLDOWN_MS = 10000

/**
 * Canlı İşlemler sayfası için error boundary.
 *
 * Tipik tetikleyici: Railway proxy'sinden HTTP/2 stream drop / 503 / RSC fetch fail.
 * Bu durumda Next.js iç state'i corrupt olur (örn. useMemo içinde null .get()).
 *
 * Strateji:
 * 1) Sayfa ilk hata aldığında 1.5 sn sonra otomatik bir kez `reset()` denenir
 *    (transient network hiccup'larda kullanıcı hatayı görmez).
 * 2) Otomatik retry yapıldıysa veya 10 sn içinde tekrar hata alındıysa manuel
 *    "Tekrar Dene" butonu gösterilir (sonsuz döngüden kaçınmak için).
 *
 * Retry zamanı sessionStorage'da tutulur, böylece reset → fail → remount
 * döngüsünde otomatik retry tek seferlik olur.
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

    let lastRetry = 0
    try {
      lastRetry = Number(sessionStorage.getItem(RETRY_KEY) || '0')
    } catch {}
    const now = Date.now()

    if (now - lastRetry < RETRY_COOLDOWN_MS) {
      setAutoRetryDone(true)
      return
    }

    const timer = setTimeout(() => {
      try { sessionStorage.setItem(RETRY_KEY, String(Date.now())) } catch {}
      reset()
    }, 1500)

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
