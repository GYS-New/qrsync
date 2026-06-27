'use client'

/**
 * Tıklanabilir durum badge — durum_sebep doluysa popup ile gerekçeyi gösterir.
 * Mig 099 sonrası tüm manuel durum değişimlerinde gerekçe zorunlu; bu badge
 * o gerekçeyi okumak için tek noktadır (UI'da sütun yok).
 *
 * Geriye uyum: durum_sebep null ama iptal_sebep dolu olan eski IPTAL
 * kayıtlarında iptal_sebep gösterilir.
 */

import { useState } from 'react'

interface Props {
  durum: string
  durumSebep?: string | null
  iptalSebep?: string | null   // geriye uyum fallback
  /** Verilirse badge bu className ile render — yoksa default style */
  className?: string
  style?: React.CSSProperties
  /** Badge yazısı (yoksa durum) */
  label?: string
}

export default function DurumBadgeWithSebep({ durum, durumSebep, iptalSebep, className, style, label }: Props) {
  const [open, setOpen] = useState(false)
  const sebep = durumSebep ?? iptalSebep ?? null
  const hasSebep = !!(sebep && sebep.trim())

  const handleClick = (e: React.MouseEvent) => {
    if (!hasSebep) return
    e.stopPropagation()
    setOpen(true)
  }

  return (
    <>
      <span
        onClick={handleClick}
        className={className}
        style={{
          ...style,
          cursor: hasSebep ? 'pointer' : (style?.cursor ?? 'default'),
          textDecoration: hasSebep ? 'underline dotted' : undefined,
          textDecorationThickness: hasSebep ? '1px' : undefined,
          textUnderlineOffset: hasSebep ? '3px' : undefined,
        }}
        title={hasSebep ? 'Gerekçeyi görmek için tıklayın' : undefined}
      >
        {label ?? durum}
      </span>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="verde-card"
            style={{ width: 'min(460px, 96vw)', padding: 20, borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                  Durum gerekçesi
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                  {label ?? durum}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ padding: 6, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: '#6b7280', fontSize: 18 }}
              >×</button>
            </div>
            <div
              style={{
                padding: '12px 14px', borderRadius: 8, background: '#f9fafb',
                border: '1px solid #e5e7eb', fontSize: 13.5, color: '#0f172a',
                lineHeight: 1.55, whiteSpace: 'pre-wrap',
              }}
            >
              {sebep}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={() => setOpen(false)}
                style={{ padding: '7px 16px', borderRadius: 8, background: '#111827', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >Kapat</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
