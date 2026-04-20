import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, GOREV_DURUM_LABEL } from '@/lib/utils'
import { ClipboardList, MapPin } from 'lucide-react'
import type { DashboardBlockProps } from '../types'

function initials(name?: string | null) {
  if (!name) return '—'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase()).join('')
}

function progressForStatus(durum?: string | null) {
  if (durum === 'TAMAMLANDI') return 100
  if (durum === 'ISLEMDE') return 65
  if (durum === 'ACIK') return 35
  if (durum === 'IPTAL') return 0
  return 15
}

// Wider "Atanan" + "Tarih" columns to prevent long assignee names from visually colliding with the date.
// Also slightly reduces other columns to keep the overall layout balanced.
const GRID = '44px minmax(200px, 2fr) 100px 150px 190px 140px'

export default async function SonGorevlerBlock({ firmaId, projeId,
  basePath, yetkiliLokIds,
  limit = 8,
}: DashboardBlockProps & { firmaId: string | null; projeId?: string | null; limit?: number }) {
  const supabase = createClient()

  let q = supabase
    .from('gorevler')
    .select('id,tanim,durum,olusturma_tarihi,lokasyonlar(tanim),users!atanan_kullanici_id(isim_soyisim)')
    .order('olusturma_tarihi', { ascending: false })
    .limit(limit)

  if (firmaId) q = q.eq('firma_id', firmaId)
  if (projeId) q = (q as any).eq('proje_id', projeId)
  if (yetkiliLokIds?.length) q = (q as any).in('lokasyon_id', yetkiliLokIds)

  const rows = (await q).data ?? []
  const padded = Array.from({ length: limit }).map((_, i) => rows[i] ?? null)

  return (
    <div className="verde-card dashboard-border-intro h-[420px] flex flex-col">
      {/* Header */}
      <div
        style={{
          padding: '16px 18px 12px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>SPESİFİK SON GÖREVLER</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 1 }}>Son aktiviteler</div>
        </div>

        <Link href={`${basePath}/dashboard/gorevler`} className="text-[13px] text-[#374151] hover:underline mt-[2px]">
          Tümünü Gör
        </Link>
      </div>

      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: GRID,
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid #f3f4f6',
          fontSize: 13,
          fontWeight: 800,
          color: '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        <div style={{ textAlign: 'left' }}>No</div>
        <div style={{ textAlign: 'left' }}>Görev</div>
        <div style={{ textAlign: 'left' }}>Durum</div>
        <div style={{ textAlign: 'left' }}>İlerleme</div>
        <div style={{ textAlign: 'left' }}>Atanan</div>
        <div style={{ textAlign: 'left' }}>Tarih</div>
      </div>

      {/* Rows (scroll) */}
      <div className="flex-1 overflow-auto">
        {padded.map((g: any, idx: number) => {
          const isEmpty = !g
          const pct = isEmpty ? 0 : progressForStatus(g.durum)
          const name = isEmpty ? null : (g.users?.isim_soyisim ?? null)
          const dotColor = isEmpty
            ? '#9ca3af'
            : g.durum === 'TAMAMLANDI'
              ? '#374151'
              : g.durum === 'ISLEMDE'
                ? '#c2610c'
                : g.durum === 'ACIK'
                  ? '#2563eb'
                  : '#9ca3af'

          return (
            <div
              key={g?.id ?? `placeholder-${idx}`}
              style={{
                display: 'grid',
                gridTemplateColumns: GRID,
                gap: 8,
                padding: '12px 14px',
                borderBottom: '1px solid #f3f4f6',
                alignItems: 'center',
              }}
            >
              {/* NO */}
              <div style={{ color: '#374151', fontWeight: 900 }}>{idx + 1}</div>

              {/* GÖREV */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: 999, background: dotColor, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 400, color: '#111827', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <ClipboardList size={12} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isEmpty ? '—' : g.tanim}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginTop: 2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <MapPin size={12} style={{ flexShrink: 0 }} />
                    <span>{isEmpty ? '—' : (g.lokasyonlar?.tanim ?? '—')}</span>
                  </div>
                </div>
              </div>

              {/* DURUM */}
              <div>
                <span
                  className={`verde-badge ${
                    !isEmpty && g.durum === 'ACIK'
                      ? 'status-acik'
                      : !isEmpty && g.durum === 'ISLEMDE'
                        ? 'status-islemde'
                        : !isEmpty && g.durum === 'TAMAMLANDI'
                          ? 'status-tamamlandi'
                          : 'status-iptal'
                  }`}
                >
                  {isEmpty ? '—' : (GOREV_DURUM_LABEL[g.durum] ?? g.durum)}
                </span>
              </div>

              {/* İLERLEME */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontWeight: 800, color: '#374151', width: 36 }}>{pct}%</div>
                <div style={{ height: 8, background: '#f3f4f6', borderRadius: 999, overflow: 'hidden', flex: 1 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: dotColor }} />
                </div>
              </div>

              {/* ATANAN */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4b5563', minWidth: 0 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: '#e5e7eb',
                    border: '1px solid #d1d5db',
                    color: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                  title={name ?? ''}
                >
                  {initials(name)}
                </div>
                <span style={{ minWidth: 0 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name ?? '—'}</span>
                </span>
              </div>

              {/* TARİH */}
              <div style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>{isEmpty ? '—' : formatDateTime(g.olusturma_tarihi)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}