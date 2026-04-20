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
type TamamlananRow  = { sn: number; personel: string; ustLokasyon: string; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; durum: string }
type SapmaRow       = { sn: number; personel: string; ustLokasyon: string; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; sapmaNedeni: string }
type KayipRow       = { sn: number; ustLokasyon: string; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; durum: string; kayipNedeni: string }
type FrekansDisiRow  = { sn: number; ustLokasyon: string; grupTanimi: string; lokasyonTanimi: string; personel: string; tarihSaat: string; aciklama: string }
type AtananFrekanRow = { sn: number; atanan: string; tamamlayan: string; ustLokasyon: string; lokasyon: string; gorevTanimi: string; gorevDurumu: string; durumKod: string; atamaTarihi: string; tamamlanmaTarihi: string }

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

function BarChart({ data, valueKey, labelKey, color }: {
  data: Record<string, any>[]; valueKey: string; labelKey: string; color?: string
}) {
  if (!data.length) return <div style={{ color: T.textSoft, fontSize: 14, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
  const barClr = color ?? T.blueMid
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1)
  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0)
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
          {arcs.map((p, i) => (
            <path key={i} d={p.d} fill={p.color} stroke="#fff" strokeWidth={1.2} style={{ cursor: 'pointer', opacity: 0.9, transition: 'opacity 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.9')}>
              <title>{`${p.label}: ${p.value} (%${p.pct})`}</title>
            </path>
          ))}
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
function DataTable({ headers, rows, accentCol, accentColor, leftCols }: {
  headers: string[]; rows: (string | number)[][]; accentCol?: number; accentColor?: string; leftCols?: number[]
}) {
  const isLeft = (i: number) => i === 0 || (leftCols?.includes(i) ?? false)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>{headers.map((h, i) => (
            <th key={i} style={{ padding: '8px 12px', background: T.blue, color: '#fff', fontWeight: 700, fontSize: 12.5, textAlign: isLeft(i) ? 'left' : 'center', whiteSpace: 'nowrap' }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={headers.length} style={{ padding: '20px', textAlign: 'center', color: T.textSoft }}>Veri bulunamadı.</td></tr>
            : rows.map((row, ri) => (
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

// ── Ana bileşen ────────────────────────────────────────────────────
export default function GenelRaporKarti({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (tenantFirmaId ?? '')

  const [lokasyonlar,       setLokasyonlar]       = useState<Lokasyon[]>([])
  const [ustLokasyonId,     setUstLokasyonId]     = useState('')
  const [altLokasyonId,     setAltLokasyonId]     = useState('')
  const [altAltLokasyonId,  setAltAltLokasyonId]  = useState('')
  const [raporBaslangic, setRaporBaslangic] = useState('')
  const [raporBitis,     setRaporBitis]     = useState('')
  const [raporuAlan,     setRaporuAlan]     = useState('')
  const [data,           setData]           = useState<RaporData | null>(null)
  const [loading,        setLoading]        = useState(false)
  const [dlLoading,      setDlLoading]      = useState(false)
  const [activeTab,      setActiveTab]      = useState<Tab>('Özet & Grafikler')
  const debRef = useRef<any>(null)

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

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId)           p.set('projeId', projeId)
    if (ustLokasyonId)     p.set('ustLokasyonId', ustLokasyonId)
    if (altLokasyonId)     p.set('altLokasyonId', altLokasyonId)
    if (altAltLokasyonId)  p.set('altAltLokasyonId', altAltLokasyonId)
    if (raporBaslangic)    p.set('raporBaslangic', raporBaslangic)
    if (raporBitis)        p.set('raporBitis', raporBitis)
    if (raporuAlan)        p.set('raporuAlan', raporuAlan)
    return p
  }, [currentFirmaId, projeId, ustLokasyonId, altLokasyonId, altAltLokasyonId, raporBaslangic, raporBitis, raporuAlan])

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

    // Personel bazlı tamamlanan (Üst Lokasyon - Personel formatında, boş personel atlanır)
    const persSayac = new Map<string, number>()
    for (const r of data.tamamlananGorevler) {
      if (!r.personel) continue
      const ust = r.ustLokasyon || '—'
      const key = `${ust} - ${r.personel}`
      persSayac.set(key, (persSayac.get(key) ?? 0) + 1)
    }
    const persBazli = [...persSayac.entries()]
      .map(([personel, sayi]) => ({ personel, sayi }))
      .sort((a, b) => b.sayi - a.sayi).slice(0, 10)

    // Lokasyon bazlı tamamlanan (Üst Lokasyon - Lokasyon formatında)
    const lokSayac = new Map<string, number>()
    for (const r of data.tamamlananGorevler) {
      const lok = r.lokasyon || 'Bilinmiyor'
      const ust = r.ustLokasyon || '—'
      const key = `${ust} - ${lok}`
      lokSayac.set(key, (lokSayac.get(key) ?? 0) + 1)
    }
    const lokBazli = [...lokSayac.entries()]
      .map(([lokasyon, sayi]) => ({ lokasyon, sayi }))
      .sort((a, b) => b.sayi - a.sayi).slice(0, 10)

    // Kayıp neden dağılımı
    const kayipSayac = new Map<string, number>()
    for (const r of data.kayipGorevler) {
      const k = r.kayipNedeni || 'Diğer'
      kayipSayac.set(k, (kayipSayac.get(k) ?? 0) + 1)
    }
    const kayipNedeni = [...kayipSayac.entries()]
      .map(([neden, sayi]) => ({ neden, sayi }))
      .sort((a, b) => b.sayi - a.sayi)

    // Sapma neden dağılımı
    const sapmaSayac = new Map<string, number>()
    for (const r of data.sapmaGorevler) {
      const k = r.sapmaNedeni || 'Diğer'
      sapmaSayac.set(k, (sapmaSayac.get(k) ?? 0) + 1)
    }
    const sapmaNedeni = [...sapmaSayac.entries()]
      .map(([neden, sayi]) => ({ neden, sayi }))
      .sort((a, b) => b.sayi - a.sayi)

    // Grup bazlı tamamlanan (aynı isimli grupları birleştir, tüm gruplar)
    const grupAgg = new Map<string, { tamamlanan: number; hedef: number; sapma: number; kayip: number }>()
    for (const g of data.grupMetrikleri) {
      const ex = grupAgg.get(g.grup) ?? { tamamlanan: 0, hedef: 0, sapma: 0, kayip: 0 }
      grupAgg.set(g.grup, { tamamlanan: ex.tamamlanan + g.tamamlanan, hedef: ex.hedef + g.hedef, sapma: ex.sapma + g.sapma, kayip: ex.kayip + g.kayip })
    }
    const grupBazli = [...grupAgg.entries()]
      .map(([grup, v]) => ({ grup, ...v }))
      .sort((a, b) => b.tamamlanan - a.tamamlanan)

    // Kayıp frekanslar – lokasyon bazlı (Üst Lokasyon - Lokasyon, ilk 10)
    const kayipLokSayac = new Map<string, number>()
    for (const r of data.kayipGorevler) {
      const lok = r.lokasyon || 'Bilinmiyor'
      const ust = r.ustLokasyon || '—'
      const key = `${ust} - ${lok}`
      kayipLokSayac.set(key, (kayipLokSayac.get(key) ?? 0) + 1)
    }
    const kayipLokBazli = [...kayipLokSayac.entries()]
      .map(([lokasyon, sayi]) => ({ lokasyon, sayi }))
      .sort((a, b) => b.sayi - a.sayi).slice(0, 10)

    // Sapma frekanslar – lokasyon bazlı (Üst Lokasyon - Lokasyon, ilk 10)
    const sapmaLokSayac = new Map<string, number>()
    for (const r of data.sapmaGorevler) {
      const lok = r.lokasyon || 'Bilinmiyor'
      const ust = r.ustLokasyon || '—'
      const key = `${ust} - ${lok}`
      sapmaLokSayac.set(key, (sapmaLokSayac.get(key) ?? 0) + 1)
    }
    const sapmaLokBazli = [...sapmaLokSayac.entries()]
      .map(([lokasyon, sayi]) => ({ lokasyon, sayi }))
      .sort((a, b) => b.sayi - a.sayi).slice(0, 10)

    // Atanan frekanslar — personel bazlı başarı
    const persBazliBasariMap = new Map<string, { atanan: number; tamamlanan: number; sapma: number; kayip: number; aktif: number }>()
    for (const r of data.atananFrekanslar) {
      const key = r.atanan === '—' ? 'Atanmamış' : r.atanan
      if (!persBazliBasariMap.has(key)) persBazliBasariMap.set(key, { atanan: 0, tamamlanan: 0, sapma: 0, kayip: 0, aktif: 0 })
      const e = persBazliBasariMap.get(key)!
      e.atanan++
      if (r.durumKod === 'TAMAMLANDI') e.tamamlanan++
      else if (r.durumKod === 'ZAMANINDA_YAPILAMAYAN') e.sapma++
      else if (['ZAMANI_GECMIS', 'IPTAL', 'KAPATILDI', 'SILINDI', 'BEKLEMEDE'].includes(r.durumKod)) e.kayip++
      else e.aktif++
    }
    const persBazliBasari = [...persBazliBasariMap.entries()]
      .map(([personel, v]) => ({
        personel,
        atanan: v.atanan,
        tamamlanan: v.tamamlanan,
        sapma: v.sapma,
        kayip: v.kayip,
        aktif: v.aktif,
        basariOrani: v.atanan > 0 ? Math.round(v.tamamlanan / v.atanan * 100) : 0,
      }))
      .sort((a, b) => b.atanan - a.atanan)

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
              const frekansPct = toplamHedef > 0 ? Math.round(data.frekansDisiGorevler.length / toplamHedef * 100) : 0
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 10 }}>
                  <KpiCard label="Hedef"        value={toplamHedef}                        color={T.blue}    Icon={Target} />
                  <KpiCard label="Tamamlanan"   value={data.toplamTamamlanan}              color={T.green}   Icon={CheckCircle}   pct={`%${tamPct}`} />
                  <KpiCard label="Sapma"        value={data.toplamSapma}                   color={T.amber}   Icon={AlertTriangle} pct={`%${sapmaPct}`} />
                  <KpiCard label="Kayıp"        value={data.toplamKayip}                   color={T.red}     Icon={XCircle}       pct={`%${kayipPct}`} />
                  <KpiCard label="Frekans Dışı" value={data.frekansDisiGorevler.length}    color={T.gray}    Icon={Activity}      pct={`%${frekansPct}`} />
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

            {/* Sekme navigasyon */}
            <div style={{ display: 'flex', gap: 4, background: T.grayLight, borderRadius: 8, padding: 4, alignSelf: 'flex-start', flexWrap: 'wrap', border: `1px solid ${T.border}` }}>
              {TABS.map(t => <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>{t}</button>)}
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
                      { label: 'Frekans Dışı',    value: data.frekansDisiGorevler.length, color: T.gray,  bg: T.grayLight },
                      { label: 'Rapor Dönemi',    value: `${data.gunSayisi} gün`,       color: T.gray,    bg: T.grayLight },
                    ].map(s => (
                      <div key={s.label} style={{ padding: '10px 12px', background: s.bg, borderRadius: 8, textAlign: 'center', border: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: T.textSoft, marginTop: 3, fontWeight: 600 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── 2. Frekans Dağılımı | Grup Bazlı Tamamlanan ── */}
                <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 16, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Frekans Dağılımı &amp; Grup Bazlı Tamamlanan</div>
                  <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 0 }}>
                    <div style={{ flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 10, textTransform: 'uppercase' as const }}>Genel Dağılım</div>
                      <PieChart size={200} slices={[
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

                {/* ── 4. Personel Bazlı Tamamlanan ── */}
                <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Personel Bazlı Tamamlanan Göreveler</div>
                  {ozetData.persBazli.length > 0
                    ? <BarChart data={ozetData.persBazli} valueKey="sayi" labelKey="personel" color={T.blue} />
                    : <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
                  }
                </div>

                {/* ── 5. Lokasyon Bazlı Tamamlanan ── */}
                <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Lokasyon Bazlı Tamamlanan Görevler</div>
                  {ozetData.lokBazli.length > 0
                    ? <BarChart data={ozetData.lokBazli} valueKey="sayi" labelKey="lokasyon" color={T.blueMid} />
                    : <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Veri yok</div>
                  }
                </div>

                {/* ── 6. Kayıp Frekanslar: pasta (hedef vs kayıp) | lokasyon bar ── */}
                <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Kayıp Frekanslar</div>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: T.redLight, color: T.red, flexShrink: 0 }}>{data.kayipGorevler.length} kayıt</span>
                  </div>
                  <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 0 }}>
                    <div style={{ flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 10, textTransform: 'uppercase' as const }}>Hedef / Kayıp Oranı</div>
                      <PieChart size={200} slices={[
                        { label: 'Kayıp',       value: data.toplamKayip,                                       color: T.red },
                        { label: 'Hedef Kalan', value: Math.max(0, toplamHedef - data.toplamKayip),            color: '#e2e8f0' },
                      ]} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 6, textTransform: 'uppercase' as const }}>Lokasyon Bazlı Kayıp (İlk 10)</div>
                      {ozetData.kayipLokBazli.length > 0
                        ? <BarChart data={ozetData.kayipLokBazli} valueKey="sayi" labelKey="lokasyon" color={T.red} />
                        : <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Kayıp kayıt yok</div>
                      }
                    </div>
                  </div>
                </div>

                {/* ── 7. Sapma Frekanslar: pasta (hedef vs sapma) | lokasyon bar ── */}
                <div className="verde-card" style={{ padding: '16px 20px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Sapma Frekanslar</div>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: T.amberLight, color: T.amber, flexShrink: 0 }}>{data.sapmaGorevler.length} kayıt</span>
                  </div>
                  <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', minWidth: 0 }}>
                    <div style={{ flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 10, textTransform: 'uppercase' as const }}>Hedef / Sapma Oranı</div>
                      <PieChart size={200} slices={[
                        { label: 'Sapma',       value: data.toplamSapma,                                       color: T.amber },
                        { label: 'Hedef Kalan', value: Math.max(0, toplamHedef - data.toplamSapma),            color: '#e2e8f0' },
                      ]} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, marginBottom: 6, textTransform: 'uppercase' as const }}>Lokasyon Bazlı Sapma (İlk 10)</div>
                      {ozetData.sapmaLokBazli.length > 0
                        ? <BarChart data={ozetData.sapmaLokBazli} valueKey="sayi" labelKey="lokasyon" color={T.amber} />
                        : <div style={{ color: T.textSoft, fontSize: 13, padding: '24px 0', textAlign: 'center' }}>Sapma kayıt yok</div>
                      }
                    </div>
                  </div>
                </div>

                {/* ── 6. Frekans Dışı Çalışmalar ── */}
                {data.frekansDisiGorevler.length > 0 && (
                  <div className="verde-card" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Frekans Dışı Çalışmalar (Ekstra Frekansiyel)</div>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: T.grayLight, color: T.gray }}>{data.frekansDisiGorevler.length} kayıt</span>
                    </div>
                    <DataTable
                      headers={['SN', 'ÜST LOKASYON', 'GRUP TANIMI', 'LOKASYON', 'PERSONEL', 'TARİH-SAAT', 'GÖREV TANIMI']}
                      rows={data.frekansDisiGorevler.map(r => [r.sn, r.ustLokasyon, r.grupTanimi, r.lokasyonTanimi, r.personel, r.tarihSaat, r.aciklama])}
                    />
                  </div>
                )}

              </div>
            )}

            {/* ── GRUP METRİKLERİ ── */}
            {activeTab === 'Grup Metrikleri' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Grup Frekans Metrikleri</div>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: T.blueLight, color: T.blue }}>{data.grupMetrikleri.length} grup</span>
                </div>
                {/* Toplamlar */}
                {data.grupMetrikleri.length > 0 && (() => {
                  const tGunluk = data.grupMetrikleri.reduce((s, g) => s + g.gunlukFrekans, 0)
                  const tHedef  = data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0)
                  const tTam    = data.grupMetrikleri.reduce((s, g) => s + g.tamamlanan, 0)
                  const tSap    = data.grupMetrikleri.reduce((s, g) => s + g.sapma, 0)
                  const tKay    = data.grupMetrikleri.reduce((s, g) => s + g.kayip, 0)
                  const tEks    = data.grupMetrikleri.reduce((s, g) => s + (g.ekstra ?? 0), 0)
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
                <DataTable
                  headers={['SN', 'GRUP',
                    altAltLokasyonId ? 'ALT LOKASYON' : altLokasyonId ? 'ÜST LOKASYON' : 'ÜST LOKASYON',
                    altAltLokasyonId ? 'ALT-ALT LOKASYON' : altLokasyonId ? 'ALT LOKASYON' : 'LOKASYON',
                    'VARDİYA FREKANS', !ustLokasyonId ? 'VARDİYA SAYISI' : 'GÜNLÜK VARDİYA', 'HEDEF', 'TAMAMLANAN', 'EKSTRA', 'SAPMA', 'KAYIP', 'BAŞARI', 'GENEL ORAN']}
                  rows={data.grupMetrikleri.map((g, i) => [i + 1, g.grup, g.ustLokasyon, g.lokasyon, g.gunlukFrekans, !ustLokasyonId ? g.kuralSayisi * (data.gunSayisi || 1) : g.kuralSayisi, g.hedef, g.tamamlanan, g.ekstra ?? 0, g.sapma, g.kayip, g.basariOrani, g.genelOran])}
                  accentCol={11} accentColor={T.greenMid} leftCols={[1, 2, 3]}
                />
              </div>
            )}

            {/* ── TAMAMLANAN ── */}
            {activeTab === 'Tamamlanan' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Tamamlanan Frekanslar</div>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: '#dcfce7', color: T.green }}>{data.tamamlananGorevler.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', 'PERSONEL', altAltLokasyonId ? 'ALT LOKASYON' : 'ÜST LOKASYON', altAltLokasyonId ? 'ALT-ALT LOKASYON' : 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH-SAAT', 'DURUM']}
                  rows={data.tamamlananGorevler.map(r => [r.sn, r.personel, r.ustLokasyon, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarihSaat, r.durum])}
                />
              </div>
            )}

            {/* ── SAPMALAR ── */}
            {activeTab === 'Sapmalar' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Sapma Frekanslar</div>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: T.amberLight, color: T.amber }}>{data.sapmaGorevler.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', 'PERSONEL', altAltLokasyonId ? 'ALT LOKASYON' : 'ÜST LOKASYON', altAltLokasyonId ? 'ALT-ALT LOKASYON' : 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH-SAAT', 'SAPMA NEDENİ']}
                  rows={data.sapmaGorevler.map(r => [r.sn, r.personel, r.ustLokasyon, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarihSaat, r.sapmaNedeni])}
                />
              </div>
            )}

            {/* ── KAYIP FREKANSLAR ── */}
            {activeTab === 'Kayıp Frekanslar' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Kayıp Frekanslar</div>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: T.redLight, color: T.red }}>{data.kayipGorevler.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', altAltLokasyonId ? 'ALT LOKASYON' : 'ÜST LOKASYON', altAltLokasyonId ? 'ALT-ALT LOKASYON' : 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH-SAAT', 'DURUM', 'KAYIP NEDENİ']}
                  rows={data.kayipGorevler.map(r => [r.sn, r.ustLokasyon, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarihSaat, r.durum, r.kayipNedeni])}
                />
              </div>
            )}

            {/* ── FREKANS DIŞI ── */}
            {activeTab === 'Frekans Dışı' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Frekans Dışı Çalışmalar (Ekstra Frekansiyel)</div>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: T.grayLight, color: T.gray }}>{data.frekansDisiGorevler.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', 'ÜST LOKASYON', 'GRUP TANIMI', 'LOKASYON', 'PERSONEL', 'TARİH-SAAT', 'AÇIKLAMA']}
                  rows={data.frekansDisiGorevler.map(r => [r.sn, r.ustLokasyon, r.grupTanimi, r.lokasyonTanimi, r.personel, r.tarihSaat, r.aciklama])}
                />
              </div>
            )}

            {/* ── ATANAN FREKANSLAR ── */}
            {activeTab === 'Atanan Frekanslar' && (
              <div className="verde-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: T.text, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Atanan Frekanslar</div>
                  <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 12px', borderRadius: 999, background: T.blueLight, color: T.blue }}>{data.atananFrekanslar.length} kayıt</span>
                </div>
                <DataTable
                  headers={['SN', 'ATANAN', 'TAMAMLAYAN', 'ÜST LOKASYON', 'LOKASYON', 'GÖREV TANIMI', 'GÖREV DURUMU', 'ATAMA TARİHİ', 'TAMAMLANMA TARİH+SAAT']}
                  rows={data.atananFrekanslar.map(r => [r.sn, r.atanan, r.tamamlayan, r.ustLokasyon, r.lokasyon, r.gorevTanimi, r.gorevDurumu, r.atamaTarihi, r.tamamlanmaTarihi])}
                  leftCols={[1, 2, 3, 4, 5]}
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
