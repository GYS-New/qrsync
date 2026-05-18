'use client'

import { useState } from 'react'
import type { Lokasyon } from '@/types'
import RowActionButton from '@/components/ui/RowActionButton'

export type VardiyaBucket = { tamamlandi: number; islemde: number; acik: number }
export type VardiyaOzet = Record<string, Record<number, VardiyaBucket>>

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
  /** readonly olsa bile salt-okunur aksiyonları göster (QR/↓QR/↓Kart) */
  showReadOnlyActions?: boolean
  /** Bugün vardiya × durum dağılımı — lokasyon başına */
  vardiyaOzet?: VardiyaOzet
}

/** Vardiya rozetleri — V1/V2/V3 etiket + sayı kutusu (dominant renk) */
function VardiyaRozetleri({ ozet }: { ozet?: Record<number, VardiyaBucket> }) {
  if (!ozet) return null
  const entries = Object.entries(ozet)
    .map(([k, v]) => ({ v: Number(k), b: v }))
    .filter(x => x.b.tamamlandi + x.b.islemde + x.b.acik > 0)
    .sort((a, b) => a.v - b.v)
  if (entries.length === 0) return null
  return (
    <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
      {entries.map(({ v, b }) => {
        const toplam = b.tamamlandi + b.islemde + b.acik
        // Renk önceliği: ACIK > ISLEMDE > TAMAMLANDI (en kötü durum baskın)
        const bg = b.acik > 0 ? '#fef3c7' : b.islemde > 0 ? '#dbeafe' : '#dcfce7'
        const fg = b.acik > 0 ? '#92400e' : b.islemde > 0 ? '#1e40af' : '#166534'
        const tooltip = `Vardiya ${v} — Tamamlandı: ${b.tamamlandi}, İşlemde: ${b.islemde}, Açık: ${b.acik}`
        return (
          <div key={v} title={tooltip} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
            <span style={{ color: '#6b7280', fontWeight: 600 }}>V{v}</span>
            <span style={{ background: bg, color: fg, padding: '1px 6px', borderRadius: 4, fontWeight: 800, minWidth: 18, textAlign: 'center' }}>
              {toplam}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function LokasyonNode({
  lok, depth, onEdit, onDelete, onToggleAktif, onQR, onAddChild,
  onQrIndir, onQrSablonIndir, qrIndiriliyor, qrSablonIndiriliyor, qrSablonAktif, readonly,
  showReadOnlyActions, vardiyaOzet,
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
  showReadOnlyActions?: boolean
  vardiyaOzet?: VardiyaOzet
}) {
  const [open, setOpen] = useState(false)
  const hasChildren = (lok.children?.length ?? 0) > 0
  const isRoot = depth === 0

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 5,
          background: isRoot ? '#f9fafb' : '#fff',
          border: '1px solid #f3f4f6',
          marginBottom: 4,
          transition: 'all 0.12s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = '#e5e7eb'}
        onMouseLeave={e => e.currentTarget.style.borderColor = '#f3f4f6'}
      >
        {/* Expand/Collapse */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: '#6b7280', fontSize: 11, width: 16, padding: 0 }}
        >
          {hasChildren ? (open ? '▼' : '►') : '·'}
        </button>

        <span style={{ fontSize: 15 }}>📍</span>

        <span style={{ flex: 1, fontSize: 14, fontWeight: isRoot ? 600 : 500, color: '#111827', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span>{lok.tanim}</span>
          <VardiyaRozetleri ozet={vardiyaOzet?.[lok.id]} />
        </span>
        {lok.aciklama && <span style={{ fontSize: 13, color: '#6b7280' }}>{lok.aciklama}</span>}

        <span className={`verde-badge ${lok.aktif ? 'status-islemde' : 'status-iptal'}`} style={{ fontSize: 13 }}>
          {lok.aktif ? 'Aktif' : 'Pasif'}
        </span>

        {(!readonly || showReadOnlyActions) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center' }}>

            {/* Tekil QR butonu — her lokasyonda (readonly'de de görünür) */}
            <RowActionButton variant="success" onClick={() => onQR?.(lok)} title="QR Kod">
              QR
            </RowActionButton>

            {/* QR İndir + Şablonlu — sadece üst (root) lokasyonlarda (readonly'de de görünür) */}
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

            {/* Yazma yetkisi gerektiren butonlar — sadece readonly değilken */}
            {!readonly && (
              <>
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
              </>
            )}
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
          showReadOnlyActions={showReadOnlyActions}
          vardiyaOzet={vardiyaOzet}
        />
      ))}
    </div>
  )
}

export default function LokasyonAgac({
  lokasyonlar, onEdit, onDelete, onToggleAktif, onQR, onAddChild,
  onQrIndir, onQrSablonIndir, qrIndiriliyor, qrSablonIndiriliyor, qrSablonAktif, readonly,
  showReadOnlyActions, vardiyaOzet,
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
      <div style={{ padding: '48px 0', textAlign: 'center', color: '#6b7280' }}>
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
          showReadOnlyActions={showReadOnlyActions}
          vardiyaOzet={vardiyaOzet}
        />
      ))}
    </div>
  )
}
