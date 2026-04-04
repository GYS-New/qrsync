'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { RefreshCw, Clock, TrendingUp, TrendingDown, Activity, BarChart2, Users, MapPin, Zap } from 'lucide-react'

interface Props { base: string; isSA: boolean; tenantFirmaId?: string | null; projeId?: string | null; sureliGorevAktif?: boolean }

type Analiz = {
  ort: number; min: number; max: number; p50: number; p75: number; p90: number; p95: number
  ortBekleme: number; tamamlananSayi: number; toplam: number
}
type GunlukRow     = { tarih: string; ort_sure: number; adet: number }
type LokasyonRow   = { lokasyon: string; ort_sure: number; min_sure: number; max_sure: number; adet: number; hedef_sure: number | null; hedef_fark: number | null; hedef_fark_pct: number | null }
type PersonelRow   = { personel: string; ort_sure: number; tamamlanan: number; en_hizli: number; en_yavas: number }
type DagilimRow    = { aralik: string; adet: number }
type Bolum         = { analiz: Analiz; gunlukTrend: GunlukRow[]; lokasyon: LokasyonRow[]; personel: PersonelRow[]; dagilim: DagilimRow[] }
type SureData      = { ok: boolean; frekansiyel: Bolum; spesifik: Bolum; meta: { lokasyonlar: any[]; kullanicilar: any[] } }

// ── Tokens ────────────────────────────────────────────────────────────────
const T = {
  green: '#1a5c2a', greenMid: '#2e8b2e', greenLight: '#f0fdf4',
  blue: '#1d4ed8', blueMid: '#3b82f6', blueLight: '#eff6ff',
  amber: '#d97706', amberLight: '#fef3c7',
  red: '#dc2626', redLight: '#fee2e2',
  purple: '#7c3aed',
  teal: '#0d9488', tealLight: '#f0fdfa',
  gray: '#475569', grayLight: '#f8fafc', border: '#e2e8f0',
  text: '#0f172a', textSoft: '#64748b',
}
const spinning = { animation: 'spin 0.9s linear infinite' }
const inp: React.CSSProperties = {
  height: 34, padding: '0 10px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: '#fff', fontSize: 13, width: '100%',
}

// ── Süre format ───────────────────────────────────────────────────────────
function fmtS(sn: number): string {
  if (!sn || sn <= 0) return '—'
  const h = Math.floor(sn / 3600), m = Math.floor((sn % 3600) / 60), s = sn % 60
  if (h > 0) return `${h}s ${m}dk`
  if (m > 0) return `${m}dk ${s}sn`
  return `${s}sn`
}

