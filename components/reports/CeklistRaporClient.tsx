'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { ChecklistTablo } from '@/components/checklist/ChecklistModal'
import type { Sonuc } from '@/components/checklist/ChecklistModal'
import { RefreshCw, ChevronDown, ChevronRight, Activity, FileSpreadsheet, FileText, Download } from 'lucide-react'

interface Props { base: string; isSA: boolean; tenantFirmaId?: string | null; projeId?: string | null }

type Row   = {
  gorev_id: string; task_type: string; tanim: string; gorev_tipi: string; durum: string; lokasyon: string
  atanan: string; tamamlayan: string; olusturma: string; tamamlanma: string
  madde_toplam: number; madde_dolduruldu: number; madde_tamamlanan: number; basari_pct: number
  maddeler: Sonuc[]
}
type Ozet  = { toplam: number; dolduruldu: number; tamamlanan: number; ort_basari: number }

const T = {
  green: '#1a5c2a', greenMid: '#2e8b2e', greenLight: '#f0fdf4',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  amber: '#d97706', amberLight: '#fef3c7',
  red: '#dc2626', redLight: '#fee2e2',
  gray: '#475569', grayLight: '#f8fafc', border: '#e2e8f0',
  text: '#0f172a', textSoft: '#64748b',
}
const spinning = { animation: 'spin 0.9s linear infinite' }
const inp: React.CSSProperties = {
  height: 34, padding: '0 10px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: '#fff', fontSize: 13, width: '100%',
}

const DURUM_LABEL: Record<string, string> = {
  ACIK: 'Açık', ISLEMDE: 'İşlemde', TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal', HAZIR: 'Hazır', BEKLEMEDE: 'Beklemede',
  ZAMANI_GECMIS: 'Z. Geçmiş', ZAMANINDA_YAPILAMAYAN: 'Z. Yapılamayan',
}
const DURUM_RENK: Record<string, string> = {
  ACIK: '#dbeafe', ISLEMDE: '#ede9fe', TAMAMLANDI: '#dcfce7',
  IPTAL: '#fee2e2', HAZIR: '#f1f5f9', BEKLEMEDE: '#fef3c7',
  ZAMANI_GECMIS: '#fee2e2', ZAMANINDA_YAPILAMAYAN: '#fef3c7',
}
const DURUM_TEXT: Record<string, string> = {
  ACIK: '#1d4ed8', ISLEMDE: '#7c3aed', TAMAMLANDI: '#15803d',
  IPTAL: '#dc2626', HAZIR: '#475569', BEKLEMEDE: '#d97706',
  ZAMANI_GECMIS: '#dc2626', ZAMANINDA_YAPILAMAYAN: '#d97706',
}

function KpiCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 16px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: T.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}


