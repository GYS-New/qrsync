import React from 'react'

const GRID = [
  ['dark', 'mid',  'light'],
  ['light','dark', 'mid'  ],
  ['mid',  'light','dark' ],
] as const

type GridTone = 'dark' | 'mid' | 'light'

interface ProataMarkProps {
  size?: number
  rounded?: number
  gap?: number
  colors?: { dark: string; mid: string; light: string }
}

export function ProataMark({
  size = 44,
  rounded = 8,
  gap = 3,
  colors = { dark: '#1f6b1f', mid: '#2e8b2e', light: '#b8e0b8' },
}: ProataMarkProps) {
  const cell = (size - gap * 2) / 3
  return (
    <div style={{
      width: size, height: size, borderRadius: rounded, overflow: 'hidden',
      display: 'grid',
      gridTemplateColumns: `repeat(3, ${cell}px)`,
      gridTemplateRows: `repeat(3, ${cell}px)`,
      gap, flexShrink: 0, background: colors.light,
    }}>
      {GRID.flat().map((tone: GridTone, i) => (
        <div key={i} style={{ background: colors[tone], borderRadius: 2 }} />
      ))}
    </div>
  )
}

export default function ProataLogo({
  variant = 'full',
  scale = 1,
  inverse = false,
  className,
  style,
}: {
  variant?: 'full' | 'mark' | 'compact'
  scale?: number
  inverse?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const markSize  = Math.round(44 * scale)
  const markGap   = Math.round(3  * scale)
  const taglineColor = inverse ? 'rgba(255,255,255,.65)' : '#506050'
  const accentColor  = inverse ? '#b8e0b8' : '#1f6b1f'
  const textColor    = inverse ? '#fff'    : '#0f1a0f'
  const colors = inverse
    ? { dark: '#dcf0dc', mid: '#a0c8a0', light: 'rgba(255,255,255,.2)' }
    : { dark: '#1f6b1f', mid: '#2e8b2e', light: '#b8e0b8' }

  if (variant === 'mark') return (
    <ProataMark size={markSize} rounded={Math.round(8 * scale)} gap={markGap} colors={colors} />
  )

  if (variant === 'compact') return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: Math.round(10 * scale), ...style }}>
      <ProataMark size={markSize} rounded={Math.round(8 * scale)} gap={markGap} colors={colors} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
        <div style={{ fontSize: Math.round(17 * scale), letterSpacing: '-0.3px' }}>
          <span style={{ fontWeight: 300, color: taglineColor }}>Pro</span>
          <span style={{ fontWeight: 800, color: accentColor }}>ATA</span>
        </div>
        <div style={{ fontSize: Math.round(10 * scale), fontWeight: 700, letterSpacing: '1px', color: taglineColor, textTransform: 'uppercase' as const }}>
          Task Management
        </div>
      </div>
    </div>
  )

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: Math.round(12 * scale), ...style }}>
      <ProataMark size={markSize} rounded={Math.round(10 * scale)} gap={markGap} colors={colors} />
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <div style={{ fontSize: Math.round(22 * scale), letterSpacing: '-0.6px', lineHeight: 1 }}>
          <span style={{ fontWeight: 300, color: textColor }}>Pro</span>
          <span style={{ fontWeight: 900, color: accentColor }}>ATA</span>
        </div>
        <div style={{ fontSize: Math.round(13 * scale), color: taglineColor, marginTop: 2 }}>
          QR Kod Tabanlı Görev Yönetim Sistemi
        </div>
      </div>
    </div>
  )
}
