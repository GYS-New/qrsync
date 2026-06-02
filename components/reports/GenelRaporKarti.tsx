'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import {
  RefreshCw, FileSpreadsheet,
  CheckCircle, XCircle, Clock, AlertTriangle, TrendingUp, Activity, Target,
} from 'lucide-react'

interface Props {
  base: string
  isSA: boolean
  tenantFirmaId?: string | null
  projeId?: string | null
}

type Lokasyon = { id: string; tanim: string; parent_id: string | null }

type GrupMetrik = {
  grup: string; ustLokasyon: string; lokasyon: string; gorevTanimi: string; gunlukFrekans: number; kuralSayisi: number
  hedef: number; tamamlanan: number; sapma: number; kayip: number; ekstra: number
  basariOrani: string; genelOran: string
}
type TamamlananRow  = { sn: number; personel: string; personelId?: string | null; ustLokasyon: string; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; tarih: string; gorevSaatleri: string; gorevSuresi: string; durum: string }
type SapmaRow       = { sn: number; personel: string; personelId?: string | null; ustLokasyon: string; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; tarih: string; gorevSaatleri: string; gorevSuresi: string; sapmaNedeni: string }
type KayipRow       = { sn: number; ustLokasyon: string; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; tarih: string; gorevSaatleri: string; gorevSuresi: string; durum: string; kayipNedeni: string }
type FrekansDisiRow  = { sn: number; ustLokasyon: string; grupTanimi: string; lokasyonTanimi: string; personel: string; tarihSaat: string; tarih: string; gorevSaatleri: string; gorevSuresi: string; aciklama: string }
type AtananFrekanRow = { sn: number; atanan: string; tamamlayan: string; ustLokasyon: string; lokasyon: string; gorevTanimi: string; gorevDurumu: string; durumKod: string; atamaTarihi: string; tamamlanmaTarihi: string }

type DepartmanMetrik = {
  ustLokasyonId: string
  ustLokasyonAd: string
  hedef: number; tamamlanan: number; sapma: number; kayip: number
}

type OzetAgg = {
  departmanMetrikleri?: DepartmanMetrik[]
  personelTamamlananTop: { key: string; sayi: number }[]
  lokasyonTamamlananTop: { key: string; sayi: number }[]
  kayipNedeniDagilim: { neden: string; sayi: number }[]
  sapmaNedeniDagilim: { neden: string; sayi: number }[]
  kayipLokasyonTop: { key: string; sayi: number }[]
  sapmaLokasyonTop: { key: string; sayi: number }[]
  atananPersonelBasari: { personel: string; atanan: number; tamamlanan: number; sapma: number; kayip: number; aktif: number }[]
}

type RaporData = {
  firmaAdi: string; projeAdi: string; ustLokTanim: string; altLokTanim: string
  raporTarihLabel: string; gunSayisi: number; raporuAlan: string
  toplamGorev: number; toplamTamamlanan: number; toplamSapma: number
  toplamKayip: number; toplamEkstra: number; genelBasari: number
  grupMetrikleri: GrupMetrik[]
  tamamlananGorevler: TamamlananRow[]
  sapmaGorevler: SapmaRow[]
  kayipGorevler: KayipRow[]
  frekansDisiGorevler: FrekansDisiRow[]
  atananFrekanslar: AtananFrekanRow[]
  /** Özet & Grafikler için önceden hesaplanmış agg'ler (backend ozetAgg). */
  ozetAgg?: OzetAgg
  /** Üst lokasyon yöneticileri — personel başarı agg'lerinde hariç tutulur */
  yoneticiIds?: string[]
  /** Proje ayarı: false ise Görev Saatleri + Görev Süresi sütunları gizlenir */
  islemSureleriAktif?: boolean
}

