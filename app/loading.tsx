export default function Loading() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5fbf5' }}>
      <div
        className="verde-card"
        style={{
          width: 'min(520px, calc(100vw - 32px))',
          padding: 22,
          borderRadius: 14,
          display: 'flex',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <div
          className="animate-spin"
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            border: '3px solid #ffd9a0',
            borderTopColor: '#ff7f00',
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#3d1c00' }}>Yükleniyor…</div>
          <div style={{ fontSize: 12.5, color: '#9a7b6a', marginTop: 2 }}>Veriler hazırlanıyor, lütfen bekleyin.</div>
        </div>
      </div>
    </div>
  )
}
