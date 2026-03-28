'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { ChecklistTablo } from '@/components/checklist/ChecklistModal'
import type { Sonuc } from '@/components/checklist/ChecklistModal'
import {
  RefreshCw, ChevronDown, ChevronRight,
  FileSpreadsheet, FileText, Download, ClipboardList,
} from 'lucide-react'

interface Props {
  base: string
  isSA: boolean
  tenantFirmaId?: string | null
  projeId?: string | null
}

type Row = {
  gorev_id: string
  tanim: string
  gorev_tipi: string
  durum: string
  lokasyon: string
  atanan: string
  yapan: string
  olusturma: string
  tamamlanma: string
  ceklist_dolu: boolean
  madde_toplam: number
  madde_dolduruldu: number
  basari_pct: number
  maddeler: Sonuc[]
}

type Ozet = { toplam: number; dolduruldu: number; basari: number }

// ── Durum renk/label ─────────────────────────────────────────────────────────
const DURUM_LABEL: Record<string, string> = {
  TAMAMLANDI:           'Tamamlandı',
  ZAMANINDA_YAPILAMAYAN:'Gecikme ile Tamamlandı',
  ZAMANI_GECMIS:        'Zamanı Geçmiş',
  IPTAL:                'İptal',
  SILINDI:              'Silindi',
  KAPATILDI:            'Kapatıldı',
}
const DURUM_BG: Record<string, string> = {
  TAMAMLANDI:           '#dcfce7',
  ZAMANINDA_YAPILAMAYAN:'#fef3c7',
  ZAMANI_GECMIS:        '#fee2e2',
  IPTAL:                '#fee2e2',
  SILINDI:              '#f1f5f9',
  KAPATILDI:            '#f1f5f9',
}
const DURUM_CLR: Record<string, string> = {
  TAMAMLANDI:           '#166534',
  ZAMANINDA_YAPILAMAYAN:'#92400e',
  ZAMANI_GECMIS:        '#991b1b',
  IPTAL:                '#991b1b',
  SILINDI:              '#475569',
  KAPATILDI:            '#475569',
}

// ── Stiller ──────────────────────────────────────────────────────────────────
const C = {
  green: '#1a5c2a', greenMid: '#2e8b2e', greenLight: '#f0fdf4',
  blue: '#1d4ed8',  blueLight: '#eff6ff',
  amber: '#d97706', amberLight: '#fef3c7',
  red: '#dc2626',   redLight: '#fee2e2',
  gray: '#475569',  grayLight: '#f8fafc',
  border: '#e2e8f0', text: '#0f172a', soft: '#64748b',
}
const spin = { animation: 'spin 0.9s linear infinite' }
const inp: React.CSSProperties = {
  height: 34, padding: '0 10px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: '#fff', fontSize: 13, width: '100%',
}
const btn = (bg: string, clr: string, border?: string): React.CSSProperties => ({
  height: 34, padding: '0 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
  fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5,
  background: bg, color: clr, border: `1px solid ${border ?? bg}`,
})

// ── KPI Kartı ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: C.text }}>{value}</div>
    </div>
  )
}

