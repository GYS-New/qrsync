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
  grup: string; lokasyon: string; gorevTanimi: string; gunlukFrekans: number
  hedef: number; tamamlanan: number; sapma: number; kayip: number
  basariOrani: string; genelOran: string
}
type TamamlananRow  = { sn: number; personel: string; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; durum: string }
type SapmaRow       = { sn: number; personel: string; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; sapmaNedeni: string }
type KayipRow       = { sn: number; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; durum: string; kayipNedeni: string }
type FrekansDisiRow = { sn: number; ustLokasyon: string; grupTanimi: string; lokasyonTanimi: string; personel: string; tarihSaat: string; aciklama: string }

type RaporData = {
  firmaAdi: string; projeAdi: string; ustLokTanim: string; altLokTanim: string
  raporTarihLabel: string; gunSayisi: number; raporuAlan: string
  toplamGorev: number; toplamTamamlanan: number; toplamSapma: number
  toplamKayip: number; genelBasari: number
  grupMetrikleri: GrupMetrik[]
  tamamlananGorevler: TamamlananRow[]
  sapmaGorevler: SapmaRow[]
  kayipGorevler: KayipRow[]
  frekansDisiGorevler: FrekansDisiRow[]
}

// ── Design tokens (SpesifikRaporKarti ile aynı) ────────────────────
const T = {
  blue:      '#1d4ed8', blueLight: '#eff6ff', blueMid: '#3b82f6',
  green:     '#1a5c2a', greenMid:  '#2e8b2e', greenLight: '#f0fdf4',
  amber:     '#d97706', amberLight: '#fef3c7',
  red:       '#dc2626', redLight:   '#fee2e2',
  gray:      '#475569', grayLight:  '#f8fafc',
  border:    '#e2e8f0', text:       '#0f172a', textSoft: '#64748b',
}
const spinning = { animation: 'spin 0.9s linear infinite' }
const inp: React.CSSProperties = {
  height: 34, padding: '0 10px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: '#fff', fontSize: 13, width: '100%',
}

// ── Mini bar chart ─────────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, color }: {
  data: Record<string, any>[]; valueKey: string; labelKey: string; color?: string
}) {
  if (!data.length) return <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
  const barClr = color ?? T.blueMid
  const chartH = 180, barArea = 120, bottomH = 40, topPad = 20
  const barW = 36, gap = 16
  const totalW = data.length * (barW + gap) + gap
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1)
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={totalW} height={chartH} style={{ display: 'block', minWidth: Math.min(totalW, 600) }}>
        {[0.25, 0.5, 0.75, 1].map(ratio => {
          const y = topPad + barArea * (1 - ratio)
          return (
            <g key={ratio}>
              <line x1={0} y1={y} x2={totalW} y2={y} stroke="#e2e8f0" strokeWidth={0.5} />
              <text x={2} y={y - 2} fontSize={8} fill={T.textSoft}>{Math.round(max * ratio)}</text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const val = Number(d[valueKey]) || 0
          const barH = (val / max) * barArea
          const x = gap + i * (barW + gap)
          const y = topPad + barArea - barH
          const label = String(d[labelKey] ?? '').slice(0, 12)
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={barH} fill={barClr} rx={3} opacity={0.9} />
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={9} fontWeight="bold" fill={T.gray}>{val}</text>
              <text x={x + barW / 2} y={topPad + barArea + 8} textAnchor="end" fontSize={9} fill={T.textSoft}
                transform={`rotate(-40, ${x + barW / 2}, ${topPad + barArea + 8})`}>{label}</text>
            </g>
          )
        })}
        <line x1={0} y1={topPad + barArea} x2={totalW} y2={topPad + barArea} stroke={T.border} strokeWidth={1} />
      </svg>
    </div>
  )
}

// ── Pasta grafik ───────────────────────────────────────────────────
function PieChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (!total) return <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
  const cx = 50, cy = 50, r = 40
  let angle = -Math.PI / 2
  const paths = slices.filter(s => s.value > 0).map(s => {
    const a = (s.value / total) * Math.PI * 2
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
    angle += a
    const x2 = cx + r * Math.cos(angle), y2 = cy + r * Math.sin(angle)
    const large = a > Math.PI ? 1 : 0
    return { d: `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`, color: s.color, label: s.label, pct: Math.round(s.value / total * 100) }
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg viewBox="0 0 100 100" style={{ width: 120, height: 120, flexShrink: 0 }}>
        {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} stroke="#fff" strokeWidth={0.8} />)}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {paths.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color, flexShrink: 0 }} />
            <span style={{ color: T.textSoft }}>{p.label}</span>
            <span style={{ fontWeight: 700, color: T.text, marginLeft: 'auto' }}>{p.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── KPI kart ───────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, Icon }: { label: string; value: string | number; sub?: string; color: string; Icon: any }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: color + '18', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={16} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: T.text, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── DataTable ──────────────────────────────────────────────────────
