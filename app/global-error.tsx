'use client'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body>
        <div style={{ padding: 28, maxWidth: 600, margin: '0 auto' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>Uygulama Hatası</div>
          <div style={{ color: '#7f1d1d', marginBottom: 16, fontFamily: 'monospace', fontSize: 13, background: '#fee2e2', padding: 12, borderRadius: 8, wordBreak: 'break-all' }}>
            {error.message || error.toString() || 'Bilinmeyen hata'}
          </div>
          {error.digest && (
            <div style={{ color: '#64748b', fontSize: 12, marginBottom: 16 }}>Digest: {error.digest}</div>
          )}
          <button onClick={reset} style={{ padding: '8px 16px', background: '#ff7f00', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700 }}>
            Tekrar Dene
          </button>
        </div>
      </body>
    </html>
  )
}