function GorevSatiri({ row }: { row: Row }) {
  const [acik, setAcik] = useState(false)
  const basariColor = row.basari_pct === 100 ? T.green : row.basari_pct >= 50 ? T.amber : row.basari_pct > 0 ? T.red : T.textSoft

  return (
    <>
      <tr
        onClick={() => setAcik(!acik)}
        style={{ cursor: 'pointer', background: acik ? '#f0f9f0' : 'inherit', borderBottom: `1px solid ${T.border}` }}
      >
        <td style={{ padding: '10px 8px', width: 24, color: T.textSoft }}>
          {acik ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </td>
        <td style={{ padding: '10px 10px', fontSize: 13, fontWeight: 600, color: T.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.tanim}>{row.tanim}</td>
        <td style={{ padding: '10px 10px', fontSize: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: row.gorev_tipi === 'Frekansiyel' ? T.greenLight : T.blueLight, color: row.gorev_tipi === 'Frekansiyel' ? T.green : T.blue }}>
            {row.gorev_tipi}
          </span>
        </td>
        <td style={{ padding: '10px 10px' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: DURUM_RENK[row.durum] ?? T.grayLight, color: DURUM_TEXT[row.durum] ?? T.textSoft }}>
            {DURUM_LABEL[row.durum] ?? row.durum}
          </span>
        </td>
        <td style={{ padding: '10px 10px', fontSize: 12.5, color: T.gray }}>{row.lokasyon}</td>
        <td style={{ padding: '10px 10px', fontSize: 12.5, color: T.gray }}>{row.tamamlayan}</td>
        <td style={{ padding: '10px 10px', fontSize: 12, color: T.textSoft, whiteSpace: 'nowrap' }}>{row.tamamlanma}</td>
        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', minWidth: 48 }}>
              <div style={{ height: '100%', width: `${row.basari_pct}%`, background: basariColor, borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: basariColor, flexShrink: 0 }}>%{row.basari_pct}</span>
          </div>
          <div style={{ fontSize: 10.5, color: T.textSoft, marginTop: 2 }}>{row.madde_tamamlanan}/{row.madde_toplam} madde</div>
        </td>
      </tr>
      {acik && (
        <tr>
          <td colSpan={8} style={{ padding: '4px 16px 16px 32px', background: '#fafcfa' }}>
            <ChecklistTablo sonuclar={row.maddeler} />
          </td>
        </tr>
      )}
    </>
  )
}

export default function CeklistRaporClient({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (tenantFirmaId ?? '')

  const [baslangic,  setBaslangic]  = useState('')
  const [bitis,      setBitis]      = useState('')
  const [lokasyonId, setLokasyonId] = useState('')
  const [yapan,      setYapan]      = useState('')
  const [tanim,      setTanim]      = useState('')
  const [durum,      setDurum]      = useState('TUMU')
  const [gorevTipi,  setGorevTipi]  = useState('hepsi')
  const [data,       setData]       = useState<{ rows: Row[]; ozet: Ozet; lokasyonlar: any[]; kullanicilar: any[] } | null>(null)
  const [loading,    setLoading]    = useState(false)
  const [dlLoading,  setDlLoading]  = useState<'excel'|'csv'|'pdf'|null>(null)
  const [filtreUygulandı, setFiltreUygulandı] = useState(false)

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId)    p.set('projeId', projeId)
    if (baslangic)  p.set('baslangic', baslangic)
    if (bitis)      p.set('bitis', bitis)
    if (lokasyonId) p.set('lokasyonId', lokasyonId)
    if (yapan)      p.set('yapan', yapan)
    if (tanim)      p.set('tanim', tanim)
    if (durum !== 'TUMU') p.set('durum', durum)
    if (gorevTipi !== 'hepsi') p.set('gorevTipi', gorevTipi)
    return p
  }, [currentFirmaId, projeId, baslangic, bitis, lokasyonId, yapan, tanim, durum, gorevTipi])

  async function download(format: 'excel' | 'csv' | 'pdf') {
    if (!currentFirmaId) return
    setDlLoading(format)
    try {
      const p = buildParams(); p.set('format', format)
      const res = await fetch(`/api/reports/ceklist-rapor-export?${p}`)
      if (!res.ok) throw new Error('İndirme başarısız.')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const ext  = format === 'excel' ? 'xlsx' : format
      a.href = url; a.download = `ceklist-rapor-${new Date().toISOString().slice(0,10)}.${ext}`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setDlLoading(null)
  }

  const fetchData = useCallback(async () => {
    if (!currentFirmaId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/reports/ceklist-rapor?${buildParams()}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Veri alınamadı.')
      setData(json)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setLoading(false)
  }, [buildParams, currentFirmaId, toast])

  function uygula() {
    setFiltreUygulandı(true)
    fetchData()
  }

  function temizle() {
    setBaslangic(''); setBitis(''); setLokasyonId(''); setYapan('')
    setTanim(''); setDurum('TUMU'); setGorevTipi('hepsi')
    setData(null); setFiltreUygulandı(false)
  }

  // Firma değişince son 24 saati otomatik yükle
  useEffect(() => {
    if (!currentFirmaId) { setData(null); setFiltreUygulandı(false); return }
    const now  = new Date()
    const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const fmt  = (d: Date) => d.toISOString().split('T')[0]
    const bas  = fmt(prev)
    const bit  = fmt(now)
    setBaslangic(bas)
    setBitis(bit)
    setFiltreUygulandı(true)
    setLoading(true)
    const p = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId) p.set('projeId', projeId)
    p.set('baslangic', bas)
    p.set('bitis', bit)
    fetch(`/api/reports/ceklist-rapor?${p}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (!json.error) setData(json); else setData(null) })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFirmaId])

  const oz = data?.ozet

  return (
    <div>
      <Topbar title="Çeklist Raporları" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Çeklist Raporları' }]} />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Filtreler */}
        <div className="verde-card" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>QR-SYNC</div>
              <h2 style={{ fontSize: 17, fontWeight: 900, color: T.text, margin: 0 }}>Çeklist Raporları</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={temizle} disabled={loading}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.grayLight, color: T.gray, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                Temizle
              </button>
              <button onClick={uygula} disabled={loading || !currentFirmaId}
                style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: T.green, color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                <RefreshCw size={13} style={loading ? spinning : {}} />
                {loading ? 'Yükleniyor…' : '▶ Uygula'}
              </button>
              <button onClick={() => download('excel')} disabled={!data || dlLoading !== null}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #d1fae5', background: '#f0fdf4', color: T.green, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                <FileSpreadsheet size={13} style={dlLoading === 'excel' ? spinning : {}} />
                Excel
              </button>
              <button onClick={() => download('csv')} disabled={!data || dlLoading !== null}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #dbeafe', background: '#eff6ff', color: T.blue, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                <Download size={13} style={dlLoading === 'csv' ? spinning : {}} />
                CSV
              </button>
              <button onClick={() => download('pdf')} disabled={!data || dlLoading !== null}
                style={{ height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: T.red, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12 }}>
                <FileText size={13} style={dlLoading === 'pdf' ? spinning : {}} />
                PDF
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px,1fr))', gap: 10 }}>
            {([
              { label: 'Başlangıç',         node: <input type="date" value={baslangic}  onChange={e => setBaslangic(e.target.value)}  style={inp} /> },
              { label: 'Bitiş',             node: <input type="date" value={bitis}      onChange={e => setBitis(e.target.value)}      style={inp} /> },
              { label: 'Lokasyon',          node: (
                <select value={lokasyonId} onChange={e => setLokasyonId(e.target.value)} style={inp}>
                  <option value="">Tümü</option>
                  {(data?.lokasyonlar ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              )},
              { label: 'Görev Tanımı',      node: <input type="text" value={tanim}     onChange={e => setTanim(e.target.value)}      style={inp} placeholder="Ara…" /> },
              { label: 'Tamamlayan',        node: <input type="text" value={yapan}      onChange={e => setYapan(e.target.value)}      style={inp} placeholder="Ara…" /> },
              { label: 'Görev Durumu',      node: (
                <select value={durum} onChange={e => setDurum(e.target.value)} style={inp}>
                  <option value="TUMU">Tümü</option>
                  <option value="TAMAMLANDI">Tamamlandı</option>
                  <option value="ACIK">Açık</option>
                  <option value="ISLEMDE">İşlemde</option>
                  <option value="IPTAL">İptal</option>
                </select>
              )},
              { label: 'Görev Türü',        node: (
                <select value={gorevTipi} onChange={e => setGorevTipi(e.target.value)} style={inp}>
                  <option value="hepsi">Tümü</option>
                  <option value="frekansiyel">Frekansiyel</option>
                  <option value="spesifik">Spesifik</option>
                </select>
              )},
            ] as { label: string; node: React.ReactNode }[]).map(({ label, node }) => (
              <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</span>
                {node}
              </label>
            ))}
          </div>
        </div>

        {/* KPI */}
        {oz && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10 }}>
            <KpiCard label="Toplam Görev"      value={oz.toplam}                                 color={T.blue}    />
            <KpiCard label="Çeklist Dolduruldu" value={oz.dolduruldu} sub={`${oz.toplam} görevden`} color={T.amber} />
            <KpiCard label="Tam Tamamlanan"    value={oz.tamamlanan} sub="Tüm maddeler ✓"         color={T.green}   />
            <KpiCard label="Ort. Başarı"       value={`%${oz.ort_basari}`}                        color={oz.ort_basari >= 80 ? T.green : oz.ort_basari >= 50 ? T.amber : T.red} />
          </div>
        )}

        {/* Tablo */}
        {loading && (
          <div className="verde-card" style={{ padding: 48, textAlign: 'center', color: T.textSoft }}>
            <RefreshCw size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4, ...spinning }} />
            <div style={{ fontWeight: 700 }}>Veriler yükleniyor…</div>
          </div>
        )}
        {!loading && !filtreUygulandı && (
          <div className="verde-card" style={{ padding: 48, textAlign: 'center', color: T.textSoft }}>
            <Activity size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
            <div style={{ fontWeight: 700 }}>Filtreleri seçip <strong>▶ Uygula</strong> butonuna basın.</div>
          </div>
        )}

        {data && (
          <div className="verde-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>Çeklist Sonuçları</span>
              <span style={{ fontSize: 12, color: T.textSoft }}>{data.rows.length} kayıt — satıra tıklayarak maddeleri görüntüleyin</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: T.green }}>
                    {['', 'Görev', 'Tür', 'Durum', 'Lokasyon', 'Tamamlayan', 'Tamamlanma', 'Çeklist Başarısı'].map((h, i) => (
                      <th key={i} style={{ padding: '9px 10px', color: '#fff', fontWeight: 700, fontSize: 11.5, textAlign: i > 1 ? 'center' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0
                    ? <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: T.textSoft }}>Eşleşen çeklist kaydı bulunamadı.</td></tr>
                    : data.rows.map((row, i) => (
                      <GorevSatiri key={row.gorev_id + i} row={row} />
                    ))
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
