'use client'

import { useState, useRef, useEffect } from 'react'
import { useUstLokasyon } from './UstLokasyonContext'
import { ChevronDown, MapPin, Layers } from 'lucide-react'

export default function UstLokasyonSwitcher() {
  const { ustLokasyonlar, aktifUstLokasyon, setAktifUstLokasyon, loading } = useUstLokasyon()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (loading) return (
    <div style={{ margin: '8px 12px', padding: '8px 10px', borderRadius: 8, background: '#f9fafb', border: '1px solid #e0ece0' }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>Lokasyonlar…</div>
    </div>
  )

  if (ustLokasyonlar.length === 0) return null

  const label = aktifUstLokasyon?.tanim ?? 'Tüm Üst Lokasyonlar'

  return (
    <div ref={ref} style={{ margin: '6px 10px', position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 8,
          background: aktifUstLokasyon ? '#fef3c7' : '#f9fafb',
          border: `1px solid ${aktifUstLokasyon ? '#fbbf24' : '#e5e7eb'}`,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {aktifUstLokasyon
          ? <MapPin size={14} style={{ color: '#92400e', flexShrink: 0 }} />
          : <Layers size={14} style={{ color: '#374151', flexShrink: 0 }} />
        }
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: aktifUstLokasyon ? '#92400e' : '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <ChevronDown size={13} style={{ color: '#6b7280', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          marginTop: 4, background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(15,40,15,0.12)',
          overflow: 'hidden',
        }}>
          {/* Tümü */}
          <button
            onClick={() => { setAktifUstLokasyon(null); setOpen(false) }}
            style={{
              width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8,
              background: !aktifUstLokasyon ? '#f9fafb' : 'none', border: 'none', cursor: 'pointer',
              borderBottom: '1px solid #f3f4f6', textAlign: 'left',
            }}
          >
            <Layers size={14} style={{ color: '#374151' }} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#1f2937' }}>Tüm Üst Lokasyonlar</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{ustLokasyonlar.length} lokasyon</div>
            </div>
            {!aktifUstLokasyon && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#374151', fontWeight: 700 }}>✓</span>}
          </button>

          {/* Liste */}
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {ustLokasyonlar.map(l => (
              <button
                key={l.id}
                onClick={() => { setAktifUstLokasyon(l); setOpen(false) }}
                style={{
                  width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8,
                  background: aktifUstLokasyon?.id === l.id ? '#fef3c7' : 'none',
                  border: 'none', cursor: 'pointer', borderBottom: '1px solid #f0f5f0', textAlign: 'left',
                }}
              >
                <MapPin size={12} style={{ color: '#92400e', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.tanim}
                </span>
                {aktifUstLokasyon?.id === l.id && <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700, flexShrink: 0 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
