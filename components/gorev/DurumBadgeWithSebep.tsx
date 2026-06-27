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
  /** Opsiyonel: işlemi yapan kullanıcının adı (popup'ta gösterilir) */
  eden?: string | null
  /** Opsiyonel: durum değişim/iptal tarihi ISO (popup'ta gösterilir) */
  tarih?: string | null
  /** Verilirse badge bu className ile render — yoksa default style */
  className?: string
  style?: React.CSSProperties
  /** Badge yazısı (yoksa durum) */
  label?: string
}

function fmtTarihTR(iso: string): string {
  try {
    return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' })
  } catch { return iso }
}

export default function DurumBadgeWithSebep({ durum, durumSebep, iptalSebep, eden, tarih, className, style, label }: Props) {
  const [open, setOpen] = useState(false)
  const sebep = durumSebep ?? iptalSebep ?? null
  const hasSebep = !!(sebep && sebep.trim())
  const hasMeta = !!(eden || tarih)
  const tiklanabilir = hasSebep || hasMeta

  const handleClick = (e: React.MouseEvent) => {
    if (!tiklanabilir) return
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
          cursor: tiklanabilir ? 'pointer' : (style?.cursor ?? 'default'),
          textDecoration: tiklanabilir ? 'underline dotted' : undefined,
          textDecorationThickness: tiklanabilir ? '1px' : undefined,
          textUnderlineOffset: tiklanabilir ? '3px' : undefined,
        }}
        title={tiklanabilir ? 'Detay için tıklayın' : undefined}
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
            {hasSebep && (
              <div
                style={{
                  padding: '12px 14px', borderRadius: 8, background: '#f9fafb',
                  border: '1px solid #e5e7eb', fontSize: 13.5, color: '#0f172a',
                  lineHeight: 1.55, whiteSpace: 'pre-wrap', marginBottom: hasMeta ? 10 : 0,
                }}
              >
                {sebep}
              </div>
            )}
            {hasMeta && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#374151' }}>
                {eden && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: '#6b7280', minWidth: 90 }}>İşlem yapan:</span>
                    <span>{eden}</span>
                  </div>
                )}
                {tarih && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: '#6b7280', minWidth: 90 }}>Tarih:</span>
                    <span>{fmtTarihTR(tarih)}</span>
                  </div>
                )}
              </div>
            )}
            {!hasSebep && !hasMeta && (
              <div style={{ padding: 12, fontSize: 12.5, color: '#6b7280', fontStyle: 'italic' }}>
                Bu durum değişikliği için ek bilgi kaydedilmemiş.
              </div>
            )}
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
