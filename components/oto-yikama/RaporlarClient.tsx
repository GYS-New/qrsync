'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { Loader2, RefreshCw, Calendar, Filter, X, FileSpreadsheet, FileText } from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, LineChart, Line,
} from 'recharts'

type Row = {
  gorev_id: string
  plaka: string
  marka: string | null
  model: string | null
  departman: string | null
  arac_sahibi: string | null
  personel: string
  personel_id: string | null
  lokasyon: string
  lokasyon_id: string | null
  ust_lokasyon: string | null
  hedef_tarih: string
  baslatilma_tarihi: string | null
  tamamlanma_tarihi: string | null
  tamamlanma_suresi_saniye: number
  ekstra: boolean
}

type Agg = {
  toplam: number
  planli: number
  ekstra: number
  personel_sayisi: number
  plaka_sayisi: number
  toplam_sure_saniye: number
  ortalama_sure_saniye: number
  gunluk_trend: { tarih: string; planli: number; ekstra: number; toplam: number }[]
  personel_top: { personel_id: string; personel: string; adet: number }[]
  plaka_top: { plaka: string; adet: number }[]
  lokasyon_dagilim: { lokasyon: string; adet: number }[]
}

type FilterMeta = {
  personeller: { id: string; ad: string }[]
  plakalar: string[]
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  purple: '#7c3aed',
  grayLight: '#f8fafc',
}

