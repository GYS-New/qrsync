'use client'

import { useState } from 'react'
import type { Lokasyon } from '@/types'
import RowActionButton from '@/components/ui/RowActionButton'

interface LokasyonAgacProps {
  lokasyonlar: Lokasyon[]
  onEdit?: (l: Lokasyon) => void
  onDelete?: (id: string) => void
  onToggleAktif?: (l: Lokasyon) => void
  onQR?: (l: Lokasyon) => void
  onAddChild?: (parentId: string) => void
  onQrIndir?: (lok: Lokasyon) => void
  onQrSablonIndir?: (lok: Lokasyon) => void
  qrIndiriliyor?: string | null      // lokasyon id'si
  qrSablonIndiriliyor?: string | null
  qrSablonAktif?: boolean
  readonly?: boolean
}

function LokasyonNode({
  lok, depth, onEdit, onDelete, onToggleAktif, onQR, onAddChild,
  onQrIndir, onQrSablonIndir, qrIndiriliyor, qrSablonIndiriliyor, qrSablonAktif, readonly,
}: {
  lok: Lokasyon; depth: number
  onEdit?: (l: Lokasyon) => void
  onDelete?: (id: string) => void
  onToggleAktif?: (l: Lokasyon) => void
  onQR?: (l: Lokasyon) => void
  onAddChild?: (parentId: string) => void
  onQrIndir?: (lok: Lokasyon) => void
  onQrSablonIndir?: (lok: Lokasyon) => void
  qrIndiriliyor?: string | null
  qrSablonIndiriliyor?: string | null
  qrSablonAktif?: boolean
  readonly?: boolean
}) {
  const [open, setOpen] = useState(true)
  const hasChildren = (lok.children?.length ?? 0) > 0
  const isRoot = depth === 0

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 5,
          background: isRoot ? '#f0f9f0' : '#fff',
          border: '1px solid #e8f0e8',
          marginBottom: 4,
          transition: 'all 0.12s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#d6e4d6'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#e8f0e8'}
      >
        {/* Expand/Collapse */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: '#7a907a', fontSize: 11, width: 16, padding: 0 }}
        >
          {hasChildren ? (open ? '▼' : '►') : '·'}
        </button>

        <span style={{ fontSize: 15 }}>📍</span>

        <span style={{ flex: 1, fontSize: 14, fontWeight: isRoot ? 600 : 500, color: '#0f1a0f' }}>{lok.tanim}</span>
        {lok.aciklama && <span style={{ fontSize: 13, color: '#7a907a' }}>{lok.aciklama}</span>}

        <span className={`verde-badge ${lok.aktif ? 'status-islemde' : 'status-iptal'}`} style={{ fontSize: 13 }}>
          {lok.aktif ? 'Aktif' : 'Pasif'}
        </span>

        {!readonly && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center' }}>

            {/* Tekil QR butonu — her lokasyonda */}
            <RowActionButton variant="success" onClick={() => onQR?.(lok)} title="QR Kod">
              QR
            </RowActionButton>

            {/* QR İndir + Şablonlu — sadece üst (root) lokasyonlarda */}
            {isRoot && onQrIndir && (
              <RowActionButton
                variant="success"
                onClick={() => onQrIndir(lok)}
                title="Alt lokasyonların QR kodlarını PNG olarak indir"
              >
                {qrIndiriliyor === lok.id ? '⏳' : '⬇ QR'}
              </RowActionButton>
            )}
            {isRoot && qrSablonAktif && onQrSablonIndir && (
              <RowActionButton
                variant="success"
                onClick={() => onQrSablonIndir(lok)}
                title="Alt lokasyonların şablonlu QR kartlarını indir"
              >
                {qrSablonIndiriliyor === lok.id ? '⏳' : '⬇ Kart'}
              </RowActionButton>
            )}

            {onAddChild && (
              <RowActionButton variant="success" onClick={() => onAddChild(lok.id)} title="Alt Lokasyon Ekle">
                +Alt
              </RowActionButton>
            )}

            <RowActionButton variant={lok.aktif ? 'warning' : 'success'} onClick={() => onToggleAktif?.(lok)}>
              {lok.aktif ? 'Pasif Yap' : 'Aktif Yap'}
            </RowActionButton>

            <RowActionButton variant="base" onClick={() => onEdit?.(lok)}>
              Düzenle
            </RowActionButton>

            <RowActionButton variant="danger" onClick={() => onDelete?.(lok.id)}>
              Sil
            </RowActionButton>
          </div>
        )}
      </div>

      {open && lok.children?.map(child => (
        <LokasyonNode
          key={child.id} lok={child} depth={depth + 1}
          onEdit={onEdit} onDelete={onDelete} onToggleAktif={onToggleAktif}
          onQR={onQR} onAddChild={onAddChild}
          onQrIndir={onQrIndir} onQrSablonIndir={onQrSablonIndir}
          qrIndiriliyor={qrIndiriliyor} qrSablonIndiriliyor={qrSablonIndiriliyor}
          qrSablonAktif={qrSablonAktif}
          readonly={readonly}
        />
      ))}
    </div>
  )
}

export default function LokasyonAgac({
  lokasyonlar, onEdit, onDelete, onToggleAktif, onQR, onAddChild,
  onQrIndir, onQrSablonIndir, qrIndiriliyor, qrSablonIndiriliyor, qrSablonAktif, readonly,
}: LokasyonAgacProps) {
  const map = new Map<string, Lokasyon>()
  lokasyonlar.forEach(l => map.set(l.id, { ...l, children: [] }))
  const roots: Lokasyon[] = []
  map.forEach(l => {
    if (l.parent_id && map.has(l.parent_id)) {
      map.get(l.parent_id)!.children = [...(map.get(l.parent_id)!.children ?? []), l]
    } else {
      roots.push(l)
    }
  })

  if (!roots.length) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: '#7a907a' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📍</div>
        <div>Henüz lokasyon eklenmemiş</div>
      </div>
    )
  }

  return (
    <div>
      {roots.map(l => (
        <LokasyonNode
          key={l.id} lok={l} depth={0}
          onEdit={onEdit} onDelete={onDelete} onToggleAktif={onToggleAktif}
          onQR={onQR} onAddChild={onAddChild}
          onQrIndir={onQrIndir} onQrSablonIndir={onQrSablonIndir}
          qrIndiriliyor={qrIndiriliyor} qrSablonIndiriliyor={qrSablonIndiriliyor}
          qrSablonAktif={qrSablonAktif}
          readonly={readonly}
        />
      ))}
    </div>
  )
}