// Bugünün yerel tarihini YYYY-MM-DD formatında döner (timezone-safe; UTC'den
// kayma yapmaz). Default rapor aralığını kullanıcının yerel gününe sabitler.
function todayLocal(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// ── Design tokens (SpesifikRaporKarti ile aynı) ────────────────────
const T = {
  blue:      '#1d4ed8', blueLight: '#eff6ff', blueMid: '#3b82f6',
  green:     '#111827', greenMid:  '#374151', greenLight: '#f9fafb',
  amber:     '#d97706', amberLight: '#fef3c7',
  red:       '#dc2626', redLight:   '#fee2e2',
  gray:      '#475569', grayLight:  '#f8fafc',
  border:    '#e2e8f0', text:       '#0f172a', textSoft: '#64748b',
}
const spinning = { animation: 'spin 0.9s linear infinite' }
const inp: React.CSSProperties = {
  height: 36, padding: '0 10px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: '#fff', fontSize: 14, width: '100%',
}

// ── Yatay bar chart (horizontal) — hover tooltip ─────────────────
// 30 karakter üstünü ... ile kapatır; title attribute tam metni tutar (hover'da görünür)
function kisalt(s: string, n = 30): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function BarChart({ data, valueKey, labelKey, color, orientation = 'horizontal' }: {
  data: Record<string, any>[]; valueKey: string; labelKey: string; color?: string
  orientation?: 'horizontal' | 'vertical'
}) {
  if (!data.length) return <div style={{ color: T.textSoft, fontSize: 14, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
  const barClr = color ?? T.blueMid
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1)
  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0)

  if (orientation === 'vertical') {
    // Sütun grafik — bar'lar yukarı çıkar, değer üstte, label altta -45° eğik
    const CHART_HEIGHT = 240
    return (
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: 6, height: CHART_HEIGHT + 70, paddingTop: 20, paddingBottom: 50, overflow: 'hidden' }}>
        {data.map((d, i) => {
          const val = Number(d[valueKey]) || 0
          const pct = (val / max) * 100
          const totalPct = total > 0 ? Math.round(val / total * 100) : 0
          const label = String(d[labelKey] ?? '')
          const kisaLabel = kisalt(label, 28)
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, height: '100%', justifyContent: 'flex-end', position: 'relative' }} title={`${label}: ${val} (%${totalPct})`}>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: T.text, marginBottom: 4, whiteSpace: 'nowrap' }}>{val}</div>
              <div style={{
                width: '78%', height: `${Math.max(pct, 2)}%`, minHeight: 2,
                background: `linear-gradient(180deg, ${barClr}, ${barClr}99)`,
                borderRadius: '6px 6px 2px 2px', transition: 'height 0.5s ease',
              }} />
              <div style={{
                position: 'absolute', bottom: -44, left: '50%',
                transform: 'translateX(-50%) rotate(-45deg)', transformOrigin: 'center top',
                fontSize: 10.5, fontWeight: 600, color: T.textSoft,
                whiteSpace: 'nowrap', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
              }} title={label}>{kisaLabel}</div>
            </div>
          )
        })}
      </div>
    )
  }

  // Yatay (default) — her satır bir bar
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0
        const pct = (val / max) * 100
        const totalPct = total > 0 ? Math.round(val / total * 100) : 0
        const label = String(d[labelKey] ?? '')
        const kisaLabel = kisalt(label, 30)
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }} title={`${label}: ${val} (%${totalPct})`}>
            <div style={{ width: 200, fontSize: 12.5, fontWeight: 600, color: T.text, textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{kisaLabel}</div>
            <div style={{ flex: 1, height: 28, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
              <div style={{ height: '100%', width: `${Math.max(pct, 2)}%`, background: `linear-gradient(90deg, ${barClr}99, ${barClr})`, borderRadius: 6, transition: 'width 0.5s ease' }} />
            </div>
            <div style={{ width: 50, fontSize: 13, fontWeight: 800, color: T.text, textAlign: 'right', flexShrink: 0 }}>{val}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Donut grafik (halka) — hover tooltip ─────────────────────────
function PieChart({ slices, size = 120 }: { slices: { label: string; value: number; color: string }[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (!total) return <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
  const cx = 50, cy = 50, R = 42, r = 26
  let angle = -Math.PI / 2
  const arcs = slices.filter(s => s.value > 0).map(s => {
    const a = (s.value / total) * Math.PI * 2
    const ox1 = cx + R * Math.cos(angle), oy1 = cy + R * Math.sin(angle)
    const ix1 = cx + r * Math.cos(angle), iy1 = cy + r * Math.sin(angle)
    angle += a
    const ox2 = cx + R * Math.cos(angle), oy2 = cy + R * Math.sin(angle)
    const ix2 = cx + r * Math.cos(angle), iy2 = cy + r * Math.sin(angle)
    const large = a > Math.PI ? 1 : 0
    const d = `M${ox1.toFixed(2)},${oy1.toFixed(2)} A${R},${R} 0 ${large} 1 ${ox2.toFixed(2)},${oy2.toFixed(2)} L${ix2.toFixed(2)},${iy2.toFixed(2)} A${r},${r} 0 ${large} 0 ${ix1.toFixed(2)},${iy1.toFixed(2)} Z`
    return { d, color: s.color, label: s.label, value: s.value, pct: Math.round(s.value / total * 100) }
  })
  const mainPct = arcs.length > 0 ? arcs[0].pct : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%' }}>
          {/* Tek slice (%100) durumunda SVG arc başlangıç=bitiş olduğu için path
              çizilmez — iki concentric circle ile tam donut çiz. */}
          {arcs.length === 1 ? (
            <>
              <circle cx={cx} cy={cy} r={R} fill={arcs[0].color} stroke="#fff" strokeWidth={1.2}
                style={{ cursor: 'pointer', opacity: 0.9, transition: 'opacity 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.9')}>
                <title>{`${arcs[0].label}: ${arcs[0].value} (%${arcs[0].pct})`}</title>
              </circle>
              <circle cx={cx} cy={cy} r={r} fill="#fff" pointerEvents="none" />
            </>
          ) : (
            arcs.map((p, i) => (
              <path key={i} d={p.d} fill={p.color} stroke="#fff" strokeWidth={1.2} style={{ cursor: 'pointer', opacity: 0.9, transition: 'opacity 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.9')}>
                <title>{`${p.label}: ${p.value} (%${p.pct})`}</title>
              </path>
            ))
          )}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: size * 0.14, fontWeight: 900, color: T.text, lineHeight: 1 }}>%{mainPct}</span>
          <span style={{ fontSize: size * 0.06, color: T.textSoft, fontWeight: 600 }}>{arcs[0]?.label ?? ''}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {arcs.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: p.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{p.value} <span style={{ fontSize: 12, color: T.textSoft, fontWeight: 500 }}>(%{p.pct})</span></div>
              <div style={{ fontSize: 12, color: T.textSoft }}>{p.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── KPI kart ───────────────────────────────────────────────────────
function KpiCard({ label, value, sub, pct, color, Icon }: { label: string; value: string | number; sub?: string; pct?: string; color: string; Icon: any }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '18', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={16} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: T.text, lineHeight: 1 }}>{value}</div>
        {pct && <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 3, lineHeight: 1 }}>{pct}</div>}
        {sub && <div style={{ fontSize: 12.5, color: T.textSoft, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── DataTable ──────────────────────────────────────────────────────
function DataTable({ headers, rows, accentCol, accentColor, leftCols, filterable, noFilterCols }: {
  headers: string[]; rows: (string | number)[][]; accentCol?: number; accentColor?: string; leftCols?: number[];
  filterable?: boolean; noFilterCols?: number[]
}) {
  const isLeft = (i: number) => i === 0 || (leftCols?.includes(i) ?? false)
  const skipFilter = (i: number) => noFilterCols?.includes(i) ?? false
  const [filters, setFilters] = useState<string[]>(() => headers.map(() => ''))

  // headers değişirse filtreleri sıfırla (sekme değişiminde)
  React.useEffect(() => { setFilters(headers.map(() => '')) }, [headers.length, headers.join('|')])

  const filteredRows = useMemo(() => {
    if (!filterable) return rows
    const aktif = filters.some(f => f && f.trim())
    if (!aktif) return rows
    return rows.filter(row =>
      filters.every((f, i) => {
        if (!f || !f.trim()) return true
        return String(row[i] ?? '').toLowerCase().includes(f.trim().toLowerCase())
      })
    )
  }, [rows, filters, filterable])

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>{headers.map((h, i) => (
            <th key={i} style={{ padding: '8px 12px', background: T.blue, color: '#fff', fontWeight: 700, fontSize: 12.5, textAlign: isLeft(i) ? 'left' : 'center', whiteSpace: 'nowrap' }}>{h}</th>
          ))}</tr>
          {filterable && (
            <tr style={{ background: '#eaf0fa' }}>{headers.map((_, i) => (
              <th key={i} style={{ padding: '4px 6px', background: '#eaf0fa', borderBottom: `1px solid ${T.border}` }}>
                {skipFilter(i) ? null : (
                  <input
                    value={filters[i] ?? ''}
                    onChange={e => setFilters(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
                    placeholder="Ara…"
                    style={{
                      width: '100%', minWidth: 60, padding: '4px 6px', borderRadius: 5,
                      border: `1px solid ${T.border}`, fontSize: 11.5, background: '#fff',
                    }}
                  />
                )}
              </th>
            ))}</tr>
          )}
        </thead>
        <tbody>
          {filteredRows.length === 0
            ? <tr><td colSpan={headers.length} style={{ padding: '20px', textAlign: 'center', color: T.textSoft }}>Veri bulunamadı.</td></tr>
            : filteredRows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? T.grayLight : '#fff' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '7px 12px', borderBottom: `1px solid ${T.border}`,
                    textAlign: isLeft(ci) ? 'left' : 'center', fontSize: 13.5,
                    fontWeight: ci === accentCol ? 700 : isLeft(ci) ? 600 : 400,
                    color: ci === accentCol ? (accentColor ?? T.greenMid) : undefined,
                  }}>{String(cell ?? '')}</td>
                ))}
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  )
}

const TABS = ['Özet & Grafikler', 'Grup Metrikleri', 'Tamamlanan', 'Sapmalar', 'Kayıp Frekanslar', 'Frekans Dışı', 'Atanan Frekanslar'] as const
type Tab = typeof TABS[number]

// Detay tablo yüklenirken gösterilen iskelet/spinner blok.
function DetayLoader({ label }: { label: string }) {
  return (
    <div className="verde-card" style={{ padding: '64px 20px', textAlign: 'center' }}>
      <RefreshCw size={36} style={{ animation: 'spin 0.9s linear infinite', color: T.blue, margin: '0 auto 14px', display: 'block' }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: T.textSoft }}>{label} yükleniyor…</div>
    </div>
  )
}

// Departman Analizi kartı içindeki tek bir üst lokasyon grafiği — 3 dikey bar
// (Tamamlandı / Sapma / Kayıp), hedefe referans yükseklik. expanded=true ise
// daha uzun çubuklar (tek üst lokasyon filtresi seçildiğinde).
function DepartmanGraph({ d, expanded = false }: { d: DepartmanMetrik; expanded?: boolean }) {
  const max = d.hedef || 1
  const bars = [
    { label: 'Tamamlandı', value: d.tamamlanan, color: T.greenMid },
    { label: 'Sapma',      value: d.sapma,      color: T.amber },
    { label: 'Kayıp',      value: d.kayip,      color: T.red },
  ]
  const H = expanded ? 280 : 180
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.ustLokasyonAd}>
          {d.ustLokasyonAd}
        </div>
        <div style={{ fontSize: 11, color: T.textSoft, fontWeight: 600, flexShrink: 0 }}>
          Hedef: <strong style={{ color: T.text, fontWeight: 800 }}>{d.hedef}</strong>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: H, paddingBottom: 26, position: 'relative' }}>
        {bars.map(b => {
          const pct = (b.value / max) * 100
          const oran = max > 0 ? Math.round((b.value / max) * 100) : 0
          return (
            <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', position: 'relative', minWidth: 0 }}
              title={`${b.label}: ${b.value} (%${oran} / hedef ${d.hedef})`}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 4, whiteSpace: 'nowrap' }}>
                {b.value} <span style={{ color: T.textSoft, fontWeight: 600, fontSize: 11 }}>%{oran}</span>
              </div>
              <div style={{
                width: '78%', height: `${Math.max(pct, 1.5)}%`, minHeight: 2,
                background: `linear-gradient(180deg, ${b.color}, ${b.color}aa)`,
                borderRadius: '6px 6px 2px 2px', transition: 'height 0.5s ease',
              }} />
              <div style={{
                position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)',
                fontSize: 11, fontWeight: 700, color: T.textSoft, whiteSpace: 'nowrap',
              }}>{b.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Top-N grafiklerinde grafiğin sağına yerleşen sıralı liste — "1- Etiket    24"
// formatında, son satır hariç ince ayraç çizgisiyle.
function SiraliListe({ items }: { items: { label: string; value: number }[] }) {
  if (!items.length) return null
  return (
    <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((it, i) => (
        <li key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 8px',
          borderBottom: i < items.length - 1 ? `1px solid ${T.border}` : 'none',
          fontSize: 12.5,
        }} title={`${it.label}: ${it.value}`}>
          <span style={{ fontWeight: 800, color: T.textSoft, minWidth: 22, textAlign: 'right' }}>{i + 1}-</span>
          <span style={{ flex: 1, color: T.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          <span style={{ fontWeight: 800, color: T.text, minWidth: 32, textAlign: 'right' }}>{it.value}</span>
        </li>
      ))}
    </ol>
  )
}

// Bir sonraki sayfa butonu (pagination). Daha fazla satır varsa görünür.
function DahaFazlaButon({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '14px 0 4px' }}>
      <button onClick={onClick} disabled={loading}
        style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        {loading && <RefreshCw size={13} style={{ animation: 'spin 0.9s linear infinite' }} />}
        {loading ? 'Yükleniyor…' : 'Daha Fazla Yükle'}
      </button>
    </div>
  )
}