// ── KPI Kart ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, Icon, wide }: {
  label: string; value: string; sub?: string; color: string; Icon: any; wide?: boolean
}) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
      padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12,
      gridColumn: wide ? 'span 2' : undefined,
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '18', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: T.text, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: T.textSoft, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── Yatay BarChart (div tabanlı — viewBox ölçekleme sorunu yok) ──────────
function HBarChart({ data, valueKey, labelKey, color }: {
  data: Record<string, any>[]; valueKey: string; labelKey: string; color: string
}) {
  if (!data.length) return <div style={{ color: T.textSoft, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Veri yok</div>
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0
        const pct = (val / max) * 100
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: i % 2 === 0 ? '#f8fafc' : '#fff', borderRadius: 4, padding: '3px 6px' }}>
            <div style={{ width: 200, flexShrink: 0, textAlign: 'right', fontSize: 12, color: T.textSoft, paddingRight: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {String(d[labelKey] ?? '')}
            </div>
            <div style={{ flex: 1, height: 12, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .4s', minWidth: val > 0 ? 3 : 0, opacity: 0.85 }} />
            </div>
            <div style={{ width: 72, flexShrink: 0, fontSize: 12, fontWeight: 700, color: T.text }}>
              {fmtS(val)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Dikey BarChart (SVG) ──────────────────────────────────────────────────
function VBarChart({ data, valueKey, labelKey, color }: {
  data: Record<string, any>[]; valueKey: string; labelKey: string; color: string
}) {
  if (!data.length) return <div style={{ color: T.textSoft, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>Veri yok</div>
  const max     = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1)
  const barW    = 44, gap = 20, barAreaH = 200, bottomH = 56, topPad = 24
  const totalW  = data.length * (barW + gap) + gap
  const svgH    = barAreaH + bottomH + topPad
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={totalW} height={svgH} style={{ display: 'block', minWidth: Math.min(totalW, 600) }}>
        {[0.25, 0.5, 0.75, 1].map(r => {
          const y = topPad + barAreaH * (1 - r)
          return <g key={r}>
            <line x1={0} y1={y} x2={totalW} y2={y} stroke="#e2e8f0" strokeWidth={0.5} />
            <text x={2} y={y - 3} fontSize={9} fill={T.textSoft}>{fmtS(Math.round(max * r))}</text>
          </g>
        })}
        {data.map((d, i) => {
          const val  = Number(d[valueKey]) || 0
          const bh   = (val / max) * barAreaH
          const x    = gap + i * (barW + gap)
          const y    = topPad + barAreaH - bh
          const lbl  = String(d[labelKey] ?? '').slice(0, 12)
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={Math.max(bh, 1)} fill={color} rx={3} opacity={0.88} />
              <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={10} fontWeight="bold" fill={T.gray}>{fmtS(val)}</text>
              <text x={x + barW / 2} y={topPad + barAreaH + 12} textAnchor="end" fontSize={10} fill={T.textSoft}
                transform={`rotate(-38, ${x + barW / 2}, ${topPad + barAreaH + 12})`}>{lbl}</text>
            </g>
          )
        })}
        <line x1={0} y1={topPad + barAreaH} x2={totalW} y2={topPad + barAreaH} stroke={T.border} strokeWidth={1} />
      </svg>
    </div>
  )
}

// ── Çizgi Grafik (SVG trend) ──────────────────────────────────────────────
function LineChart({ data, valueKey, labelKey, color }: {
  data: Record<string, any>[]; valueKey: string; labelKey: string; color: string
}) {
  if (data.length < 2) return <div style={{ color: T.textSoft, fontSize: 13, padding: '16px 0', textAlign: 'center' }}>{data.length === 1 ? 'Tek veri noktası' : 'Veri yok'}</div>
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1)
  const W = 460, H = 110, padX = 8, padT = 16, padB = 24
  const plotW = W - padX * 2, plotH = H - padT - padB
  const pts   = data.map((d, i) => {
    const x = padX + (i / (data.length - 1)) * plotW
    const y = padT + plotH - (Number(d[valueKey]) / max) * plotH
    return { x, y, val: Number(d[valueKey]), lbl: String(d[labelKey] ?? '') }
  })
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L${pts[pts.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${pts[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%' }}>
        <defs>
          <linearGradient id={`lg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map(r => {
          const y = padT + plotH * (1 - r)
          return <line key={r} x1={padX} y1={y} x2={W - padX} y2={y} stroke="#e2e8f0" strokeWidth={0.5} />
        })}
        <path d={areaD} fill={`url(#lg-${color.replace('#','')})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} fill={color} />
            {i % Math.max(1, Math.floor(pts.length / 8)) === 0 && (
              <text x={p.x} y={H - 4} textAnchor="middle" fontSize={7} fill={T.textSoft}>
                {p.lbl.slice(5)}
              </text>
            )}
          </g>
        ))}
        <line x1={padX} y1={padT + plotH} x2={W - padX} y2={padT + plotH} stroke={T.border} />
      </svg>
    </div>
  )
}

// ── Dağılım Bar ───────────────────────────────────────────────────────────
function DagilimBar({ data, color }: { data: DagilimRow[]; color: string }) {
  const max = Math.max(...data.map(d => d.adet), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: T.textSoft, width: 70, flexShrink: 0, textAlign: 'right' }}>{d.aralik}</span>
          <div style={{ flex: 1, height: 16, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(d.adet / max) * 100}%`, background: color, borderRadius: 3, transition: 'width .5s ease', minWidth: d.adet > 0 ? 4 : 0 }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text, width: 28, textAlign: 'right' }}>{d.adet}</span>
        </div>
      ))}
    </div>
  )
}

// ── Yüzdelik dilim göstergesi ─────────────────────────────────────────────
function PercentileCard({ analiz }: { analiz: Analiz }) {
  const items = [
    { label: 'Medyan (P50)', val: analiz.p50, color: T.green },
    { label: 'P75', val: analiz.p75, color: T.amber },
    { label: 'P90', val: analiz.p90, color: T.red },
    { label: 'P95', val: analiz.p95, color: '#9f1239' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {items.map(({ label, val, color }) => (
        <div key={label} style={{ padding: '10px 12px', background: color + '10', border: `1px solid ${color}30`, borderRadius: 8, borderLeft: `3px solid ${color}` }}>
          <div style={{ fontSize: 10.5, color, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: T.text, marginTop: 2 }}>{fmtS(val)}</div>
        </div>
      ))}
    </div>
  )
}

// ── Tablo ─────────────────────────────────────────────────────────────────
function Tablo({ headers, rows, color }: { headers: string[]; rows: (string|number)[][]; color: string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>{headers.map((h, i) => (
            <th key={i} style={{ padding: '7px 10px', background: color, color: '#fff', fontWeight: 700, fontSize: 11, textAlign: i === 0 ? 'left' : 'center', whiteSpace: 'nowrap' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={headers.length} style={{ padding: '20px', textAlign: 'center', color: T.textSoft }}>Veri bulunamadı.</td></tr>
            : rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? T.grayLight : '#fff' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '6px 10px', borderBottom: `1px solid ${T.border}`, textAlign: ci === 0 ? 'left' : 'center', fontSize: 12.5, fontWeight: ci === 0 ? 600 : 400 }}>{String(cell ?? '')}</td>
                ))}
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  )
}

// ── Bölüm başlığı ─────────────────────────────────────────────────────────
function SekHead({ title, color }: { title: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 16, borderRadius: 2, background: color }} />
      <span style={{ fontSize: 12, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{title}</span>
    </div>
  )
}

// ── Tek görev tipi analiz paneli ──────────────────────────────────────────
function BolumPanel({ bolum, renk, tip }: { bolum: Bolum; renk: string; tip: 'frekansiyel' | 'spesifik' }) {
  const a = bolum.analiz
  const basariOrani = a.toplam > 0 ? Math.round((a.tamamlananSayi / a.toplam) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10 }}>
        <KpiCard label="Ort. Süre"     value={fmtS(a.ort)}       color={renk}       Icon={Clock}       sub={`${a.tamamlananSayi} tamamlanan görev`} />
        <KpiCard label="En Hızlı"      value={fmtS(a.min)}       color={T.green}    Icon={Zap}         />
        <KpiCard label="En Yavaş"      value={fmtS(a.max)}       color={T.red}      Icon={TrendingUp}  />
        <KpiCard label="Medyan"        value={fmtS(a.p50)}       color={T.purple}   Icon={Activity}    sub="P50 — yarısı bu sürenin altında" />
        <KpiCard label="Ort. Bekleme"  value={fmtS(a.ortBekleme)} color={T.amber}   Icon={TrendingDown} sub="Oluşturma → Başlama" />
        <KpiCard label="Başarı Oranı"  value={`%${basariOrani}`} color={renk}       Icon={BarChart2}   sub={`${a.toplam} toplam`} />
      </div>

      {/* Yüzdelik dilimler */}
      <div className="verde-card" style={{ padding: '16px 18px' }}>
        <SekHead title="Yüzdelik Dilimler (Tamamlanma Süresi)" color={renk} />
        <PercentileCard analiz={a} />
        <div style={{ marginTop: 10, fontSize: 11.5, color: T.textSoft, lineHeight: 1.6 }}>
          Görevlerin <strong>%50'si</strong> {fmtS(a.p50)} içinde, <strong>%90'ı</strong> {fmtS(a.p90)} içinde tamamlanmıştır.
          {a.p90 > a.ort * 2 && <span style={{ color: T.red }}> Yüksek sapmalar gözlemlendi — belirli görevler süreci yavaşlatıyor olabilir.</span>}
        </div>
      </div>

      {/* Dağılım */}
      <div className="verde-card" style={{ padding: '16px 18px' }}>
        <SekHead title="Süre Dağılımı" color={renk} />
        <DagilimBar data={bolum.dagilim} color={renk} />
      </div>

      {/* Günlük trend */}
      <div className="verde-card" style={{ padding: '16px 18px' }}>
        <SekHead title="Günlük Ortalama Süre Trendi" color={renk} />
        <LineChart data={bolum.gunlukTrend} valueKey="ort_sure" labelKey="tarih" color={renk} />
        {bolum.gunlukTrend.length > 1 && (() => {
          const first = bolum.gunlukTrend[0].ort_sure
          const last  = bolum.gunlukTrend[bolum.gunlukTrend.length - 1].ort_sure
          const fark  = Math.round(((last - first) / first) * 100)
          return (
            <div style={{ marginTop: 8, fontSize: 11.5, color: fark < 0 ? T.green : T.red, fontWeight: 600 }}>
              {fark < 0 ? `↘ Son dönemde %${Math.abs(fark)} iyileşme gözlemlendi.` : fark > 0 ? `↗ Son dönemde %${fark} yavaşlama gözlemlendi.` : 'Süre trendi stabil.'}
            </div>
          )
        })()}
      </div>

      {/* Lokasyon bazlı */}
      <div className="verde-card" style={{ padding: '16px 18px' }}>
        <SekHead title="Lokasyon Bazlı Ortalama Süre" color={renk} />
        <div style={{ marginBottom: 14 }}>
          <HBarChart data={bolum.lokasyon.slice(0, 10)} valueKey="ort_sure" labelKey="lokasyon" color={renk} />
        </div>
        {/* Hedef karşılaştırma varsa özet bandı */}
        {bolum.lokasyon.some(r => r.hedef_sure != null) && (() => {
          const asimlar = bolum.lokasyon.filter(r => r.hedef_fark != null && r.hedef_fark > 0)
          const uyumlu  = bolum.lokasyon.filter(r => r.hedef_fark != null && r.hedef_fark <= 0)
          return (
            <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 14px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: T.green }}>
                ✓ Hedefe Uygun: {uyumlu.length} lokasyon
              </div>
              <div style={{ padding: '8px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12.5, fontWeight: 700, color: T.red }}>
                ✗ Hedef Aşımı: {asimlar.length} lokasyon
              </div>
            </div>
          )
        })()}
        <Tablo
          color={renk}
          headers={bolum.lokasyon.some(r => r.hedef_sure != null)
            ? ['LOKASYON', 'ADET', 'HEDEF', 'ORT. SÜRE', 'FARK', 'EN HIZLI', 'EN YAVAŞ']
            : ['LOKASYON', 'ADET', 'ORT. SÜRE', 'EN HIZLI', 'EN YAVAŞ']}
          rows={bolum.lokasyon.map(r => {
            if (bolum.lokasyon.some(x => x.hedef_sure != null)) {
              const farkLabel = r.hedef_fark == null ? '—'
                : r.hedef_fark > 0 ? `+${fmtS(r.hedef_fark)} (aşım)`
                : r.hedef_fark < 0 ? `${fmtS(Math.abs(r.hedef_fark))} erken`
                : 'Tam hedef'
              return [r.lokasyon, r.adet, r.hedef_sure != null ? fmtS(r.hedef_sure) : '—', fmtS(r.ort_sure), farkLabel, fmtS(r.min_sure), fmtS(r.max_sure)]
            }
            return [r.lokasyon, r.adet, fmtS(r.ort_sure), fmtS(r.min_sure), fmtS(r.max_sure)]
          })}
        />
      </div>

      {/* Personel bazlı */}
      <div className="verde-card" style={{ padding: '16px 18px' }}>
        <SekHead title="Personel Bazlı Süre Analizi" color={renk} />
        <div style={{ marginBottom: 14 }}>
          <VBarChart data={bolum.personel.slice(0, 10)} valueKey="ort_sure" labelKey="personel" color={renk} />
        </div>
        <Tablo
          color={renk}
          headers={['PERSONEL', 'TAMAMLANAN', 'ORT. SÜRE', 'EN HIZLI', 'EN YAVAŞ']}
          rows={bolum.personel.map(r => [r.personel, r.tamamlanan, fmtS(r.ort_sure), fmtS(r.en_hizli), fmtS(r.en_yavas)])}
        />
        {bolum.personel.length > 0 && (() => {
          const sorted = [...bolum.personel].sort((a, b) => a.ort_sure - b.ort_sure)
          return (
            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ padding: '8px 14px', background: T.green + '18', border: `1px solid ${T.green}30`, borderRadius: 8, fontSize: 12, color: T.green, fontWeight: 700 }}>
                🏆 En hızlı: {sorted[0].personel} — {fmtS(sorted[0].ort_sure)}
              </div>
              {sorted.length > 1 && (
                <div style={{ padding: '8px 14px', background: T.amber + '18', border: `1px solid ${T.amber}30`, borderRadius: 8, fontSize: 12, color: T.amber, fontWeight: 700 }}>
                  ⚠️ En yavaş: {sorted[sorted.length - 1].personel} — {fmtS(sorted[sorted.length - 1].ort_sure)}
                </div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── Ana bileşen ────────────────────────────────────────────────────────────
const ANA_TABS = ['Frekansiyel Görevler', 'Spesifik Görevler'] as const
type AnaTab = typeof ANA_TABS[number]

export default function SureAnalizClient({ base, isSA, tenantFirmaId, projeId, sureliGorevAktif = true }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (tenantFirmaId ?? '')

  const [baslangic, setBaslangic] = useState('')
  const [bitis,     setBitis]     = useState('')
  const [data,      setData]      = useState<SureData | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [activeTab, setActiveTab] = useState<AnaTab>('Frekansiyel Görevler')
  const debRef = useRef<any>(null)

  const fetchData = useCallback(async () => {
    if (!currentFirmaId) return
    setLoading(true)
    try {
      const p = new URLSearchParams({ firmaId: currentFirmaId })
      if (projeId)   p.set('projeId', projeId)
      if (baslangic) p.set('baslangic', baslangic)
      if (bitis)     p.set('bitis', bitis)
      const res  = await fetch(`/api/reports/sure-analiz?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Veri alınamadı.')
      setData(json)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setLoading(false)
  }, [currentFirmaId, projeId, baslangic, bitis, toast])

  useEffect(() => {
    if (!currentFirmaId) return
    clearTimeout(debRef.current)
    debRef.current = setTimeout(fetchData, 600)
    return () => clearTimeout(debRef.current)
  }, [fetchData, currentFirmaId])

  const tabStyle = (t: AnaTab): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 8, fontSize: 13.5, fontWeight: 700,
    border: 'none', cursor: 'pointer', transition: 'all .15s',
    background: activeTab === t ? (t === 'Spesifik Görevler' ? T.blue : T.green) : T.grayLight,
    color: activeTab === t ? '#fff' : T.textSoft,
  })

  const freqRenk = T.greenMid
  const specRenk = T.blue

  return (
    <div>
      <Topbar title="Süre Analiz Raporları" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Süre Analiz Raporları' }]} />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Süreli Görev Takibi uyarısı */}
        {!sureliGorevAktif && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10 }}>
            <span style={{ fontSize: 22 }}>⏱️</span>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 800, color: '#9a3412' }}>Süreli Görev Takibi Pasif</div>
              <div style={{ fontSize: 13, color: '#c2410c', marginTop: 2 }}>Bu proje için görev süreleri takip edilmiyor. Süre analizi yapılabilmesi için Süreli Görev Takibi aktif olmalıdır.</div>
            </div>
          </div>
        )}

        {/* Filtreler */}
        <div className="verde-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>QR-SYNC</div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: T.text, margin: 0 }}>Süre Analiz Raporları</h2>
              <div style={{ fontSize: 13, color: T.textSoft, marginTop: 2 }}>Tamamlanma süreleri, bekleme analizleri ve personel/lokasyon karşılaştırmaları</div>
            </div>
            <button onClick={fetchData} disabled={loading || !currentFirmaId}
              style={{ height: 36, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.grayLight, color: T.gray, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
              <RefreshCw size={13} style={loading ? spinning : {}} />
              {loading ? 'Yükleniyor…' : 'Yenile'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 10 }}>
            {[
              { label: 'Başlangıç', node: <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={inp} /> },
              { label: 'Bitiş',     node: <input type="date" value={bitis}     onChange={e => setBitis(e.target.value)}     style={inp} /> },
            ].map(({ label, node }) => (
              <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</span>
                {node}
              </label>
            ))}
          </div>
        </div>

        {/* Boş durum */}
        {!data && !loading && (
          <div className="verde-card" style={{ padding: 48, textAlign: 'center', color: T.textSoft }}>
            <Clock size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
            <div style={{ fontWeight: 700, fontSize: 15 }}>Süre analizi yükleniyor…</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Firma seçildiğinde veriler otomatik yüklenecek.</div>
          </div>
        )}

        {/* İçerik */}
        {data && (
          <>
            {/* Ana sekmeler */}
            <div style={{ display: 'flex', gap: 4, background: T.grayLight, borderRadius: 8, padding: 4, alignSelf: 'flex-start', border: `1px solid ${T.border}` }}>
              {ANA_TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>{t}</button>)}
            </div>

            {/* Frekansiyel panel */}
            {activeTab === 'Frekansiyel Görevler' && (
              <BolumPanel bolum={data.frekansiyel} renk={freqRenk} tip="frekansiyel" />
            )}

            {/* Spesifik panel */}
            {activeTab === 'Spesifik Görevler' && (
              <BolumPanel bolum={data.spesifik} renk={specRenk} tip="spesifik" />
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