function DataTable({ headers, rows, accentCol, accentColor }: {
  headers: string[]; rows: (string | number)[][]; accentCol?: number; accentColor?: string
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>{headers.map((h, i) => (
            <th key={i} style={{ padding: '7px 10px', background: T.blue, color: '#fff', fontWeight: 700, fontSize: 11, textAlign: i === 0 ? 'left' : 'center', whiteSpace: 'nowrap' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={headers.length} style={{ padding: '20px', textAlign: 'center', color: T.textSoft }}>Veri bulunamadı.</td></tr>
            : rows.map((row, ri) => (
              <tr key={ri} style={{ background: ri % 2 === 0 ? T.grayLight : '#fff' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{
                    padding: '6px 10px', borderBottom: `1px solid ${T.border}`,
                    textAlign: ci === 0 ? 'left' : 'center', fontSize: 12.5,
                    fontWeight: ci === accentCol ? 700 : ci === 0 ? 600 : 400,
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

const TABS = ['Özet & Grafikler', 'Grup Metrikleri', 'Tamamlanan', 'Sapmalar', 'Kayıp Frekanslar', 'Frekans Dışı'] as const
type Tab = typeof TABS[number]

// ── Ana bileşen ────────────────────────────────────────────────────
export default function GenelRaporKarti({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (tenantFirmaId ?? '')

  const [lokasyonlar,    setLokasyonlar]    = useState<Lokasyon[]>([])
  const [ustLokasyonId,  setUstLokasyonId]  = useState('')
  const [altLokasyonId,  setAltLokasyonId]  = useState('')
  const [raporBaslangic, setRaporBaslangic] = useState('')
  const [raporBitis,     setRaporBitis]     = useState('')
  const [raporuAlan,     setRaporuAlan]     = useState('')
  const [data,           setData]           = useState<RaporData | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [dlLoading,      setDlLoading]      = useState(false)
  const [activeTab,      setActiveTab]      = useState<Tab>('Özet & Grafikler')
  const debRef = useRef<any>(null)

  const ustLokasyonlar = useMemo(() => lokasyonlar.filter(l => !l.parent_id), [lokasyonlar])
  const altLokasyonlar = useMemo(() => lokasyonlar.filter(l => l.parent_id === ustLokasyonId), [lokasyonlar, ustLokasyonId])

  // Lokasyon listesini çek
  useEffect(() => {
    if (!currentFirmaId) { setLokasyonlar([]); return }
    const p = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId) p.set('projeId', projeId)
    fetch(`/api/lokasyonlar-list?${p}`, { cache: 'no-store' })
      .then(r => r.json()).then(d => setLokasyonlar(Array.isArray(d) ? d : []))
      .catch(() => setLokasyonlar([]))
  }, [currentFirmaId, projeId])

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId)        p.set('projeId', projeId)
    if (ustLokasyonId)  p.set('ustLokasyonId', ustLokasyonId)
    if (altLokasyonId)  p.set('altLokasyonId', altLokasyonId)
    if (raporBaslangic) p.set('raporBaslangic', raporBaslangic)
    if (raporBitis)     p.set('raporBitis', raporBitis)
    if (raporuAlan)     p.set('raporuAlan', raporuAlan)
    return p
  }, [currentFirmaId, projeId, ustLokasyonId, altLokasyonId, raporBaslangic, raporBitis, raporuAlan])

  const fetchData = useCallback(async () => {
    if (!currentFirmaId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/reports/genel-rapor?${buildParams()}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Veri alınamadı.')
      setData(json)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setLoading(false)
  }, [buildParams, currentFirmaId, toast])

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
    padding: '6px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
    border: 'none', cursor: 'pointer', transition: 'all .15s',
    background: activeTab === t ? T.blue : 'transparent',
    color: activeTab === t ? '#fff' : T.textSoft,
  })

  const toplamHedef = data ? (data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0) || data.toplamGorev) : 0

  return (
    <div>
      <Topbar title="Frekansiyel Görevler Raporu" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Rapor Özelleştir', href: `${base}/dashboard/raporlar/ozellestir` }, { label: 'Frekansiyel Görevler Raporu' }]} />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Filtreler + export ── */}
        <div className="verde-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>QR-SYNC Frekansiyel Raporu</div>
              <h2 style={{ fontSize: 17, fontWeight: 900, color: T.text, margin: 0 }}>Frekansiyel Görevler Raporu</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={fetchData} disabled={loading || !currentFirmaId}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.grayLight, color: T.gray, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                <RefreshCw size={13} style={loading ? spinning : {}} />
                {loading ? 'Yükleniyor…' : 'Yenile'}
              </button>
              <button onClick={downloadExcel} disabled={!data || dlLoading}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #d1fae5', background: '#f0fdf4', color: T.green, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
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
              { label: 'Üst Lokasyon', node: (
                <select value={ustLokasyonId} onChange={e => { setUstLokasyonId(e.target.value); setAltLokasyonId('') }} style={inp}>
                  <option value="">Tümü</option>
                  {ustLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              )},
              { label: 'Alt Lokasyon', node: (
                <select value={altLokasyonId} onChange={e => setAltLokasyonId(e.target.value)} style={inp} disabled={!ustLokasyonId}>
                  <option value="">Tümü</option>
                  {altLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              )},
              { label: 'Raporu Alan',  node: <input type="text" value={raporuAlan} onChange={e => setRaporuAlan(e.target.value)} placeholder="Ad Soyad" style={inp} /> },
            ] as { label: string; node: React.ReactNode }[]).map(({ label, node }) => (
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
            <Activity size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
            <div style={{ fontWeight: 700 }}>Filtre seçildiğinde rapor otomatik yüklenecek.</div>
          </div>
        )}

        {/* ── İçerik ── */}
        {data && (
          <>
            {/* KPI kartlar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 10 }}>
              <KpiCard label="Hedef"      value={toplamHedef}           color={T.blue}    Icon={Target}        />
              <KpiCard label="Tamamlanan" value={data.toplamTamamlanan} color={T.green}   Icon={CheckCircle}   sub={`%${data.genelBasari} başarı`} />
              <KpiCard label="Sapma"      value={data.toplamSapma}      color={T.amber}   Icon={AlertTriangle} />
              <KpiCard label="Kayıp"      value={data.toplamKayip}      color={T.red}     Icon={XCircle}       />
              <KpiCard label="Frekans Dışı" value={data.frekansDisiGorevler.length} color={T.gray} Icon={Activity} />
              <KpiCard label="Gün Sayısı" value={`${data.gunSayisi} gün`} color={T.blueMid} Icon={Clock} />
            </div>

            {/* Meta bandı */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T.textSoft, padding: '8px 14px', background: T.grayLight, borderRadius: 8, border: `1px solid ${T.border}` }}>
              <span><strong>Firma:</strong> {data.firmaAdi}</span>
              {data.projeAdi && <span><strong>Proje:</strong> {data.projeAdi}</span>}
              {data.ustLokTanim && <span><strong>Üst Lok.:</strong> {data.ustLokTanim}</span>}
              {data.altLokTanim && <span><strong>Alt Lok.:</strong> {data.altLokTanim}</span>}
              <span><strong>Dönem:</strong> {data.raporTarihLabel}</span>
              {data.raporuAlan && <span><strong>Raporu Alan:</strong> {data.raporuAlan}</span>}
            </div>

            {/* Sekme navigasyon */}
            <div style={{ display: 'flex', gap: 4, background: T.grayLight, borderRadius: 8, padding: 4, alignSelf: 'flex-start', flexWrap: 'wrap', border: `1px solid ${T.border}` }}>
              {TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>{t}</button>)}
            </div>

            {/* ── ÖZET & GRAFİKLER ── */}
            {activeTab === 'Özet & Grafikler' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                {/* Durum dağılımı pasta */}
                <div className="verde-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Frekans Dağılımı</div>
                  <PieChart slices={[
                    { label: 'Tamamlanan', value: data.toplamTamamlanan, color: T.greenMid },
                    { label: 'Sapma',      value: data.toplamSapma,      color: T.amber },
                    { label: 'Kayıp',      value: data.toplamKayip,      color: T.red },
                  ]} />
                </div>

                {/* Başarı oranı */}
                <div className="verde-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Başarı Oranı</div>
                  <div style={{ fontSize: 52, fontWeight: 900, color: data.genelBasari >= 80 ? T.green : data.genelBasari >= 50 ? T.amber : T.red, lineHeight: 1 }}>%{data.genelBasari}</div>
                  <div style={{ fontSize: 13, color: T.textSoft, marginTop: 6 }}>{data.toplamTamamlanan} tamamlanan / {toplamHedef} hedef</div>
                  <div style={{ marginTop: 12, height: 10, background: T.border, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${data.genelBasari}%`, background: data.genelBasari >= 80 ? T.green : data.genelBasari >= 50 ? T.amber : T.red, borderRadius: 5, transition: 'width .6s ease' }} />
                  </div>
                  <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Sapma', value: data.toplamSapma, color: T.amber },
                      { label: 'Kayıp', value: data.toplamKayip, color: T.red },
                      { label: 'Frekans Dışı', value: data.frekansDisiGorevler.length, color: T.gray },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '8px 10px', background: T.grayLight, borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 10.5, color: T.textSoft, marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Grup bazlı bar grafik */}
                <div className="verde-card" style={{ padding: '16px 20px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Grup Bazlı Tamamlanan Frekans (İlk 10)</div>
                  <BarChart data={data.grupMetrikleri.slice(0, 10)} valueKey="tamamlanan" labelKey="grup" color={T.greenMid} />
                </div>

                {/* Grup bazlı kayıp bar grafik */}
                <div className="verde-card" style={{ padding: '16px 20px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Grup Bazlı Kayıp Frekans (İlk 10)</div>
                  <BarChart data={data.grupMetrikleri.slice(0, 10)} valueKey="kayip" labelKey="grup" color={T.red} />
                </div>
              </div>
            )}

            {/* ── GRUP METRİKLERİ ── */}
            {activeTab === 'Grup Metrikleri' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Grup Frekans Metrikleri</div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: T.blueLight, color: T.blue }}>{data.grupMetrikleri.length} grup</span>
                </div>
                {/* Toplamlar */}
                {data.grupMetrikleri.length > 0 && (() => {
                  const tGunluk = data.grupMetrikleri.reduce((s, g) => s + g.gunlukFrekans, 0)
                  const tHedef  = data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0)
                  const tTam    = data.grupMetrikleri.reduce((s, g) => s + g.tamamlanan, 0)
                  const tSap    = data.grupMetrikleri.reduce((s, g) => s + g.sapma, 0)
                  const tKay    = data.grupMetrikleri.reduce((s, g) => s + g.kayip, 0)
                  const tBas    = tHedef > 0 ? Math.round(tTam / tHedef * 100) : 0
                  const tGenel  = tHedef > 0 ? Math.round((tTam + tSap) / tHedef * 100) : 0
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px,1fr))', gap: 8, marginBottom: 14, padding: '10px 12px', background: T.greenLight, borderRadius: 8, border: `1px solid #bbf7d0` }}>
                      {[
                        { label: 'Günlük Frekans', value: tGunluk, color: T.blue },
                        { label: 'Hedef',          value: tHedef,  color: T.blue },
                        { label: 'Tamamlanan',     value: tTam,    color: T.green },
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
                <DataTable
                  headers={['SN', 'GRUP', 'LOKASYON', 'GÜNLÜK FREKANS', 'HEDEF', 'TAMAMLANAN', 'SAPMA', 'KAYIP', 'BAŞARI', 'GENEL ORAN']}
                  rows={data.grupMetrikleri.map((g, i) => [i + 1, g.grup, g.lokasyon, g.gunlukFrekans, g.hedef, g.tamamlanan, g.sapma, g.kayip, g.basariOrani, g.genelOran])}
                  accentCol={8} accentColor={T.greenMid}
                />
              </div>
            )}

            {/* ── TAMAMLANAN ── */}
            {activeTab === 'Tamamlanan' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Tamamlanan Frekanslar</div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: '#dcfce7', color: T.green }}>{data.tamamlananGorevler.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', 'PERSONEL', 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH-SAAT', 'DURUM']}
                  rows={data.tamamlananGorevler.map(r => [r.sn, r.personel, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarihSaat, r.durum])}
                />
              </div>
            )}

            {/* ── SAPMALAR ── */}
            {activeTab === 'Sapmalar' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Sapma Frekanslar</div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: T.amberLight, color: T.amber }}>{data.sapmaGorevler.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', 'PERSONEL', 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH-SAAT', 'SAPMA NEDENİ']}
                  rows={data.sapmaGorevler.map(r => [r.sn, r.personel, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarihSaat, r.sapmaNedeni])}
                />
              </div>
            )}

            {/* ── KAYIP FREKANSLAR ── */}
            {activeTab === 'Kayıp Frekanslar' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Kayıp Frekanslar</div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: T.redLight, color: T.red }}>{data.kayipGorevler.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH-SAAT', 'DURUM', 'KAYIP NEDENİ']}
                  rows={data.kayipGorevler.map(r => [r.sn, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarihSaat, r.durum, r.kayipNedeni])}
                />
              </div>
            )}

            {/* ── FREKANS DIŞI ── */}
            {activeTab === 'Frekans Dışı' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Frekans Dışı Çalışmalar (Spesifik Görevler)</div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: T.grayLight, color: T.gray }}>{data.frekansDisiGorevler.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', 'ÜST LOKASYON', 'GRUP TANIMI', 'LOKASYON', 'PERSONEL', 'TARİH-SAAT', 'AÇIKLAMA']}
                  rows={data.frekansDisiGorevler.map(r => [r.sn, r.ustLokasyon, r.grupTanimi, r.lokasyonTanimi, r.personel, r.tarihSaat, r.aciklama])}
                />
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