// ── Ana bileşen ────────────────────────────────────────────────────
export default function GenelRaporKarti({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (tenantFirmaId ?? '')

  const [lokasyonlar,       setLokasyonlar]       = useState<Lokasyon[]>([])
  const [ustLokasyonId,     setUstLokasyonId]     = useState('')
  const [altLokasyonId,     setAltLokasyonId]     = useState('')
  const [altAltLokasyonId,  setAltAltLokasyonId]  = useState('')
  // Default: bugün → bugün (büyüyen veri yoğunluğunda hızlı yükleme).
  // Boşaltırsa "tüm dönem" davranışı korunur.
  const [raporBaslangic, setRaporBaslangic] = useState(todayLocal)
  const [raporBitis,     setRaporBitis]     = useState(todayLocal)
  // Vardiya filtresi: aktif_olma_tarihi'nin TR saatine göre dilim
  const [vardiyaFilter,  setVardiyaFilter]  = useState<'all' | 'v1' | 'v2' | 'v3'>('all')
  // Firma vardiya ayarı — dropdown label'ları için (yeni vardiya saatleriyle dinamik)
  const [firmaVardiyalari, setFirmaVardiyalari] = useState<{ no: number; baslangic: string; bitis: string }[]>([])
  const [raporuAlan,     setRaporuAlan]     = useState('')
  const [data,           setData]           = useState<RaporData | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [dlLoading,      setDlLoading]      = useState(false)
  const [activeTab,      setActiveTab]      = useState<Tab>('Özet & Grafikler')
  const [gruplandir,     setGruplandir]     = useState(false)
  const debRef = useRef<any>(null)
  // Race condition koruması: hızlı tarih/filtre değişimlerinde yavaş request'lerin
  // hızlı request'leri override etmesini önler. AbortController eski isteği iptal
  // eder, requestIdRef de en son başlatılan request'in id'sini takip eder.
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  // Detay tab'ları (Tamamlanan/Sapma/Kayıp/Frekans Dışı/Atanan) artık ana endpoint
  // yerine /api/reports/genel-rapor-detay'dan lazy + paginated alınır. Sekme
  // tıklanana kadar veri çekilmez; veri yoğunluğu büyüdükçe (3-12 aylık aralık)
  // memory ve network yükü kontrollü kalır.
  type DetayTip = 'tamamlanan' | 'sapma' | 'kayip' | 'frekans_disi' | 'atanan'
  type DetayState = {
    rows: any[]
    total: number
    hasMore: boolean
    loading: boolean
    loadedFor: string | null   // filterKey snapshot; eşleşirse cache geçerli
    islemSureleriAktif: boolean | null
  }
  const EMPTY_DETAY: DetayState = { rows: [], total: 0, hasMore: false, loading: false, loadedFor: null, islemSureleriAktif: null }
  const [detayState, setDetayState] = useState<Record<DetayTip, DetayState>>({
    tamamlanan: EMPTY_DETAY, sapma: EMPTY_DETAY, kayip: EMPTY_DETAY,
    frekans_disi: EMPTY_DETAY, atanan: EMPTY_DETAY,
  })
  const detayStateRef = useRef(detayState)
  useEffect(() => { detayStateRef.current = detayState }, [detayState])

  // Üst lokasyon filtresi temizlenirse gruplandır modu otomatik kapanır
  // (gruplandır sadece üst lokasyon filtresi varken anlamlı)
  useEffect(() => { if (!ustLokasyonId) setGruplandir(false) }, [ustLokasyonId])

  const ustLokasyonlar    = useMemo(() => lokasyonlar.filter(l => !l.parent_id), [lokasyonlar])
  const altLokasyonlar    = useMemo(() => lokasyonlar.filter(l => l.parent_id === ustLokasyonId), [lokasyonlar, ustLokasyonId])
  const altAltLokasyonlar = useMemo(() => lokasyonlar.filter(l => l.parent_id === altLokasyonId), [lokasyonlar, altLokasyonId])
  const hasAltAlt         = altLokasyonId !== '' && altAltLokasyonlar.length > 0

  // Lokasyon listesini çek
  useEffect(() => {
    if (!currentFirmaId) { setLokasyonlar([]); return }
    const p = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId) p.set('projeId', projeId)
    fetch(`/api/lokasyonlar-list?${p}`, { cache: 'no-store' })
      .then(r => r.json()).then(d => setLokasyonlar(Array.isArray(d) ? d : []))
      .catch(() => setLokasyonlar([]))
  }, [currentFirmaId, projeId])

  // Firma vardiya ayarını çek (dropdown label'ları için)
  useEffect(() => {
    if (!currentFirmaId) { setFirmaVardiyalari([]); return }
    fetch(`/api/firma/vardiya-ayarlari?firma_id=${currentFirmaId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setFirmaVardiyalari(j?.ok ? (j.vardiyalar ?? []) : []))
      .catch(() => setFirmaVardiyalari([]))
  }, [currentFirmaId])

  // Tek üst lokasyona yetkisi olan U/M rollerinde otomatik seç — alt lokasyon filtresi açılsın
  useEffect(() => {
    if (!ustLokasyonId && ustLokasyonlar.length === 1) {
      setUstLokasyonId(ustLokasyonlar[0].id)
    }
  }, [ustLokasyonlar, ustLokasyonId])

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId)           p.set('projeId', projeId)
    if (ustLokasyonId)     p.set('ustLokasyonId', ustLokasyonId)
    if (altLokasyonId)     p.set('altLokasyonId', altLokasyonId)
    if (altAltLokasyonId)  p.set('altAltLokasyonId', altAltLokasyonId)
    if (raporBaslangic)    p.set('raporBaslangic', raporBaslangic)
    if (raporBitis)        p.set('raporBitis', raporBitis)
    if (raporuAlan)        p.set('raporuAlan', raporuAlan)
    if (vardiyaFilter !== 'all') p.set('vardiya', vardiyaFilter)
    return p
  }, [currentFirmaId, projeId, ustLokasyonId, altLokasyonId, altAltLokasyonId, raporBaslangic, raporBitis, raporuAlan, vardiyaFilter])

  const fetchData = useCallback(async () => {
    if (!currentFirmaId) return
    // Önceki devam eden request'i iptal et
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const myId = ++requestIdRef.current
    setLoading(true)
    try {
      const res  = await fetch(`/api/reports/genel-rapor?${buildParams()}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Veri alınamadı.')
      // Bu request en son başlatılan değilse sonucu yoksay (race koruma)
      if (myId !== requestIdRef.current) return
      setData(json)
    } catch (e: any) {
      if (e?.name === 'AbortError') return  // iptal edilen request — sessizce yut
      if (myId !== requestIdRef.current) return  // eski request hatası — yoksay
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      if (myId === requestIdRef.current) setLoading(false)
    }
  }, [buildParams, currentFirmaId, toast])

  // Detay tabloların cache key'i — filtreler değişince cache invalidate olur.
  const filterKey = useMemo(() => JSON.stringify({
    f: currentFirmaId, p: projeId ?? '', u: ustLokasyonId, a: altLokasyonId, aa: altAltLokasyonId,
    b: raporBaslangic, t: raporBitis, v: vardiyaFilter,
  }), [currentFirmaId, projeId, ustLokasyonId, altLokasyonId, altAltLokasyonId, raporBaslangic, raporBitis, vardiyaFilter])

  function tabToTip(tab: Tab): DetayTip | null {
    switch (tab) {
      case 'Tamamlanan':       return 'tamamlanan'
      case 'Sapmalar':         return 'sapma'
      case 'Kayıp Frekanslar': return 'kayip'
      case 'Frekans Dışı':     return 'frekans_disi'
      case 'Atanan Frekanslar':return 'atanan'
      default: return null
    }
  }

  const fetchDetay = useCallback(async (tip: DetayTip, offset: number = 0, append: boolean = false) => {
    if (!currentFirmaId) return
    setDetayState(prev => ({ ...prev, [tip]: { ...prev[tip], loading: true } }))
    try {
      const params = new URLSearchParams({ firmaId: currentFirmaId, tip, offset: String(offset), limit: '200' })
      if (projeId) params.set('projeId', projeId)
      if (ustLokasyonId) params.set('ustLokasyonId', ustLokasyonId)
      if (altLokasyonId) params.set('altLokasyonId', altLokasyonId)
      if (altAltLokasyonId) params.set('altAltLokasyonId', altAltLokasyonId)
      if (raporBaslangic) params.set('raporBaslangic', raporBaslangic)
      if (raporBitis) params.set('raporBitis', raporBitis)
      if (vardiyaFilter !== 'all') params.set('vardiya', vardiyaFilter)
      const res = await fetch(`/api/reports/genel-rapor-detay?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Detay verisi alınamadı.')
      setDetayState(prev => ({
        ...prev,
        [tip]: {
          rows: append ? [...prev[tip].rows, ...(json.rows ?? [])] : (json.rows ?? []),
          total: json.total ?? 0,
          hasMore: !!json.hasMore,
          loading: false,
          loadedFor: filterKey,
          islemSureleriAktif: json.islemSureleriAktif ?? null,
        },
      }))
    } catch (e: any) {
      setDetayState(prev => ({ ...prev, [tip]: { ...prev[tip], loading: false } }))
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Detay yüklenemedi' })
    }
  }, [currentFirmaId, projeId, ustLokasyonId, altLokasyonId, altAltLokasyonId, raporBaslangic, raporBitis, vardiyaFilter, filterKey, toast])

  // Tab değişince veya filtre değişince ilgili detay tipini yükle (yoksa).
  useEffect(() => {
    if (!currentFirmaId) return
    const tip = tabToTip(activeTab)
    if (!tip) return
    const s = detayStateRef.current[tip]
    if (s.loading) return
    if (s.loadedFor === filterKey) return
    fetchDetay(tip, 0, false)
  }, [activeTab, filterKey, currentFirmaId, fetchDetay])

  useEffect(() => {
    if (!currentFirmaId) return
    clearTimeout(debRef.current)
    debRef.current = setTimeout(fetchData, 600)
    return () => clearTimeout(debRef.current)
  }, [fetchData, currentFirmaId])

  async function downloadExcel() {
    if (!data || !currentFirmaId) return
    setDlLoading(true)
    try {
      const res = await fetch(`/api/reports/genel-rapor-excel?${buildParams()}`)
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Excel indirilemedi.')
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `frekansiyel-rapor-${Date.now()}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setDlLoading(false)
  }

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '7px 16px', borderRadius: 6, fontSize: 13.5, fontWeight: 600,
    border: 'none', cursor: 'pointer', transition: 'all .15s',
    background: activeTab === t ? T.blue : 'transparent',
    color: activeTab === t ? '#fff' : T.textSoft,
  })

  const toplamHedef = data ? (data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0) || data.toplamGorev) : 0

  // ── Özet sekmesi için türetilmiş veriler ──────────────────────────
  const ozetData = useMemo(() => {
    if (!data) return null
    const toplamGerceklesen = data.toplamTamamlanan + data.toplamSapma
    const genelOran = toplamHedef > 0 ? Math.round(toplamGerceklesen / toplamHedef * 100) : 0

    // Özet sayfasının grafik verileri artık backend'de hesaplanıyor (ozetAgg).
    // Detay listeler lazy load olduğu için frontend bunlardan agg yapamaz.
    const agg = data.ozetAgg
    const persBazli = (agg?.personelTamamlananTop ?? []).map(x => ({ personel: x.key, sayi: x.sayi }))
    const lokBazli = (agg?.lokasyonTamamlananTop ?? []).map(x => ({ lokasyon: x.key, sayi: x.sayi }))
    const kayipNedeni = (agg?.kayipNedeniDagilim ?? []).map(x => ({ neden: x.neden, sayi: x.sayi }))
    const sapmaNedeni = (agg?.sapmaNedeniDagilim ?? []).map(x => ({ neden: x.neden, sayi: x.sayi }))

    // Grup bazlı tamamlanan (aynı isimli grupları birleştir, tüm gruplar)
    const grupAgg = new Map<string, { tamamlanan: number; hedef: number; sapma: number; kayip: number }>()
    for (const g of data.grupMetrikleri) {
      const ex = grupAgg.get(g.grup) ?? { tamamlanan: 0, hedef: 0, sapma: 0, kayip: 0 }
      grupAgg.set(g.grup, { tamamlanan: ex.tamamlanan + g.tamamlanan, hedef: ex.hedef + g.hedef, sapma: ex.sapma + g.sapma, kayip: ex.kayip + g.kayip })
    }
    const grupBazli = [...grupAgg.entries()]
      .map(([grup, v]) => ({ grup, ...v }))
      .sort((a, b) => b.tamamlanan - a.tamamlanan)

    // Kayıp / Sapma — lokasyon bazlı (backend agg)
    const kayipLokBazli = (agg?.kayipLokasyonTop ?? []).map(x => ({ lokasyon: x.key, sayi: x.sayi }))
    const sapmaLokBazli = (agg?.sapmaLokasyonTop ?? []).map(x => ({ lokasyon: x.key, sayi: x.sayi }))

    // Atanan frekanslar — personel bazlı başarı (backend agg)
    const persBazliBasari = (agg?.atananPersonelBasari ?? []).map(v => ({
      personel: v.personel,
      atanan: v.atanan,
      tamamlanan: v.tamamlanan,
      sapma: v.sapma,
      kayip: v.kayip,
      aktif: v.aktif,
      basariOrani: v.atanan > 0 ? Math.round(v.tamamlanan / v.atanan * 100) : 0,
    }))

    return { toplamGerceklesen, genelOran, persBazli, lokBazli, kayipNedeni, sapmaNedeni, grupBazli, kayipLokBazli, sapmaLokBazli, persBazliBasari }
  }, [data, toplamHedef])

  return (
    <div>
      <Topbar title="Frekansiyel Görevler Raporu" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Frekansiyel Görevler Raporu' }]} />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, overflow: 'hidden' }}>

        {/* ── Filtreler + export ── */}
        <div className="verde-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>QR-SYNC Frekansiyel Raporu</div>
              <h2 style={{ fontSize: 19, fontWeight: 900, color: T.text, margin: 0 }}>Frekansiyel Görevler Raporu</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={fetchData} disabled={loading || !currentFirmaId}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.grayLight, color: T.gray, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                <RefreshCw size={13} style={loading ? spinning : {}} />
                {loading ? 'Yükleniyor…' : 'Yenile'}
              </button>
              <button onClick={downloadExcel} disabled={!data || dlLoading}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #d1fae5', background: '#f9fafb', color: T.green, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                <FileSpreadsheet size={13} style={dlLoading ? spinning : {}} />
                Excel İndir
              </button>
            </div>
          </div>

          {/* Filtre grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10 }}>
            {([
              { label: 'Başlangıç',    node: <input type="date" value={raporBaslangic} onChange={e => setRaporBaslangic(e.target.value)} style={inp} /> },
              { label: 'Bitiş',        node: <input type="date" value={raporBitis}     onChange={e => setRaporBitis(e.target.value)}     style={inp} /> },
              { label: 'Vardiya',      node: (
                <select value={vardiyaFilter} onChange={e => setVardiyaFilter(e.target.value as any)} style={inp}
                  title="Aktif olma saatine göre vardiya filtresi (TRT)">
                  <option value="all">Tümü</option>
                  {firmaVardiyalari.map(v => (
                    <option key={v.no} value={`v${v.no}`}>{v.no}. Vardiya ({v.baslangic.slice(0,5)}-{v.bitis.slice(0,5)})</option>
                  ))}
                </select>
              )},
              { label: 'Üst Lokasyon', node: (
                <select value={ustLokasyonId} onChange={e => { setUstLokasyonId(e.target.value); setAltLokasyonId(''); setAltAltLokasyonId('') }} style={inp}>
                  <option value="">Tümü</option>
                  {ustLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              )},
              { label: 'Alt Lokasyon', node: (
                <select value={altLokasyonId} onChange={e => { setAltLokasyonId(e.target.value); setAltAltLokasyonId('') }} style={inp} disabled={!ustLokasyonId}>
                  <option value="">Tümü</option>
                  {altLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              )},
              ...(hasAltAlt ? [{ label: 'Alt-Alt Lokasyon', node: (
                <select value={altAltLokasyonId} onChange={e => setAltAltLokasyonId(e.target.value)} style={inp}>
                  <option value="">Tümü</option>
                  {altAltLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              )}] : []),
              { label: 'Raporu Alan',  node: <input type="text" value={raporuAlan} onChange={e => setRaporuAlan(e.target.value)} placeholder="Ad Soyad" style={inp} /> },
            ] as { label: string; node: React.ReactNode }[]).map(({ label, node }) => (
              <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</span>
                {node}
              </label>
            ))}
          </div>
        </div>

        {/* Boş durum */}
        {!data && !loading && (
          <div className="verde-card" style={{ padding: 48, textAlign: 'center', color: T.textSoft }}>
            <Activity size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
            <div style={{ fontWeight: 700 }}>Filtre seçildiğinde rapor otomatik yüklenecek.</div>
          </div>
        )}

        {/* ── İçerik ── */}
        {data && (
          <>
            {/* KPI kartlar */}
            {(() => {
              const sapmaPct  = toplamHedef > 0 ? Math.round(data.toplamSapma  / toplamHedef * 100) : 0
              const kayipPct  = toplamHedef > 0 ? Math.round(data.toplamKayip  / toplamHedef * 100) : 0
              const tamPct    = toplamHedef > 0 ? Math.round(data.toplamTamamlanan / toplamHedef * 100) : 0
              const frekansPct = toplamHedef > 0 ? Math.round(data.toplamEkstra / toplamHedef * 100) : 0
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 10 }}>
                  <KpiCard label="Hedef"        value={toplamHedef}                        color={T.blue}    Icon={Target} />
                  <KpiCard label="Tamamlanan"   value={data.toplamTamamlanan}              color={T.green}   Icon={CheckCircle}   pct={`%${tamPct}`} />
                  <KpiCard label="Sapma"        value={data.toplamSapma}                   color={T.amber}   Icon={AlertTriangle} pct={`%${sapmaPct}`} />
                  <KpiCard label="Kayıp"        value={data.toplamKayip}                   color={T.red}     Icon={XCircle}       pct={`%${kayipPct}`} />
                  <KpiCard label="Frekans Dışı" value={data.toplamEkstra}    color={T.gray}    Icon={Activity}      pct={`%${frekansPct}`} />
                  <KpiCard label="Rapor Dönemi" value={`${data.gunSayisi} gün`}            color={T.blueMid} Icon={Clock}         sub={raporBaslangic && raporBitis ? `${raporBaslangic} – ${raporBitis}` : 'Tüm dönem'} />
                </div>
              )
            })()}

            {/* Meta bandı */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13.5, color: T.textSoft, padding: '9px 16px', background: T.grayLight, borderRadius: 8, border: `1px solid ${T.border}` }}>
              <span><strong>Firma:</strong> {data.firmaAdi}</span>
              {data.projeAdi && <span><strong>Proje:</strong> {data.projeAdi}</span>}
              {data.ustLokTanim && <span><strong>Üst Lok.:</strong> {data.ustLokTanim}</span>}
              {data.altLokTanim && <span><strong>Alt Lok.:</strong> {data.altLokTanim}</span>}
              <span><strong>Dönem:</strong> {data.raporTarihLabel}</span>
              {data.raporuAlan && <span><strong>Raporu Alan:</strong> {data.raporuAlan}</span>}
            </div>

            {/* Sekme navigasyon + Gruplandır (sadece Grup Metrikleri + üst lokasyon filtresi varken) */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 4, background: T.grayLight, borderRadius: 8, padding: 4, flexWrap: 'wrap', border: `1px solid ${T.border}` }}>
                {TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>{t}</button>)}
              </div>
              {ustLokasyonId && activeTab === 'Grup Metrikleri' && (
                <button
                  onClick={() => setGruplandir(g => !g)}
                  title={gruplandir ? 'Lokasyon bazlı görünüme dön' : 'Aynı gruptaki lokasyonları birleştirip grup bazında listele'}
                  style={{
                    padding: '7px 14px', borderRadius: 8, fontSize: 13.5, fontWeight: 700,
                    border: `1px solid ${gruplandir ? T.green : T.border}`, cursor: 'pointer',
                    background: gruplandir ? T.green : '#fff',
                    color: gruplandir ? '#fff' : T.greenMid,
                    transition: 'all .15s',
                  }}>
                  {gruplandir ? '✓ Gruplandı' : '⚏ Gruplandır'}
                </button>
              )}
            </div>

            {/* ── ÖZET & GRAFİKLER ── */}
            {activeTab === 'Özet & Grafikler' && ozetData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* ── 1. Genel Performans Paneli ── */}
                <div className="verde-card" style={{ padding: '20px 24px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 14 }}>Genel Performans Özeti</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap', marginBottom: 16 }}>
                    {/* Büyük oran rozeti */}
                    <div style={{ textAlign: 'center', minWidth: 90 }}>
                      <div style={{ fontSize: 60, fontWeight: 900, lineHeight: 1, color: ozetData.genelOran >= 80 ? T.green : ozetData.genelOran >= 50 ? T.amber : T.red }}>
                        %{ozetData.genelOran}
                      </div>
                      <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>Genel Oran</div>
                    </div>
                    {/* Progress bar alanı */}
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: T.textSoft, marginBottom: 6 }}>
                        <span>{ozetData.toplamGerceklesen} gerçekleşen</span>
                        <span>{toplamHedef} hedef</span>
                      </div>
                      <div style={{ height: 14, background: T.border, borderRadius: 7, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(ozetData.genelOran, 100)}%`, background: ozetData.genelOran >= 80 ? T.green : ozetData.genelOran >= 50 ? T.amber : T.red, borderRadius: 7, transition: 'width .6s ease' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {[
                          { label: 'Tamamlanan', value: data.toplamTamamlanan, pct: toplamHedef > 0 ? Math.round(data.toplamTamamlanan / toplamHedef * 100) : 0, color: T.greenMid },
                          { label: 'Sapma',      value: data.toplamSapma,      pct: toplamHedef > 0 ? Math.round(data.toplamSapma / toplamHedef * 100) : 0, color: T.amber },
                          { label: 'Kayıp',      value: data.toplamKayip,      pct: toplamHedef > 0 ? Math.round(data.toplamKayip / toplamHedef * 100) : 0, color: T.red },
                        ].map(s => (
                          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: T.textSoft }}>
                            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                            <strong style={{ color: s.color }}>{s.value}</strong> {s.label} <span style={{ color: T.border }}>·</span> %{s.pct}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* 6 stat grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 10 }}>
                    {[
                      { label: 'Hedef Frekans',  value: toplamHedef,                   color: T.blue,    bg: T.blueLight },
                      { label: 'Tamamlanan',      value: data.toplamTamamlanan,         color: T.green,   bg: T.greenLight },
                      { label: 'Gerçekleşen',     value: ozetData.toplamGerceklesen,    color: T.greenMid,bg: '#f9fafb' },
                      { label: 'Sapma',           value: data.toplamSapma,              color: T.amber,   bg: T.amberLight },
                      { label: 'Kayıp',           value: data.toplamKayip,              color: T.red,     bg: T.redLight },
                      { label: 'Frekans Dışı',    value: data.toplamEkstra, color: T.gray,  bg: T.grayLight },
                      { label: 'Rapor Dönemi',    value: `${data.gunSayisi} gün`,       color: T.gray,    bg: T.grayLight },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', background: s.bg, borderRadius: 8, textAlign: 'center', border: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: T.textSoft, marginTop: 3, fontWeight: 600 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── 1b. Departman Analizi (Genel Performans'ın hemen altında) ── */}
                {(() => {
                  const departmanlar = data.ozetAgg?.departmanMetrikleri ?? []
                  if (departmanlar.length === 0) return null
                  const filtreli = ustLokasyonId
                    ? departmanlar.filter(d => d.ustLokasyonId === ustLokasyonId)
                    : departmanlar
                  if (filtreli.length === 0) return null

                  // Tek bir departman görünümünde küçük yardımcı row bileşeni
                  const pctOf = (v: number, t: number) => t > 0 ? Math.round(v / t * 100) : 0
                  const OzetRow = ({ label, value, sub, color, bold }: { label: string; value: string | number; sub?: string; color?: string; bold?: boolean }) => (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', borderBottom: `1px dashed ${T.border}`, fontSize: 13 }}>
                      <span style={{ color: T.textSoft, fontWeight: 600 }}>{label}</span>
                      <span style={{ fontWeight: bold ? 900 : 800, color: color ?? T.text, fontSize: bold ? 14.5 : 13 }}>
                        {value}{sub && <span style={{ color: T.textSoft, fontWeight: 600, fontSize: 11.5, marginLeft: 4 }}>{sub}</span>}
                      </span>
                    </div>
                  )

                  return (
                    <div className="verde-card" style={{ padding: '20px 24px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 14 }}>Departman Analizi</div>
                      {ustLokasyonId ? (() => {
                        const d = filtreli[0]
                        const basari = pctOf(d.tamamlanan, d.hedef)
                        return (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, alignItems: 'stretch' }}>
                            <DepartmanGraph d={d} expanded />
                            <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em', alignSelf: 'flex-start' }}>Genel Dağılım</div>
                              <PieChart size={200} slices={[
                                { label: 'Tamamlandı', value: d.tamamlanan, color: T.greenMid },
                                { label: 'Sapma',      value: d.sapma,      color: T.amber },
                                { label: 'Kayıp',      value: d.kayip,      color: T.red },
                              ]} />
                            </div>
                            <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 18px', minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Özet</div>
                              <OzetRow label="Hedef Frekans" value={d.hedef} color={T.blue} bold />
                              <OzetRow label="Tamamlanan" value={d.tamamlanan} sub={`%${pctOf(d.tamamlanan, d.hedef)}`} color={T.green} />
                              <OzetRow label="Sapma"      value={d.sapma}      sub={`%${pctOf(d.sapma, d.hedef)}`}      color={T.amber} />
                              <OzetRow label="Kayıp"      value={d.kayip}      sub={`%${pctOf(d.kayip, d.hedef)}`}      color={T.red} />
                              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: basari >= 80 ? '#dcfce7' : basari >= 50 ? T.amberLight : T.redLight, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: basari >= 80 ? T.green : basari >= 50 ? T.amber : T.red, textTransform: 'uppercase' as const }}>Başarı</span>
                                <span style={{ fontSize: 20, fontWeight: 900, color: basari >= 80 ? T.green : basari >= 50 ? T.amber : T.red }}>%{basari}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })() : (
                        // Tek satır: tüm departmanlar eşit pay, sayfa darsa yatay scroll
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: `repeat(${filtreli.length}, minmax(220px, 1fr))`,
                          gap: 12,
                          overflowX: 'auto',
                        }}>
                          {filtreli.map(d => <DepartmanGraph key={d.ustLokasyonId} d={d} />)}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* ── 2. Frekans Dağılımı | Grup Bazlı Tamamlanan ── */}
                <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 16, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Frekans Dağılımı &amp; Grup Bazlı Tamamlanan</div>
                  <div style={{ display: 'flex', gap: 56, alignItems: 'flex-start', minWidth: 0 }}>
                    <div style={{ flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 10, textTransform: 'uppercase' as const }}>Genel Dağılım</div>
                      <PieChart size={280} slices={[
                        { label: 'Tamamlanan', value: data.toplamTamamlanan, color: T.greenMid },
                        { label: 'Sapma',      value: data.toplamSapma,      color: T.amber },
                        { label: 'Kayıp',      value: data.toplamKayip,      color: T.red },
                      ]} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 6, textTransform: 'uppercase' as const }}>Grup Bazlı Tamamlanan</div>
                      <BarChart data={ozetData.grupBazli} valueKey="tamamlanan" labelKey="grup" color={T.greenMid} />
                    </div>
                  </div>
                </div>

                {/* ── 3. Personel Başarı Analizi (pasta + bar) ── */}
                {ozetData.persBazliBasari.length > 0 && (() => {
                  const topTam  = ozetData.persBazliBasari.reduce((s, r) => s + r.tamamlanan, 0)
                  const topSap  = ozetData.persBazliBasari.reduce((s, r) => s + r.sapma, 0)
                  const topKay  = ozetData.persBazliBasari.reduce((s, r) => s + r.kayip, 0)
                  return (
                    <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Personel Başarı Analizi (İlk 10)</div>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: T.blueLight, color: T.blue }}>{Math.min(ozetData.persBazliBasari.length, 10)} personel</span>
                      </div>
                      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 0 }}>
                        <div style={{ flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 10, textTransform: 'uppercase' as const }}>Toplam Atanan Dağılımı</div>
                          <PieChart size={200} slices={[
                            { label: 'Tamamlanan', value: topTam, color: T.greenMid },
                            { label: 'Sapma',      value: topSap, color: T.amber },
                            { label: 'Kayıp',      value: topKay, color: T.red },
                          ]} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 6, textTransform: 'uppercase' as const }}>Tamamlanan (İlk 10)</div>
                          <BarChart data={ozetData.persBazliBasari.slice(0, 10)} valueKey="tamamlanan" labelKey="personel" color={T.greenMid} />
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {/* ── 2. Sapma Frekanslar: 1/3 pasta | 1/3 bar | 1/3 sıralı liste ── */}
                <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Sapma Frekanslar</div>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: T.amberLight, color: T.amber, flexShrink: 0 }}>{data.toplamSapma} kayıt</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, alignItems: 'flex-start', minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 10, textTransform: 'uppercase' as const }}>Hedef / Sapma Oranı</div>
                      <PieChart size={240} slices={[
                        { label: 'Sapma',       value: data.toplamSapma,                                       color: T.amber },
                        { label: 'Hedef Kalan', value: Math.max(0, toplamHedef - data.toplamSapma),            color: '#e2e8f0' },
                      ]} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 6, textTransform: 'uppercase' as const }}>Lokasyon Bazlı Sapma (İlk 10)</div>
                      {ozetData.sapmaLokBazli.length > 0
                        ? <BarChart data={ozetData.sapmaLokBazli} valueKey="sayi" labelKey="lokasyon" color={T.amber} />
                        : <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Sapma kayıt yok</div>
                      }
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 6, textTransform: 'uppercase' as const }}>Sıralı Liste</div>
                      {ozetData.sapmaLokBazli.length > 0
                        ? <SiraliListe items={ozetData.sapmaLokBazli.map(x => ({ label: x.lokasyon, value: x.sayi }))} />
                        : <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
                      }
                    </div>
                  </div>
                </div>

                {/* ── 3. Kayıp Frekanslar: 1/3 pasta | 1/3 bar | 1/3 sıralı liste ── */}
                <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Kayıp Frekanslar</div>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: T.redLight, color: T.red, flexShrink: 0 }}>{data.toplamKayip} kayıt</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24, alignItems: 'flex-start', minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 10, textTransform: 'uppercase' as const }}>Hedef / Kayıp Oranı</div>
                      <PieChart size={240} slices={[
                        { label: 'Kayıp',       value: data.toplamKayip,                                       color: T.red },
                        { label: 'Hedef Kalan', value: Math.max(0, toplamHedef - data.toplamKayip),            color: '#e2e8f0' },
                      ]} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 6, textTransform: 'uppercase' as const }}>Lokasyon Bazlı Kayıp (İlk 10)</div>
                      {ozetData.kayipLokBazli.length > 0
                        ? <BarChart data={ozetData.kayipLokBazli} valueKey="sayi" labelKey="lokasyon" color={T.red} />
                        : <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Kayıp kayıt yok</div>
                      }
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 6, textTransform: 'uppercase' as const }}>Sıralı Liste</div>
                      {ozetData.kayipLokBazli.length > 0
                        ? <SiraliListe items={ozetData.kayipLokBazli.map(x => ({ label: x.lokasyon, value: x.sayi }))} />
                        : <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
                      }
                    </div>
                  </div>
                </div>

                {/* ── 4. Lokasyon Bazlı Tamamlanan (sol: yatay bar | sağ: sıralı liste) ── */}
                <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Lokasyon Bazlı Tamamlanan Görevler</div>
                  {ozetData.lokBazli.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 32, alignItems: 'stretch' }}>
                      <div style={{ minWidth: 0 }}>
                        <BarChart data={ozetData.lokBazli} valueKey="sayi" labelKey="lokasyon" color={T.blueMid} />
                      </div>
                      <div style={{ background: T.border }} />
                      <div style={{ minWidth: 0 }}>
                        <SiraliListe items={ozetData.lokBazli.map(x => ({ label: x.lokasyon, value: x.sayi }))} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
                  )}
                </div>

                {/* ── 5. Personel Bazlı Tamamlanan (sol: yatay bar | sağ: sıralı liste) ── */}
                <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Personel Bazlı Tamamlanan Göreveler</div>
                  {ozetData.persBazli.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', gap: 32, alignItems: 'stretch' }}>
                      <div style={{ minWidth: 0 }}>
                        <BarChart data={ozetData.persBazli} valueKey="sayi" labelKey="personel" color={T.blue} />
                      </div>
                      <div style={{ background: T.border }} />
                      <div style={{ minWidth: 0 }}>
                        <SiraliListe items={ozetData.persBazli.map(x => ({ label: x.personel, value: x.sayi }))} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
                  )}
                </div>

              </div>
            )}

            {/* ── GRUP METRİKLERİ ── */}
            {activeTab === 'Grup Metrikleri' && (() => {
              // Gruplandır modu: aynı grup adındakileri birleştir, metrikleri topla, oranları yeniden hesapla
              const grupMetrikleriDisplay = !gruplandir ? data.grupMetrikleri : (() => {
                const agg = new Map<string, GrupMetrik & { lokasyonSayisi: number }>()
                for (const g of data.grupMetrikleri) {
                  const ex = agg.get(g.grup)
                  if (!ex) { agg.set(g.grup, { ...g, lokasyon: '', lokasyonSayisi: 1 }); continue }
                  ex.gunlukFrekans += g.gunlukFrekans
                  ex.kuralSayisi   += g.kuralSayisi
                  ex.hedef         += g.hedef
                  ex.tamamlanan    += g.tamamlanan
                  ex.sapma         += g.sapma
                  ex.kayip         += g.kayip
                  ex.ekstra         = (ex.ekstra ?? 0) + (g.ekstra ?? 0)
                  ex.lokasyonSayisi++
                }
                return [...agg.values()].map(g => {
                  const ger = g.tamamlanan + (g.ekstra ?? 0)
                  const bas = g.hedef > 0 ? Math.round(ger / g.hedef * 100) : 0
                  const gen = g.hedef > 0 ? Math.round((ger + g.sapma) / g.hedef * 100) : 0
                  return { ...g, basariOrani: `%${bas}`, genelOran: `%${gen}` }
                })
              })()
              return (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Grup Frekans Metrikleri{gruplandir ? ' (Grup Bazlı)' : ''}</div>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: T.blueLight, color: T.blue }}>
                    {grupMetrikleriDisplay.length} {gruplandir ? 'grup' : 'satır'}
                  </span>
                </div>
                {/* Toplamlar — gruplandır modunda da aynı toplamlar (sums değişmez) */}
                {grupMetrikleriDisplay.length > 0 && (() => {
                  const tGunluk = grupMetrikleriDisplay.reduce((s, g) => s + g.gunlukFrekans, 0)
                  const tHedef  = grupMetrikleriDisplay.reduce((s, g) => s + g.hedef, 0)
                  const tTam    = grupMetrikleriDisplay.reduce((s, g) => s + g.tamamlanan, 0)
                  const tSap    = grupMetrikleriDisplay.reduce((s, g) => s + g.sapma, 0)
                  const tKay    = grupMetrikleriDisplay.reduce((s, g) => s + g.kayip, 0)
                  const tEks    = grupMetrikleriDisplay.reduce((s, g) => s + (g.ekstra ?? 0), 0)
                  const tGer    = tTam + tEks
                  const tBas    = tHedef > 0 ? Math.round(tGer / tHedef * 100) : 0
                  const tGenel  = tHedef > 0 ? Math.round((tGer + tSap) / tHedef * 100) : 0
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px,1fr))', gap: 8, marginBottom: 14, padding: '10px 12px', background: T.greenLight, borderRadius: 8, border: `1px solid #bbf7d0` }}>
                      {[
                        { label: 'Vardiya Frekans', value: tGunluk, color: T.blue },
                        { label: 'Hedef',          value: tHedef,  color: T.blue },
                        { label: 'Tamamlanan',     value: tTam,    color: T.green },
                        { label: 'Ekstra',         value: tEks,    color: T.blueMid },
                        { label: 'Sapma',          value: tSap,    color: T.amber },
                        { label: 'Kayıp',          value: tKay,    color: T.red },
                        { label: 'Başarı',         value: `%${tBas}`, color: T.green },
                        { label: 'Genel Oran',     value: `%${tGenel}`, color: T.gray },
                      ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.value}</div>
                          <div style={{ fontSize: 10, color: T.textSoft, marginTop: 1 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
                {gruplandir ? (
                  <DataTable
                    headers={['SN', 'GRUP', 'LOKASYON SAYISI', 'VARDİYA FREKANS', 'GÜNLÜK VARDİYA', 'HEDEF', 'TAMAMLANAN', 'EKSTRA', 'SAPMA', 'KAYIP', 'BAŞARI', 'GENEL ORAN']}
                    rows={grupMetrikleriDisplay.map((g, i) => [i + 1, g.grup, (g as any).lokasyonSayisi ?? 1, g.gunlukFrekans, g.kuralSayisi, g.hedef, g.tamamlanan, g.ekstra ?? 0, g.sapma, g.kayip, g.basariOrani, g.genelOran])}
                    accentCol={10} accentColor={T.greenMid} leftCols={[1]}
                  />
                ) : (
                  <DataTable
                    headers={['SN', 'GRUP',
                      altAltLokasyonId ? 'ALT LOKASYON' : altLokasyonId ? 'ÜST LOKASYON' : 'ÜST LOKASYON',
                      altAltLokasyonId ? 'ALT-ALT LOKASYON' : altLokasyonId ? 'ALT LOKASYON' : 'LOKASYON',
                      'VARDİYA FREKANS', !ustLokasyonId ? 'VARDİYA SAYISI' : 'GÜNLÜK VARDİYA', 'HEDEF', 'TAMAMLANAN', 'EKSTRA', 'SAPMA', 'KAYIP', 'BAŞARI', 'GENEL ORAN']}
                    rows={grupMetrikleriDisplay.map((g, i) => [i + 1, g.grup, g.ustLokasyon, g.lokasyon, g.gunlukFrekans, !ustLokasyonId ? g.kuralSayisi * (data.gunSayisi || 1) : g.kuralSayisi, g.hedef, g.tamamlanan, g.ekstra ?? 0, g.sapma, g.kayip, g.basariOrani, g.genelOran])}
                    accentCol={11} accentColor={T.greenMid} leftCols={[1, 2, 3]}
                  />
                )}
              </div>
              )
            })()}

            {/* islemSureleriAktif=false ise GÖREV SAATLERİ ve GÖREV SÜRESİ sütunları gizlenir */}
            {(() => null)()}
            {activeTab === 'Tamamlanan' && (() => {
              const ds = detayState.tamamlanan
              if (ds.loading && ds.rows.length === 0) return <DetayLoader label="Tamamlanan görevler" />
              const sureli = (ds.islemSureleriAktif ?? data.islemSureleriAktif) !== false
              const headers = ['SN', 'PERSONEL', altAltLokasyonId ? 'ALT LOKASYON' : 'ÜST LOKASYON', altAltLokasyonId ? 'ALT-ALT LOKASYON' : 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH', ...(sureli ? ['GÖREV SAATLERİ', 'GÖREV SÜRESİ'] : []), 'DURUM']
              return (
                <div className="verde-card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Tamamlanan Frekanslar</div>
                    <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: '#dcfce7', color: T.green }}>{ds.rows.length} / {ds.total} kayıt</span>
                  </div>
                  <DataTable
                    headers={headers}
                    rows={ds.rows.map((r: any) => [r.sn, r.personel, r.ustLokasyon, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarih, ...(sureli ? [r.gorevSaatleri, r.gorevSuresi] : []), r.durum])}
                    filterable noFilterCols={[0]}
                  />
                  {ds.hasMore && <DahaFazlaButon loading={ds.loading} onClick={() => fetchDetay('tamamlanan', ds.rows.length, true)} />}
                </div>
              )
            })()}

            {activeTab === 'Sapmalar' && (() => {
              const ds = detayState.sapma
              if (ds.loading && ds.rows.length === 0) return <DetayLoader label="Sapma görevler" />
              const sureli = (ds.islemSureleriAktif ?? data.islemSureleriAktif) !== false
              const headers = ['SN', 'PERSONEL', altAltLokasyonId ? 'ALT LOKASYON' : 'ÜST LOKASYON', altAltLokasyonId ? 'ALT-ALT LOKASYON' : 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH', ...(sureli ? ['GÖREV SAATLERİ', 'GÖREV SÜRESİ'] : []), 'SAPMA NEDENİ']
              return (
                <div className="verde-card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Sapma Frekanslar</div>
                    <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: T.amberLight, color: T.amber }}>{ds.rows.length} / {ds.total} kayıt</span>
                  </div>
                  <DataTable
                    headers={headers}
                    rows={ds.rows.map((r: any) => [r.sn, r.personel, r.ustLokasyon, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarih, ...(sureli ? [r.gorevSaatleri, r.gorevSuresi] : []), r.sapmaNedeni])}
                    filterable noFilterCols={[0]}
                  />
                  {ds.hasMore && <DahaFazlaButon loading={ds.loading} onClick={() => fetchDetay('sapma', ds.rows.length, true)} />}
                </div>
              )
            })()}

            {activeTab === 'Kayıp Frekanslar' && (() => {
              const ds = detayState.kayip
              if (ds.loading && ds.rows.length === 0) return <DetayLoader label="Kayıp görevler" />
              // GÖREV SAATLERİ ve GÖREV SÜRESİ sütunları kaldırıldı (kayıp görevler
              // tamamlanmamış olduğu için anlamsız). Yerine İPTAL EDEN sütunu eklendi.
              const headers = ['SN', altAltLokasyonId ? 'ALT LOKASYON' : 'ÜST LOKASYON', altAltLokasyonId ? 'ALT-ALT LOKASYON' : 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH', 'İPTAL EDEN', 'DURUM', 'KAYIP NEDENİ']
              return (
                <div className="verde-card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Kayıp Frekanslar</div>
                    <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: T.redLight, color: T.red }}>{ds.rows.length} / {ds.total} kayıt</span>
                  </div>
                  <DataTable
                    headers={headers}
                    rows={ds.rows.map((r: any) => {
                      // Görev tanımında "VARDIYA" geçmiyorsa, üretildiği vardiya no'yu suffix olarak ekle
                      const tanim = (r.vardiyaNo && !/VARD[İI]YA/i.test(String(r.gorevTanimi ?? '')))
                        ? `${r.gorevTanimi}  ·  V${r.vardiyaNo}`
                        : r.gorevTanimi
                      return [r.sn, r.ustLokasyon, r.lokasyon, r.gorevNo, tanim, r.tarih, r.iptalEden ?? 'sistem', r.durum, r.kayipNedeni]
                    })}
                    filterable noFilterCols={[0]}
                  />
                  {ds.hasMore && <DahaFazlaButon loading={ds.loading} onClick={() => fetchDetay('kayip', ds.rows.length, true)} />}
                </div>
              )
            })()}

            {activeTab === 'Frekans Dışı' && (() => {
              const ds = detayState.frekans_disi
              if (ds.loading && ds.rows.length === 0) return <DetayLoader label="Frekans dışı çalışmalar" />
              const sureli = (ds.islemSureleriAktif ?? data.islemSureleriAktif) !== false
              // Ekstra görevler için GÖREV SÜRESİ kolonu kaldırıldı (online=0, offline=gerçek
              // ayrımı karışıklık yaratıyordu). GÖREV SAATLERİ yine gösteriliyor.
              const headers = ['SN', 'ÜST LOKASYON', 'GRUP TANIMI', 'LOKASYON', 'PERSONEL', 'TARİH', ...(sureli ? ['GÖREV SAATLERİ'] : []), 'AÇIKLAMA']
              return (
                <div className="verde-card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Frekans Dışı Çalışmalar (Ekstra Frekansiyel)</div>
                    <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: T.grayLight, color: T.gray }}>{ds.rows.length} / {ds.total} kayıt</span>
                  </div>
                  <DataTable
                    headers={headers}
                    rows={ds.rows.map((r: any) => [r.sn, r.ustLokasyon, r.grupTanimi, r.lokasyonTanimi, r.personel, r.tarih, ...(sureli ? [r.gorevSaatleri] : []), r.aciklama])}
                    filterable noFilterCols={[0]}
                  />
                  {ds.hasMore && <DahaFazlaButon loading={ds.loading} onClick={() => fetchDetay('frekans_disi', ds.rows.length, true)} />}
                </div>
              )
            })()}

            {/* ── ATANAN FREKANSLAR ── */}
            {activeTab === 'Atanan Frekanslar' && (() => {
              const ds = detayState.atanan
              if (ds.loading && ds.rows.length === 0) return <DetayLoader label="Atanan frekanslar" />
              return (
                <div className="verde-card" style={{ padding: '16px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Atanan Frekanslar</div>
                    <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: T.blueLight, color: T.blue }}>{ds.rows.length} / {ds.total} kayıt</span>
                  </div>
                  <DataTable
                    headers={['SN', 'ATANAN', 'TAMAMLAYAN', 'ÜST LOKASYON', 'LOKASYON', 'GÖREV TANIMI', 'GÖREV DURUMU', 'ATAMA TARİHİ', 'TAMAMLANMA TARİH+SAAT']}
                    rows={ds.rows.map((r: any) => [r.sn, r.atanan, r.tamamlayan, r.ustLokasyon, r.lokasyon, r.gorevTanimi, r.gorevDurumu, r.atamaTarihi, r.tamamlanmaTarihi])}
                    leftCols={[1, 2, 3, 4, 5]}
                  />
                  {ds.hasMore && <DahaFazlaButon loading={ds.loading} onClick={() => fetchDetay('atanan', ds.rows.length, true)} />}
                </div>
              )
            })()}
          </>
        )}
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