// ── Tablo satırı ─────────────────────────────────────────────────────────────
function GorevSatiri({ row }: { row: Row }) {
  const [acik, setAcik] = useState(false)
  const bc = row.basari_pct === 100 ? C.green : row.basari_pct >= 50 ? C.amber : row.basari_pct > 0 ? C.red : C.soft

  return (
    <>
      <tr
        onClick={() => setAcik(v => !v)}
        style={{ cursor: 'pointer', background: acik ? '#f0f9f0' : 'inherit', borderBottom: `1px solid ${C.border}` }}
      >
        <td style={{ padding: '10px 8px', width: 24, color: C.soft }}>
          {acik ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </td>
        <td style={{ padding: '10px 10px', fontSize: 13, fontWeight: 600, color: C.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.tanim}>
          {row.tanim}
          {!row.ceklist_dolu && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.soft, background: '#f1f5f9', padding: '1px 5px', borderRadius: 4 }}>Boş</span>
          )}
        </td>
        <td style={{ padding: '10px 10px', fontSize: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
            background: row.gorev_tipi === 'Frekansiyel' ? C.greenLight : C.blueLight,
            color:      row.gorev_tipi === 'Frekansiyel' ? C.green       : C.blue }}>
            {row.gorev_tipi}
          </span>
        </td>
        <td style={{ padding: '10px 10px' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
            background: DURUM_BG[row.durum]  ?? C.grayLight,
            color:      DURUM_CLR[row.durum] ?? C.soft }}>
            {DURUM_LABEL[row.durum] ?? row.durum}
          </span>
        </td>
        <td style={{ padding: '10px 10px', fontSize: 12.5, color: C.gray }}>{row.lokasyon}</td>
        <td style={{ padding: '10px 10px', fontSize: 12.5, color: C.gray }}>{row.yapan}</td>
        <td style={{ padding: '10px 10px', fontSize: 12, color: C.soft, whiteSpace: 'nowrap' }}>{row.tamamlanma}</td>
        <td style={{ padding: '10px 10px' }}>
          {row.madde_toplam > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden', minWidth: 48 }}>
                <div style={{ height: '100%', width: `${row.basari_pct}%`, background: bc, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: bc, flexShrink: 0 }}>%{row.basari_pct}</span>
            </div>
          ) : (
            <span style={{ fontSize: 11, color: C.soft }}>—</span>
          )}
          <div style={{ fontSize: 10.5, color: C.soft, marginTop: 2 }}>{row.madde_dolduruldu}/{row.madde_toplam} madde</div>
        </td>
      </tr>
      {acik && (
        <tr>
          <td colSpan={8} style={{ padding: '4px 16px 16px 32px', background: '#fafcfa' }}>
            {row.ceklist_dolu
              ? <ChecklistTablo sonuclar={row.maddeler} />
              : <div style={{ padding: '16px 0', color: C.soft, fontSize: 13 }}>Bu görev için çeklist doldurulmamış.</div>
            }
          </td>
        </tr>
      )}
    </>
  )
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function CeklistRaporClient({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { toast }          = useToast()
  const { firmaId: saFId } = useFirma()
  const firmaId = isSA ? (saFId ?? '') : (tenantFirmaId ?? '')

  const [baslangic,  setBaslangic]  = useState('')
  const [bitis,      setBitis]      = useState('')
  const [lokasyonId, setLokasyonId] = useState('')
  const [yapan,      setYapan]      = useState('')
  const [tanim,      setTanim]      = useState('')
  const [durum,      setDurum]      = useState('TUMU')
  const [gorevTipi,  setGorevTipi]  = useState('hepsi')

  const [data,    setData]    = useState<{ rows: Row[]; ozet: Ozet; lokasyonlar: any[]; kullanicilar: any[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const [dlLoad,  setDlLoad]  = useState<'excel' | 'csv' | 'pdf' | null>(null)

  // son 24 saati hesapla (tarih string olarak)
  function son24h() {
    const now  = new Date()
    const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const fmt  = (d: Date) => d.toISOString().split('T')[0]
    return { bas: fmt(prev), bit: fmt(now) }
  }

  // Firma değişince son 24 saati otomatik yükle
  const firmaRef = useRef<string>('')
  useEffect(() => {
    if (!firmaId || firmaId === firmaRef.current) return
    firmaRef.current = firmaId

    const { bas, bit } = son24h()
    setBaslangic(bas)
    setBitis(bit)
    setLokasyonId(''); setYapan(''); setTanim(''); setDurum('TUMU'); setGorevTipi('hepsi')

    setLoading(true)
    const p = new URLSearchParams({ firmaId, kaynak: 'hepsi', baslangic: bas, bitis: bit })
    if (projeId) p.set('projeId', projeId)
    fetch(`/api/reports/ceklist-rapor?${p}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (json.ok) setData(json); else { toast({ type: 'error', title: 'Hata', message: json.error ?? 'Veri alınamadı' }); setData(null) } })
      .catch(() => { toast({ type: 'error', title: 'Bağlantı hatası', message: 'Veriler yüklenemedi' }); setData(null) })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ firmaId, kaynak: 'hepsi' })
    if (projeId)    p.set('projeId', projeId)
    if (baslangic)  p.set('baslangic', baslangic)
    if (bitis)      p.set('bitis', bitis)
    if (lokasyonId) p.set('lokasyonId', lokasyonId)
    if (yapan)      p.set('yapan', yapan)
    if (tanim)      p.set('tanim', tanim)
    if (durum !== 'TUMU') p.set('durum', durum)
    if (gorevTipi !== 'hepsi') p.set('gorevTipi', gorevTipi)
    return p
  }, [firmaId, projeId, baslangic, bitis, lokasyonId, yapan, tanim, durum, gorevTipi])

  async function uygula() {
    if (!firmaId) return
    setLoading(true)
    try {
      const res  = await fetch(`/api/reports/ceklist-rapor?${buildParams()}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.ok) setData(json)
      else { toast({ type: 'error', title: 'Hata', message: json.error ?? 'Veri alınamadı' }); setData(null) }
    } catch {
      toast({ type: 'error', title: 'Bağlantı hatası', message: 'Veriler yüklenemedi' })
    }
    setLoading(false)
  }

  function temizle() {
    const { bas, bit } = son24h()
    setBaslangic(bas); setBitis(bit)
    setLokasyonId(''); setYapan(''); setTanim(''); setDurum('TUMU'); setGorevTipi('hepsi')
    setData(null)
    // Temizle sonrası son 24h'i yeniden yükle
    setLoading(true)
    const p = new URLSearchParams({ firmaId, kaynak: 'hepsi', baslangic: bas, bitis: bit })
    if (projeId) p.set('projeId', projeId)
    fetch(`/api/reports/ceklist-rapor?${p}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(json => { if (json.ok) setData(json) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  async function download(format: 'excel' | 'csv' | 'pdf') {
    if (!firmaId) return
    setDlLoad(format)
    try {
      const p = buildParams(); p.set('format', format)
      const res = await fetch(`/api/reports/ceklist-rapor-export?${p}`)
      if (!res.ok) throw new Error('İndirme başarısız.')
      const blob = await res.blob()
      const a    = document.createElement('a')
      const ext  = format === 'excel' ? 'xlsx' : format
      a.href = URL.createObjectURL(blob)
      a.download = `ceklist-rapor-${new Date().toISOString().slice(0, 10)}.${ext}`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e: any) {
      toast({ type: 'error', title: 'İndirme hatası', message: e.message })
    }
    setDlLoad(null)
  }

  const oz = data?.ozet

  return (
    <div>
      <Topbar title="Çeklist Raporları" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Çeklist Raporları' }]} />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Filtre kartı */}
        <div className="verde-card" style={{ padding: '16px 20px' }}>
          {/* Başlık + indirme butonları */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>QR-SYNC</div>
              <h2 style={{ fontSize: 17, fontWeight: 900, color: C.text, margin: 0 }}>Çeklist Raporları</h2>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => download('excel')} disabled={!data?.rows.length || dlLoad !== null} style={btn('#f0fdf4', C.green, '#d1fae5')}>
                <FileSpreadsheet size={13} style={dlLoad === 'excel' ? spin : {}} /> Excel
              </button>
              <button onClick={() => download('csv')} disabled={!data?.rows.length || dlLoad !== null} style={btn(C.blueLight, C.blue, '#dbeafe')}>
                <Download size={13} style={dlLoad === 'csv' ? spin : {}} /> CSV
              </button>
              <button onClick={() => download('pdf')} disabled={!data?.rows.length || dlLoad !== null} style={btn(C.redLight, C.red, '#fecaca')}>
                <FileText size={13} style={dlLoad === 'pdf' ? spin : {}} /> PDF
              </button>
            </div>
          </div>

          {/* Filtreler */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10 }}>
            {([
              { label: 'Başlangıç',    node: <input type="date" value={baslangic}  onChange={e => setBaslangic(e.target.value)}  style={inp} /> },
              { label: 'Bitiş',        node: <input type="date" value={bitis}      onChange={e => setBitis(e.target.value)}      style={inp} /> },
              { label: 'Lokasyon',     node: (
                <select value={lokasyonId} onChange={e => setLokasyonId(e.target.value)} style={inp}>
                  <option value="">Tümü</option>
                  {(data?.lokasyonlar ?? []).map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              )},
              { label: 'Görev Adı',    node: <input type="text" value={tanim}      onChange={e => setTanim(e.target.value)}      style={inp} placeholder="Ara…" /> },
              { label: 'Tamamlayan',   node: <input type="text" value={yapan}       onChange={e => setYapan(e.target.value)}      style={inp} placeholder="Ara…" /> },
              { label: 'Durum',        node: (
                <select value={durum} onChange={e => setDurum(e.target.value)} style={inp}>
                  <option value="TUMU">Tümü</option>
                  <option value="TAMAMLANDI">Tamamlandı</option>
                  <option value="ZAMANINDA_YAPILAMAYAN">Gecikme ile Tamamlandı</option>
                  <option value="ZAMANI_GECMIS">Zamanı Geçmiş</option>
                  <option value="IPTAL">İptal</option>
                  <option value="SILINDI">Silindi</option>
                  <option value="KAPATILDI">Kapatıldı</option>
                </select>
              )},
              { label: 'Görev Türü',   node: (
                <select value={gorevTipi} onChange={e => setGorevTipi(e.target.value)} style={inp}>
                  <option value="hepsi">Tümü</option>
                  <option value="frekansiyel">Frekansiyel</option>
                  <option value="spesifik">Spesifik</option>
                </select>
              )},
            ] as { label: string; node: React.ReactNode }[]).map(({ label, node }) => (
              <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: C.soft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                {node}
              </label>
            ))}
          </div>

          {/* Temizle / Uygula */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button onClick={temizle} disabled={loading} style={btn(C.grayLight, C.gray, C.border)}>
              Temizle
            </button>
            <button onClick={uygula} disabled={loading || !firmaId} style={btn(C.green, '#fff')}>
              <RefreshCw size={13} style={loading ? spin : {}} />
              {loading ? 'Yükleniyor…' : '▶ Uygula'}
            </button>
          </div>
        </div>

        {/* KPI */}
        {oz && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10 }}>
            <KpiCard label="Toplam Görev"        value={oz.toplam}              color={C.blue}  />
            <KpiCard label="Çeklist Dolduruldu"  value={oz.dolduruldu}          color={C.amber} />
            <KpiCard label="Ort. Başarı"         value={`%${oz.basari}`}        color={oz.basari >= 80 ? C.green : oz.basari >= 50 ? C.amber : C.red} />
          </div>
        )}

        {/* Yükleniyor */}
        {loading && (
          <div className="verde-card" style={{ padding: 48, textAlign: 'center', color: C.soft }}>
            <RefreshCw size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4, ...spin }} />
            <div style={{ fontWeight: 700 }}>Veriler yükleniyor…</div>
          </div>
        )}

        {/* Tablo */}
        {!loading && data && (
          <div className="verde-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Çeklist Sonuçları</span>
              <span style={{ fontSize: 12, color: C.soft }}>
                {data.rows.length} kayıt — satıra tıklayarak maddeleri görüntüleyin
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.green }}>
                    {['', 'Görev', 'Tür', 'Durum', 'Lokasyon', 'Tamamlayan', 'Tamamlanma', 'Çeklist Başarısı'].map((h, i) => (
                      <th key={i} style={{ padding: '9px 10px', color: '#fff', fontWeight: 700, fontSize: 11.5, textAlign: i <= 1 ? 'left' : 'center', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0
                    ? (
                      <tr>
                        <td colSpan={8} style={{ padding: 48, textAlign: 'center', color: C.soft }}>
                          <ClipboardList size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
                          Eşleşen çeklist kaydı bulunamadı.
                        </td>
                      </tr>
                    )
                    : data.rows.map(row => <GorevSatiri key={row.gorev_id} row={row} />)
                  }
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* İlk yükleme henüz olmadı */}
        {!loading && !data && (
          <div className="verde-card" style={{ padding: 48, textAlign: 'center', color: C.soft }}>
            <ClipboardList size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
            <div style={{ fontWeight: 700 }}>Veriler yükleniyor…</div>
          </div>
        )}

      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