const RENKLER = ['#3b82f6', '#16a34a', '#eab308', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#0d9488']

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}
function fmtTarih(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtSure(saniye: number | null | undefined): string {
  if (!saniye || saniye <= 0) return '—'
  const h = Math.floor(saniye / 3600)
  const m = Math.floor((saniye % 3600) / 60)
  if (h > 0) return `${h}sa ${m}dk`
  if (m > 0) return `${m}dk`
  return `${saniye}sn`
}
function dateMinus(d: number): string {
  const ms = Date.now() - d * 24 * 3600 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

export default function RaporlarClient() {
  const { firmaId } = useFirma()
  const { toast } = useToast()
  const [data, setData] = useState<Row[]>([])
  const [agg, setAgg] = useState<Agg | null>(null)
  const [filterMeta, setFilterMeta] = useState<FilterMeta>({ personeller: [], plakalar: [] })
  const [loading, setLoading] = useState(false)

  const [baslangic, setBaslangic] = useState<string>(dateMinus(7))
  const [bitis, setBitis] = useState<string>(today())
  const [personelId, setPersonelId] = useState<string>('')
  const [plaka, setPlaka] = useState<string>('')
  const [tip, setTip] = useState<'' | 'planli' | 'ekstra'>('')
  const [arama, setArama] = useState('')
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null)
  const printRef = useRef<HTMLDivElement | null>(null)

  async function yukle() {
    if (!firmaId) return
    setLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId, baslangic, bitis })
      if (personelId) p.set('personel_id', personelId)
      if (plaka) p.set('plaka', plaka)
      if (tip) p.set('tip', tip)
      const res = await fetch(`/api/oto-yikama/raporlar?${p}`, { cache: 'no-store' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Veri alınamadı')
      setData(j.data ?? [])
      setAgg(j.agg ?? null)
      setFilterMeta(j.filter_meta ?? { personeller: [], plakalar: [] })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setLoading(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { yukle() }, [firmaId, baslangic, bitis, personelId, plaka, tip])

  const aramaList = useMemo(() => {
    if (!arama.trim()) return data
    const q = arama.trim().toLowerCase()
    return data.filter(r =>
      r.plaka.toLowerCase().includes(q) ||
      r.personel.toLowerCase().includes(q) ||
      r.lokasyon.toLowerCase().includes(q) ||
      (r.departman ?? '').toLowerCase().includes(q),
    )
  }, [data, arama])

  function hizliTarih(gun: number) {
    setBaslangic(dateMinus(gun - 1))
    setBitis(today())
  }

  function temizle() {
    setPersonelId('')
    setPlaka('')
    setTip('')
    setArama('')
  }

  function buildQuery(): string {
    const p = new URLSearchParams({ firma_id: firmaId ?? '', baslangic, bitis })
    if (personelId) p.set('personel_id', personelId)
    if (plaka) p.set('plaka', plaka)
    if (tip) p.set('tip', tip)
    return p.toString()
  }

  async function excelIndir() {
    if (!firmaId) return
    setExporting('excel')
    try {
      const res = await fetch(`/api/oto-yikama/raporlar/excel?${buildQuery()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Excel oluşturulamadı')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `oto-yikama-raporu-${baslangic}_${bitis}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setExporting(null)
    }
  }

  async function pdfIndir() {
    if (!printRef.current) return
    setExporting('pdf')
    const header = printRef.current.querySelector<HTMLElement>('.pdf-only')
    if (header) header.style.display = 'block'
    try {
      const mod: any = await import('html2pdf.js')
      const html2pdf = mod.default || mod
      await html2pdf().set({
        margin: [10, 8, 12, 8],
        filename: `oto-yikama-raporu-${baslangic}_${bitis}.pdf`,
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#f8fafc' },
        jsPDF: { orientation: 'landscape', unit: 'mm', format: 'a4' },
        pagebreak: { mode: ['css', 'legacy'] },
      }).from(printRef.current).save()
    } catch (e: any) {
      toast({ type: 'error', title: 'PDF hatası', message: e?.message ?? 'Bilinmeyen hata' })
    } finally {
      if (header) header.style.display = 'none'
      setExporting(null)
    }
  }

  if (!firmaId) {
    return (
      <div style={{ padding: 24 }}>
        <div className="verde-card" style={{ padding: 32, textAlign: 'center', color: T.textSoft }}>
          Önce üst bardan bir firma seçin.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* FİLTRE BARI */}
      <div className="verde-card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Calendar size={14} color={T.textSoft} />
          <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
            style={inp} max={bitis} />
          <span style={{ color: T.textSoft, fontSize: 12 }}>→</span>
          <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
            style={inp} min={baslangic} max={today()} />
          <div style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
            {[
              { l: 'Bugün', g: 1 },
              { l: '7 gün', g: 7 },
              { l: '30 gün', g: 30 },
              { l: '90 gün', g: 90 },
            ].map(b => (
              <button key={b.l} onClick={() => hizliTarih(b.g)} style={chip}>{b.l}</button>
            ))}
          </div>

          <span style={{ width: 1, height: 22, background: T.border, marginInline: 6 }} />

          <select value={personelId} onChange={e => setPersonelId(e.target.value)} style={inp}>
            <option value="">Personel (Tümü)</option>
            {filterMeta.personeller.map(p => (
              <option key={p.id} value={p.id}>{p.ad}</option>
            ))}
          </select>
          <select value={plaka} onChange={e => setPlaka(e.target.value)} style={inp}>
            <option value="">Plaka (Tümü)</option>
            {filterMeta.plakalar.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select value={tip} onChange={e => setTip(e.target.value as any)} style={inp}>
            <option value="">Tip (Tümü)</option>
            <option value="planli">Planlı</option>
            <option value="ekstra">Ekstra</option>
          </select>
          <input placeholder="Tablo ara..." value={arama} onChange={e => setArama(e.target.value)}
            style={{ ...inp, width: 160 }} />

          <button onClick={temizle} style={{ ...chip, color: T.red }}>
            <X size={11} style={{ marginRight: 4 }} /> Temizle
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={excelIndir} disabled={exporting !== null || loading || (agg?.toplam ?? 0) === 0}
              style={{ ...chip, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', borderColor: '#bbf7d0', color: '#166534' }}>
              <FileSpreadsheet size={12} />
              {exporting === 'excel' ? 'Hazırlanıyor…' : 'Excel'}
            </button>
            <button onClick={pdfIndir} disabled={exporting !== null || loading || (agg?.toplam ?? 0) === 0}
              style={{ ...chip, display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fee2e2', borderColor: '#fecaca', color: '#991b1b' }}>
              <FileText size={12} />
              {exporting === 'pdf' ? 'Hazırlanıyor…' : 'PDF'}
            </button>
            <button onClick={yukle} disabled={loading}
              style={{ ...chip, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={11} style={{ animation: loading ? 'spin 0.9s linear infinite' : undefined }} />
              Yenile
            </button>
          </div>
        </div>
      </div>

      <div ref={printRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* PDF başlığı — yalnız print için */}
      <div className="pdf-only" style={{ display: 'none', padding: '0 4px' }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>🚗 Oto Yıkama Raporu</div>
        <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
          Dönem: <strong>{baslangic}</strong> → <strong>{bitis}</strong>
          {personelId && (() => {
            const p = filterMeta.personeller.find(x => x.id === personelId)
            return p ? <> · Personel: <strong>{p.ad}</strong></> : null
          })()}
          {plaka && <> · Plaka: <strong>{plaka}</strong></>}
          {tip && <> · Tip: <strong>{tip === 'ekstra' ? 'Ekstra' : 'Planlı'}</strong></>}
        </div>
      </div>

      {/* KPI KARTLARI */}
      {agg && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <Kpi label="Toplam Yıkama" deger={agg.toplam} renk={T.blue} />
          <Kpi label="Planlı" deger={agg.planli} renk={T.green} />
          <Kpi label="Ekstra" deger={agg.ekstra} renk={T.amber} />
          <Kpi label="Farklı Plaka" deger={agg.plaka_sayisi} renk={T.purple} />
          <Kpi label="Personel" deger={agg.personel_sayisi} renk={T.text} />
          <Kpi label="Toplam Süre" deger={fmtSure(agg.toplam_sure_saniye)} renk={T.text} kucuk />
          <Kpi label="Ortalama Süre" deger={fmtSure(agg.ortalama_sure_saniye)} renk={T.text} kucuk />
        </div>
      )}

      {loading && data.length === 0 ? (
        <div className="verde-card" style={{ padding: 60, textAlign: 'center', color: T.textSoft }}>
          <Loader2 size={26} style={{ animation: 'spin 0.9s linear infinite' }} />
          <div style={{ marginTop: 8 }}>Yükleniyor…</div>
        </div>
      ) : !agg || agg.toplam === 0 ? (
        <div className="verde-card" style={{ padding: 60, textAlign: 'center', color: T.textSoft }}>
          Bu kriterlere uygun yıkama kaydı yok.
        </div>
      ) : (
        <>
          {/* GRAFİKLER GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Günlük trend */}
            <div className="verde-card" style={{ padding: 12, gridColumn: '1 / -1' }}>
              <Baslik>Günlük Yıkama Trendi</Baslik>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agg.gunluk_trend} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tarih" tick={{ fontSize: 11 }}
                      tickFormatter={t => t.slice(5)} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="planli" stackId="a" name="Planlı" fill={T.green} />
                    <Bar dataKey="ekstra" stackId="a" name="Ekstra" fill={T.amber} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Personel top */}
            <div className="verde-card" style={{ padding: 12 }}>
              <Baslik>Personel Bazlı Yıkama (Top 10)</Baslik>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agg.personel_top} layout="vertical" margin={{ top: 4, right: 18, left: 80, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="personel" tick={{ fontSize: 11 }} width={80}
                      tickFormatter={t => t.length > 14 ? `${t.slice(0, 14)}…` : t} />
                    <Tooltip />
                    <Bar dataKey="adet" fill={T.blue} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Plaka top */}
            <div className="verde-card" style={{ padding: 12 }}>
              <Baslik>Plaka Bazlı Yıkama (Top 10)</Baslik>
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agg.plaka_top} layout="vertical" margin={{ top: 4, right: 18, left: 80, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="plaka" tick={{ fontSize: 11, fontFamily: 'monospace' }} width={80} />
                    <Tooltip />
                    <Bar dataKey="adet" fill={T.purple} radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Planlı vs Ekstra */}
            <div className="verde-card" style={{ padding: 12 }}>
              <Baslik>Planlı / Ekstra Dağılımı</Baslik>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Pie data={[
                      { name: 'Planlı', value: agg.planli },
                      { name: 'Ekstra', value: agg.ekstra },
                    ]} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}
                      label={(e: any) => `${e.name} (${e.value})`}>
                      <Cell fill={T.green} />
                      <Cell fill={T.amber} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* İstasyon dağılımı */}
            <div className="verde-card" style={{ padding: 12 }}>
              <Baslik>İstasyon Dağılımı</Baslik>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Pie data={agg.lokasyon_dagilim} dataKey="adet" nameKey="lokasyon"
                      innerRadius={45} outerRadius={80} paddingAngle={2}
                      label={(e: any) => `${e.adet}`}>
                      {agg.lokasyon_dagilim.map((_, i) => (
                        <Cell key={i} fill={RENKLER[i % RENKLER.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* DETAY TABLO */}
          <div className="verde-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Filter size={14} color={T.textSoft} />
              <strong style={{ fontSize: 13 }}>Detay Liste</strong>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: T.textSoft }}>
                {aramaList.length} kayıt {arama && `(${data.length} arasından)`}
              </span>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
              <table className="verde-table" style={{ minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th style={{ width: 110 }}>Plaka</th>
                    <th style={{ width: 90 }}>Tip</th>
                    <th>Personel</th>
                    <th>İstasyon</th>
                    <th>Departman</th>
                    <th style={{ width: 100 }}>Tarih</th>
                    <th style={{ width: 90 }}>Başlatma</th>
                    <th style={{ width: 90 }}>Tamamlama</th>
                    <th style={{ width: 90 }}>Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {aramaList.map((r, i) => (
                    <tr key={r.gorev_id}>
                      <td style={{ fontSize: 13, color: T.textSoft }}>{i + 1}</td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {r.plaka}
                          {r.marka && <span style={{ fontSize: 12, color: T.textSoft, fontWeight: 400 }}>({r.marka})</span>}
                        </span>
                      </td>
                      <td>
                        {r.ekstra ? (
                          <span style={{ padding: '3px 9px', borderRadius: 999, background: T.amberLight, color: T.amber, fontSize: 12, fontWeight: 700 }}>Ekstra</span>
                        ) : (
                          <span style={{ padding: '3px 9px', borderRadius: 999, background: T.greenLight, color: T.green, fontSize: 12, fontWeight: 700 }}>Planlı</span>
                        )}
                      </td>
                      <td style={{ fontSize: 14, color: T.text }}>{r.personel}</td>
                      <td style={{ fontSize: 14, color: T.textSoft }}>{r.lokasyon}</td>
                      <td style={{ fontSize: 14, color: T.textSoft }}>{r.departman ?? '—'}</td>
                      <td style={{ fontSize: 13, color: T.textSoft }}>{fmtTarih(r.tamamlanma_tarihi ?? r.hedef_tarih)}</td>
                      <td style={{ fontSize: 15, color: T.textSoft, fontFamily: 'monospace' }}>{fmtTime(r.baslatilma_tarihi)}</td>
                      <td style={{ fontSize: 15, color: T.textSoft, fontFamily: 'monospace' }}>{fmtTime(r.tamamlanma_tarihi)}</td>
                      <td style={{ fontSize: 15, color: T.text, fontFamily: 'monospace', fontWeight: 700 }}>{fmtSure(r.tamamlanma_suresi_saniye)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      </div>{/* printRef close */}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        /* html2pdf çalışırken pdf-only blok görünür olsun (capture sırasında) */
        .pdf-only { display: none; }
      `}</style>
    </div>
  )
}

function Kpi({ label, deger, renk, kucuk }: { label: string; deger: any; renk: string; kucuk?: boolean }) {
  return (
    <div className="verde-card" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: kucuk ? 16 : 22, fontWeight: 900, color: renk }}>{deger}</div>
    </div>
  )
}

function Baslik({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`,
  background: '#fff', fontSize: 12, color: T.text,
}

const chip: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.border}`,
  background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: T.text,
}
