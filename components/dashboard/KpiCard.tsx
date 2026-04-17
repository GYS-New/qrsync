interface KpiCardProps {
  label: string
  value: number | string
  icon: string
  iconBg: string
  delta?: string
  deltaType?: 'up' | 'down' | 'neutral'
  deltaLabel?: string
  delay?: number

  // Optional: show a secondary value to the right of the main value (e.g. Tamamlanan / Online)
  secondaryValue?: number | string
  secondaryLabel?: string

  // Optional: show a small "Bugün" chip
  showToday?: boolean

  // Optional: show percentage at bottom-right (e.g. tamamlanan/total)
  percent?: number
}

export default function KpiCard({
  label,
  value,
  icon,
  iconBg,
  delta,
  deltaType = 'up',
  deltaLabel,
  delay = 0,
  secondaryValue,
  secondaryLabel,
  showToday,
  percent,
}: KpiCardProps) {
  const deltaColor = deltaType === 'up' ? { bg:'#e5e7eb', color:'#1f2937', border:'#d1d5db' }
                   : deltaType === 'down' ? { bg:'#fef2f2', color:'#b91c1c', border:'#fecaca' }
                   : { bg:'#f3f4f6', color:'#6b7280', border:'#e5e7eb' }

  return (
    <div
      className="kpi-card animate-fade-up"
      style={{
        animationDelay: `${delay}ms`,
        background: '#ffffff',
        border: '1px solid #d1d5db',
        borderRadius: 10,
        padding: '16px 18px',
        position: 'relative',
      }}
    >
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ fontSize:14.5, fontWeight:800, color:'#2f3a2f', letterSpacing:'0.1px' }}>{label}</div>
          {showToday && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                color: '#1f2937',
                background: '#e5e7eb',
                border: '1px solid #d1d5db',
                padding: '1px 6px',
                borderRadius: 999,
              }}
            >
              Bugün
            </span>
          )}
        </div>

        <div style={{ width:32, height:32, borderRadius:5, background:iconBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{icon}</div>
      </div>

      {secondaryValue === undefined ? (
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-1.5px', color: '#111827', lineHeight: 1, marginBottom: 7 }}>
          {value}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 7, paddingInline: 8 }}>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-1.2px', color: '#111827', lineHeight: 1 }}>{value}</div>
            <div style={{ marginTop: 5, fontSize: 14, fontWeight: 700, color: '#6b7280' }}>Toplam</div>
          </div>
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-1.2px', color: '#374151', lineHeight: 1 }}>{secondaryValue}</div>
            <div style={{ marginTop: 5, fontSize: 14, fontWeight: 700, color: '#6b7280' }}>{secondaryLabel ?? ''}</div>
          </div>
        </div>
      )}

      {typeof percent === 'number' && (
        <div
          style={{
            position: 'absolute',
            right: 14,
            bottom: 12,
            fontSize: 16,
            fontWeight: 900,
            color: '#1f2937',
            background: '#e5e7eb',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            padding: '2px 8px',
            lineHeight: 1.2,
          }}
        >
          %{Math.max(0, Math.min(100, Math.round(percent)))}
        </div>
      )}

      {delta && (
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:15 }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:2, fontWeight:700, fontSize:15, padding:'1px 5px', borderRadius:3, background:deltaColor.bg, color:deltaColor.color, border:`1px solid ${deltaColor.border}` }}>
            {deltaType === 'up' ? '↑' : deltaType === 'down' ? '↓' : '→'} {delta}
          </span>
          {deltaLabel && <span style={{ color:'#6b7280' }}>{deltaLabel}</span>}
        </div>
      )}
    </div>
  )
}
