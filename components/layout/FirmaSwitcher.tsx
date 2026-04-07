'use client'

import { useState, useRef, useEffect } from 'react'
import { Building2, ChevronDown } from 'lucide-react'
import { useFirma } from '@/components/layout/FirmaContext'

export default function FirmaSwitcher() {
  const [open, setOpen] = useState(false)
  const { firmalar, firmaId, setFirmaId, loading } = useFirma()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function selectFirma(id: string | null) {
    setOpen(false)
    setFirmaId(id)
  }

  const selectedFirma = firmalar.find(f => f.id === firmaId) ?? null
  const label = selectedFirma
    ? (selectedFirma.firma_adi || selectedFirma.ticari_unvan || 'Firma')
    : 'Firma Seçin'

  if (loading) return (
    <div style={{ margin: '6px 10px', padding: '8px 10px', borderRadius: 8, background: '#f9fafb', border: '1px solid #e0ece0' }}>
      <div style={{ fontSize: 12, color: '#6b7280' }}>Firmalar yükleniyor…</div>
    </div>
  )

  if (!firmalar.length) return null

  return (
    <div ref={ref} style={{ margin: '6px 10px', position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 8,
          background: selectedFirma ? '#e8f4ff' : '#f9fafb',
          border: `1px solid ${selectedFirma ? '#b0d4f0' : '#e5e7eb'}`,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <Building2 size={14} style={{ color: selectedFirma ? '#185a9b' : '#374151', flexShrink: 0 }} />
        <span style={{
          flex: 1, fontSize: 12.5, fontWeight: 700,
          color: selectedFirma ? '#185a9b' : '#1f2937',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
        <ChevronDown size={13} style={{
          color: '#6b7280', flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform .15s',
        }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
          marginTop: 4, background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(15,40,15,0.12)',
          overflow: 'hidden', maxHeight: 280, overflowY: 'auto',
        }}>
          <button
            onClick={() => selectFirma(null)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', background: !selectedFirma ? '#f9fafb' : 'transparent',
              border: 'none', cursor: 'pointer', textAlign: 'left',
              borderBottom: '1px solid #f0f4f0',
            }}
            onMouseEnter={e => { if (selectedFirma) (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
            onMouseLeave={e => { if (selectedFirma) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <Building2 size={13} style={{ color: '#6b7280', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: !selectedFirma ? '#1f2937' : '#2b3a2b', fontWeight: !selectedFirma ? 700 : 400 }}>
              Tüm Firmalar
            </span>
            {!selectedFirma && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#374151', fontWeight: 700 }}>✓</span>}
          </button>

          {firmalar.map(f => {
            const isSelected = f.id === firmaId
            const name = f.firma_adi || f.ticari_unvan || f.id
            return (
              <button
                key={f.id}
                onClick={() => selectFirma(f.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 12px',
                  background: isSelected ? '#eef6ff' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  borderBottom: '1px solid #f0f4f0',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#fafafa' }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <Building2 size={13} style={{ color: isSelected ? '#185a9b' : '#6b7280', flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontSize: 12.5, fontWeight: isSelected ? 700 : 400,
                  color: isSelected ? '#185a9b' : '#2b3a2b',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {name}
                </span>
                {isSelected && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#185a9b', fontWeight: 700 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
