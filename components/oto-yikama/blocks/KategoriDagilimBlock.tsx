/**
 * Bugün — Kategori bazli yikama dagilimi (yatay bar chart, server-side).
 * 5 bar: Hedef / Toplam Tamamlanan / Planli Tamamlanan / Plansiz Tamamlanan / Ekstra Tamamlanan
 * Veri parent'tan geliyor (dashboard sayfa hesabi ile tam uyumlu).
 */
export default function KategoriDagilimBlock({
  hedef,
  toplamTamamlanan,
  planliTamamlanan,
  plansizTamamlanan,
  ekstraTamamlanan,
}: {
  hedef: number
  toplamTamamlanan: number
  planliTamamlanan: number
  plansizTamamlanan: number
  ekstraTamamlanan: number
}) {
  const rows = [
    { label: 'Hedef',              value: hedef,             color: '#1d4ed8' },
    { label: 'Toplam Tamamlanan',  value: toplamTamamlanan,  color: '#0f172a' },
    { label: 'Planlı Tamamlanan',  value: planliTamamlanan,  color: '#16a34a' },
    { label: 'Plansız Tamamlanan', value: plansizTamamlanan, color: '#d97706' },
    { label: 'Ekstra Tamamlanan',  value: ekstraTamamlanan,  color: '#0891b2' },
  ]
  const max = Math.max(1, ...rows.map(r => r.value))

  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
        Bugün — Kategori Dağılımı
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(r => {
          const pct = Math.round((r.value / max) * 100)
          return (
            <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                <div style={{ color: '#374151', fontWeight: 600 }}>{r.label}</div>
                <div style={{ color: '#0f172a', fontWeight: 800 }}>{r.value}</div>
              </div>
              <div style={{ height: 10, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: r.color,
                  borderRadius: 999,
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
