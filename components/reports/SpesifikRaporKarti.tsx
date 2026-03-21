'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import {
  RefreshCw, FileSpreadsheet, FileText,
  CheckCircle, XCircle, Clock, AlertTriangle, TrendingUp, Activity,
} from 'lucide-react'

interface Props {
  base: string
  isSA: boolean
  tenantFirmaId?: string | null
  projeId?: string | null
}

type Ozet = {
  toplam: number; tamamlanan: number; acik: number
  islemde: number; iptal: number; basariOrani: number; ortSure: number | null
}
type SpesifikData = {
  meta: { firmaAdi: string; projeAdi: string; raporTarihLabel: string; raporuAlan: string }
  ozet: Ozet
  lokBazliRows: { lokasyon: string; toplam: number; tamamlanan: number; iptal: number; basari: string }[]
  persBazliRows: { personel: string; toplam: number; tamamlanan: number; basari: string }[]
  tamamlananGorevler: { sn: number; tanim: string; lokasyon: string; atanan: string; tamamlayan: string; olusturma: string; tamamlanma: string; sure: string }[]
  aktifGorevler: { sn: number; tanim: string; lokasyon: string; atanan: string; durum: string; olusturma: string; sonIslem: string }[]
  lokasyonlar: { id: string; tanim: string }[]
  kullanicilar: { id: string; isim_soyisim: string }[]
}

// ── Design tokens ──────────────────────────────────────────────────────────
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

