export default function Loading() {
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="verde-spinner" />
        <div style={{ fontSize: 13, fontWeight: 800, color: '#374151' }}>Yükleniyor…</div>
      </div>
    </div>
  )
}
