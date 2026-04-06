'use client'

import { useState, useRef, useEffect } from 'react'
import { useProje, type Proje } from './ProjeContext'
import { ChevronDown, Layers, LayoutGrid } from 'lucide-react'

export default function ProjeSwitcher() {
  const { projeler, aktifProje, setAktifProje, loading } = useProje()
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
    <div style={{ margin: '8px 12px', padding: '8px 10px', borderRadius: 8, background: '#fff7ed', border: '1px solid #e0ece0' }}>
      <div style={{ fontSize: 12, color: '#9a7b6a' }}>Projeler yükleniyor…</div>
    </div>
  )

  if (projeler.length === 0) return null

  const renk = aktifProje?.renk ?? '#9a7b6a'
  const label = aktifProje?.ad ?? 'Tüm Projeler'

  return (
    <div ref={ref} style={{ margin: '6px 10px', position: 'relative' }}>
      {/* Seçili proje butonu */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 8,
          background: aktifProje ? `${renk}18` : '#fff7ed',
          border: `1px solid ${aktifProje ? `${renk}40` : '#ffd9a0'}`,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {aktifProje
          ? <Layers size={14} style={{ color: renk, flexShrink: 0 }} />
          : <LayoutGrid size={14} style={{ color: '#ff7f00', flexShrink: 0 }} />
        }
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: aktifProje ? renk : '#c45200', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <ChevronDown size={13} style={{ color: '#9a7b6a', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          marginTop: 4, background: '#fff', border: '1px solid #ffd9a0',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(15,40,15,0.12)',
          overflow: 'hidden',
        }}>
          {/* Tüm projeler seçeneği */}
          <button
            onClick={() => { setAktifProje(null); setOpen(false) }}
            style={{
              width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8,
              background: !aktifProje ? '#fff7ed' : 'none', border: 'none', cursor: 'pointer',
              borderBottom: '1px solid #ffe8c8', textAlign: 'left',
            }}
          >
            <LayoutGrid size={14} style={{ color: '#ff7f00' }} />
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: '#c45200' }}>Tüm Projeler</div>
              <div style={{ fontSize: 11, color: '#9a7b6a' }}>{projeler.length} proje</div>
            </div>
            {!aktifProje && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#ff7f00', fontWeight: 700 }}>✓</span>}
          </button>

          {/* Proje listesi */}
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {projeler.map(p => (
              <button
                key={p.id}
                onClick={() => { setAktifProje(p); setOpen(false) }}
                style={{
                  width: '100%', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 8,
                  background: aktifProje?.id === p.id ? `${p.renk ?? '#ff7f00'}12` : 'none',
                  border: 'none', cursor: 'pointer', borderBottom: '1px solid #f0f5f0', textAlign: 'left',
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.renk ?? '#ff7f00', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#3d1c00', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.ad}</div>
                  {p.aciklama && <div style={{ fontSize: 11, color: '#9a7b6a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.aciklama}</div>}
                </div>
                {aktifProje?.id === p.id && <span style={{ fontSize: 11, color: p.renk ?? '#ff7f00', fontWeight: 700, flexShrink: 0 }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