// ── Mini bar chart (SVG, sıfır bağımlılık) ────────────────────────────────
function BarChart({
  data, valueKey, labelKey, color, height = 160,
}: {
  data: Record<string, any>[]
  valueKey: string
  labelKey: string
  color?: string
  height?: number
}) {
  if (!data.length) return <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
  const max    = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1)
  const w      = 100 / data.length
  const barClr = color ?? T.blueMid
  return (
    <svg viewBox={`0 0 100 ${height}`} style={{ width: '100%', height, display: 'block' }} preserveAspectRatio="none">
      {data.map((d, i) => {
        const val  = Number(d[valueKey]) || 0
        const barH = (val / max) * (height - 28)
        const x    = i * w + w * 0.1
        const bw   = w * 0.8
        const y    = height - 20 - barH
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={barH} fill={barClr} rx={1.5} opacity={0.85} />
            <text x={x + bw/2} y={y - 3} textAnchor="middle" fontSize={5} fill={T.gray}>{val}</text>
            <text x={x + bw/2} y={height - 4} textAnchor="middle" fontSize={4.5} fill={T.textSoft}>
              {String(d[labelKey] ?? '').slice(0, 10)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ── Pasta grafik (SVG) ─────────────────────────────────────────────────────
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
    return { d: `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`, color: s.color, label: s.label, pct: Math.round(s.value/total*100) }
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

// ── KPI kart ──────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, Icon }: { label: string; value: string|number; sub?: string; color: string; Icon: any }) {
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

// ── DataTable ─────────────────────────────────────────────────────────────
function DataTable({ headers, rows }: { headers: string[]; rows: (string|number)[][] }) {
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

const TABS = ['Özet & Grafikler', 'Lokasyon', 'Personel', 'Tamamlanan', 'Açık / İptal'] as const
type Tab = typeof TABS[number]

function fmtSure(sn: number | null | undefined) {
  if (!sn) return '—'
  const h = Math.floor(sn/3600), m = Math.floor((sn%3600)/60), s = sn%60
  if (h > 0) return `${h}s ${m}dk`; if (m > 0) return `${m}dk ${s}sn`; return `${s}sn`
}

// ── Ana bileşen ────────────────────────────────────────────────────────────
export default function SpesifikRaporKarti({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (tenantFirmaId ?? '')

  const [baslangic,  setBaslangic]  = useState('')
  const [bitis,      setBitis]      = useState('')
  const [raporuAlan, setRaporuAlan] = useState('')
  const [lokasyonId, setLokasyonId] = useState('')
  const [atananId,   setAtananId]   = useState('')
  const [durum,      setDurum]      = useState('TUMU')
  const [data,       setData]       = useState<SpesifikData | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [dlLoading,  setDlLoading]  = useState<'excel'|'pdf'|null>(null)
  const [activeTab,  setActiveTab]  = useState<Tab>('Özet & Grafikler')
  const debRef = useRef<any>(null)

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId)    p.set('projeId', projeId)
    if (baslangic)  p.set('baslangic', baslangic)
    if (bitis)      p.set('bitis', bitis)
    if (raporuAlan) p.set('raporuAlan', raporuAlan)
    if (lokasyonId) p.set('lokasyonId', lokasyonId)
    if (atananId)   p.set('atananId', atananId)
    if (durum !== 'TUMU') p.set('durum', durum)
    return p
  }, [currentFirmaId, projeId, baslangic, bitis, raporuAlan, lokasyonId, atananId, durum])

  const fetchData = useCallback(async () => {
    if (!currentFirmaId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/reports/spesifik-rapor?${buildParams()}`, { cache: 'no-store' })
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

  async function download(format: 'excel' | 'pdf') {
    if (!currentFirmaId) return
    setDlLoading(format)
    try {
      const p = buildParams(); p.set('format', format)
      const res = await fetch(`/api/reports/spesifik-rapor-export?${p}`)
      if (!res.ok) throw new Error('İndirme başarısız.')
      const blob  = await res.blob()
      const url   = URL.createObjectURL(blob)
      const a     = document.createElement('a')
      a.href = url
      a.download = `spesifik-rapor-${new Date().toISOString().slice(0,10)}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      a.click(); URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setDlLoading(null)
  }

  const oz = data?.ozet
  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600,
    border: 'none', cursor: 'pointer', transition: 'all .15s',
    background: activeTab === t ? T.blue : 'transparent',
    color: activeTab === t ? '#fff' : T.textSoft,
  })

  return (
    <div>
      <Topbar title="Spesifik Görevler Raporu" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Rapor Özelleştir', href: `${base}/dashboard/raporlar/ozellestir` }, { label: 'Spesifik Görevler Raporu' }]} />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Filtreler + export butonları */}
        <div className="verde-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>QR-SYNC Spesifik Raporu</div>
              <h2 style={{ fontSize: 17, fontWeight: 900, color: T.text, margin: 0 }}>Spesifik Görevler Raporu</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={fetchData} disabled={loading || !currentFirmaId}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.grayLight, color: T.gray, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                <RefreshCw size={13} style={loading ? spinning : {}} />
                {loading ? 'Yükleniyor…' : 'Yenile'}
              </button>
              <button onClick={() => download('excel')} disabled={!data || dlLoading !== null}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #d1fae5', background: '#f0fdf4', color: T.green, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                <FileSpreadsheet size={13} style={dlLoading === 'excel' ? spinning : {}} />
                Excel İndir
              </button>
              <button onClick={() => download('pdf')} disabled={!data || dlLoading !== null}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: T.red, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                <FileText size={13} style={dlLoading === 'pdf' ? spinning : {}} />
                PDF İndir
              </button>
            </div>
          </div>

          {/* Filtre grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10 }}>
            {([
              { label: 'Başlangıç', node: <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={inp} /> },
              { label: 'Bitiş',     node: <input type="date" value={bitis}     onChange={e => setBitis(e.target.value)}     style={inp} /> },
              { label: 'Lokasyon',  node: (
                <select value={lokasyonId} onChange={e => setLokasyonId(e.target.value)} style={inp}>
                  <option value="">Tümü</option>
                  {(data?.lokasyonlar ?? []).map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              )},
              { label: 'Atanan',    node: (
                <select value={atananId} onChange={e => setAtananId(e.target.value)} style={inp}>
                  <option value="">Tümü</option>
                  {(data?.kullanicilar ?? []).map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
                </select>
              )},
              { label: 'Durum',     node: (
                <select value={durum} onChange={e => setDurum(e.target.value)} style={inp}>
                  <option value="TUMU">Tümü</option>
                  <option value="ACIK">Açık</option>
                  <option value="ISLEMDE">İşlemde</option>
                  <option value="TAMAMLANDI">Tamamlandı</option>
                  <option value="IPTAL">İptal</option>
                </select>
              )},
              { label: 'Raporu Alan', node: <input type="text" value={raporuAlan} onChange={e => setRaporuAlan(e.target.value)} placeholder="Ad Soyad" style={inp} /> },
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

        {/* İçerik */}
        {data && (
          <>
            {/* KPI kartlar */}
            {oz && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 10 }}>
                <KpiCard label="Toplam"     value={oz.toplam}      color={T.blue}     Icon={Activity}      />
                <KpiCard label="Tamamlanan" value={oz.tamamlanan}  color={T.green}    Icon={CheckCircle}   sub={`%${oz.basariOrani} başarı`} />
                <KpiCard label="Açık"       value={oz.acik}        color={T.amber}    Icon={AlertTriangle} />
                <KpiCard label="İşlemde"    value={oz.islemde}     color={T.blueMid}  Icon={TrendingUp}    />
                <KpiCard label="İptal"      value={oz.iptal}       color={T.red}      Icon={XCircle}       />
                {oz.ortSure != null && <KpiCard label="Ort. Süre" value={fmtSure(oz.ortSure)} color={T.gray} Icon={Clock} />}
              </div>
            )}

            {/* Meta bandı */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: T.textSoft, padding: '8px 14px', background: T.grayLight, borderRadius: 8, border: `1px solid ${T.border}` }}>
              <span><strong>Firma:</strong> {data.meta.firmaAdi}</span>
              {data.meta.projeAdi && <span><strong>Proje:</strong> {data.meta.projeAdi}</span>}
              <span><strong>Dönem:</strong> {data.meta.raporTarihLabel}</span>
              {data.meta.raporuAlan && <span><strong>Raporu Alan:</strong> {data.meta.raporuAlan}</span>}
            </div>

            {/* Sekme navigasyon */}
            <div style={{ display: 'flex', gap: 4, background: T.grayLight, borderRadius: 8, padding: 4, alignSelf: 'flex-start', flexWrap: 'wrap', border: `1px solid ${T.border}` }}>
              {TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>{t}</button>)}
            </div>

            {/* ── ÖZET & GRAFİKLER ── */}
            {activeTab === 'Özet & Grafikler' && oz && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                {/* Pasta grafik - durum dağılımı */}
                <div className="verde-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Durum Dağılımı</div>
                  <PieChart slices={[
                    { label: 'Tamamlanan', value: oz.tamamlanan, color: T.greenMid },
                    { label: 'Açık',       value: oz.acik,        color: T.amber },
                    { label: 'İşlemde',    value: oz.islemde,     color: T.blueMid },
                    { label: 'İptal',      value: oz.iptal,       color: T.red },
                  ]} />
                </div>

                {/* Başarı oranı özet */}
                <div className="verde-card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Başarı Oranı</div>
                  <div style={{ fontSize: 52, fontWeight: 900, color: oz.basariOrani >= 80 ? T.green : oz.basariOrani >= 50 ? T.amber : T.red, lineHeight: 1 }}>%{oz.basariOrani}</div>
                  <div style={{ fontSize: 13, color: T.textSoft, marginTop: 6 }}>{oz.tamamlanan} tamamlanan / {oz.toplam} toplam</div>
                  <div style={{ marginTop: 12, height: 10, background: T.border, borderRadius: 5, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${oz.basariOrani}%`, background: oz.basariOrani >= 80 ? T.green : oz.basariOrani >= 50 ? T.amber : T.red, borderRadius: 5, transition: 'width .6s ease' }} />
                  </div>
                  {oz.ortSure != null && (
                    <div style={{ marginTop: 14, padding: '8px 12px', background: T.grayLight, borderRadius: 8, fontSize: 12.5 }}>
                      <span style={{ color: T.textSoft }}>Ortalama tamamlanma süresi: </span>
                      <strong style={{ color: T.text }}>{fmtSure(oz.ortSure)}</strong>
                    </div>
                  )}
                </div>

                {/* Lokasyon bazlı bar grafik */}
                <div className="verde-card" style={{ padding: '16px 20px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Lokasyon Bazlı Görev Dağılımı (İlk 10)</div>
                  <BarChart data={data.lokBazliRows.slice(0, 10)} valueKey="toplam" labelKey="lokasyon" color={T.blueMid} height={140} />
                </div>

                {/* Personel bazlı bar grafik */}
                <div className="verde-card" style={{ padding: '16px 20px', gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Personel Bazlı Tamamlanan Görevler (İlk 10)</div>
                  <BarChart data={data.persBazliRows.slice(0, 10)} valueKey="tamamlanan" labelKey="personel" color={T.greenMid} height={140} />
                </div>
              </div>
            )}

            {/* ── LOKASYON SEKMESİ ── */}
            {activeTab === 'Lokasyon' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 16, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Lokasyon Bazlı Dağılım</div>
                <div style={{ marginBottom: 16 }}>
                  <BarChart data={data.lokBazliRows.slice(0, 12)} valueKey="toplam" labelKey="lokasyon" color={T.blueMid} height={160} />
                </div>
                <DataTable
                  headers={['LOKASYON', 'TOPLAM', 'TAMAMLANAN', 'İPTAL', 'BAŞARI']}
                  rows={data.lokBazliRows.map(r => [r.lokasyon, r.toplam, r.tamamlanan, r.iptal, r.basari])}
                />
              </div>
            )}

            {/* ── PERSONEL SEKMESİ ── */}
            {activeTab === 'Personel' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 16, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Personel Bazlı Dağılım</div>
                <div style={{ marginBottom: 16 }}>
                  <BarChart data={data.persBazliRows.slice(0, 12)} valueKey="tamamlanan" labelKey="personel" color={T.greenMid} height={160} />
                </div>
                <DataTable
                  headers={['PERSONEL', 'TOPLAM', 'TAMAMLANAN', 'BAŞARI']}
                  rows={data.persBazliRows.map(r => [r.personel, r.toplam, r.tamamlanan, r.basari])}
                />
              </div>
            )}

            {/* ── TAMAMLANAN SEKMESİ ── */}
            {activeTab === 'Tamamlanan' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Tamamlanan Görevler</div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: '#dcfce7', color: T.green }}>{data.tamamlananGorevler.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', 'GÖREV', 'LOKASYON', 'ATANAN', 'TAMAMLAYAN', 'OLUŞTURMA', 'TAMAMLANMA', 'SÜRE']}
                  rows={data.tamamlananGorevler.map(r => [r.sn, r.tanim, r.lokasyon, r.atanan, r.tamamlayan, r.olusturma, r.tamamlanma, r.sure])}
                />
              </div>
            )}

            {/* ── AÇIK / İPTAL SEKMESİ ── */}
            {activeTab === 'Açık / İptal' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Açık / İptal Görevler</div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: T.amberLight, color: T.amber }}>{data.aktifGorevler.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', 'GÖREV', 'LOKASYON', 'ATANAN', 'DURUM', 'OLUŞTURMA', 'SON İŞLEM']}
                  rows={data.aktifGorevler.map(r => [r.sn, r.tanim, r.lokasyon, r.atanan, r.durum, r.olusturma, r.sonIslem])}
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
