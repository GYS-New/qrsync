'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useToast } from '@/components/ui/ToastProvider'
import { FileDown, Printer, Search } from 'lucide-react'

type Row = {
  lokasyon_id: string
  lokasyon_tanim: string
  ust_tanim: string | null
  grup_adi: string | null
  birim_fiyat: number
  para_birimi: string
  fiyat_turu: 'lokasyon' | 'grup'
  toplam: number
  tamamlanan: number
  gecikmeli: number
  kayip: number
  aktif_gorev: number
  tamamlanan_hakedis: number
  gecikmeli_hakedis: number
  kayip_hakedis: number
  toplam_hakedis: number
}

type Ozet = {
  toplam_hakedis: number
  tamamlanan_hakedis: number
  gecikmeli_hakedis: number
  kayip_hakedis: number
  toplam_gorev: number
}

type Grup = { id: string; ad: string }
type Lokasyon = { id: string; tanim: string; parent_id: string | null }

interface Props {
  firmaId: string
  projeId: string
  base: string
}

function fmt(n: number, pb = 'TRY') {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n) + ' ' + pb
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}
function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default function HakedisRaporClient({ firmaId, projeId, base }: Props) {
  const { toast } = useToast()

  const [baslangic, setBaslangic] = useState(firstOfMonth())
  const [bitis, setBitis]         = useState(todayStr())
  const [grupFilter, setGrupFilter]       = useState('')
  const [lokasyonFilter, setLokasyonFilter] = useState('')

  const [gruplar, setGruplar]       = useState<Grup[]>([])
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>([])

  const [rows, setRows]   = useState<Row[]>([])
  const [ozet, setOzet]   = useState<Ozet | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Merge same-named groups for dropdown
  const mergedGruplar = Array.from(
    gruplar.reduce((acc, g) => { if (!acc.has(g.ad)) acc.set(g.ad, g.id); return acc }, new Map<string, string>())
  ).map(([ad, id]) => ({ id, ad }))

  // Filter lokasyons for dropdown (only parent-level or all)
  const rootLokasyonlar = lokasyonlar.filter(l => !l.parent_id)

  useEffect(() => {
    fetch(`/api/birim-fiyatlar?proje_id=${projeId}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          setGruplar(j.gruplar ?? [])
          setLokasyonlar(j.lokasyonlar ?? [])
        }
      })
  }, [projeId])

  const fetchRapor = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ firma_id: firmaId, proje_id: projeId })
      if (baslangic) params.set('baslangic', baslangic)
      if (bitis)     params.set('bitis', bitis)
      if (grupFilter)    params.set('grup_id', grupFilter)
      if (lokasyonFilter) params.set('lokasyon_id', lokasyonFilter)

      const res = await fetch(`/api/reports/hakedis?${params}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setRows(json.rows ?? [])
      setOzet(json.ozet ?? null)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }, [firmaId, projeId, baslangic, bitis, grupFilter, lokasyonFilter, toast])

  useEffect(() => { fetchRapor() }, [fetchRapor])

  function handleExcel() {
    setExporting(true)
    const params = new URLSearchParams({ firma_id: firmaId, proje_id: projeId })
    if (baslangic) params.set('baslangic', baslangic)
    if (bitis)     params.set('bitis', bitis)
    if (grupFilter)    params.set('grup_id', grupFilter)
    if (lokasyonFilter) params.set('lokasyon_id', lokasyonFilter)
    window.location.href = `/api/reports/hakedis/export?${params}`
    setTimeout(() => setExporting(false), 2000)
  }

  function handlePdf() {
    window.print()
  }

  const paraBirimi = rows[0]?.para_birimi ?? 'TRY'
  const cokluPb = rows.some(r => r.para_birimi !== rows[0]?.para_birimi)

  return (
    <div>
      <Topbar
        title="Hakediş Raporu"
        base={base}
        breadcrumbs={[{ label: 'Raporlar', href: `${base}/dashboard/raporlar` }, { label: 'Hakediş Raporu' }]}
      />

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          .verde-card { box-shadow: none !important; border: 1px solid #ccc !important; }
        }
        .print-only { display: none; }
      `}</style>

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Filtreler */}
        <div className="verde-card no-print" style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#506050' }}>BAŞLANGIÇ</label>
            <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d6e4d6', borderRadius: 6, fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#506050' }}>BİTİŞ</label>
            <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d6e4d6', borderRadius: 6, fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#506050' }}>LOKASYON GRUBU</label>
            <select value={grupFilter} onChange={e => setGrupFilter(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d6e4d6', borderRadius: 6, fontSize: 13, minWidth: 160 }}>
              <option value="">Tümü</option>
              {mergedGruplar.map(g => <option key={g.id} value={g.id}>{g.ad}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#506050' }}>LOKASYON</label>
            <select value={lokasyonFilter} onChange={e => setLokasyonFilter(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d6e4d6', borderRadius: 6, fontSize: 13, minWidth: 160 }}>
              <option value="">Tümü</option>
              {lokasyonlar.map(l => (
                <option key={l.id} value={l.id}>
                  {l.parent_id ? '  └─ ' : ''}{l.tanim}
                </option>
              ))}
            </select>
          </div>
          <button onClick={fetchRapor} disabled={loading}
            style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid #86efac', background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Search size={14} />
            {loading ? 'Yükleniyor…' : 'Filtrele'}
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={handleExcel} disabled={exporting || rows.length === 0}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #93c5fd', background: '#dbeafe', color: '#1d4ed8', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: rows.length === 0 ? 0.5 : 1 }}>
              <FileDown size={14} />
              Excel
            </button>
            <button onClick={handlePdf} disabled={rows.length === 0}
              style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #f9a8d4', background: '#fce7f3', color: '#9d174d', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: rows.length === 0 ? 0.5 : 1 }}>
              <Printer size={14} />
              PDF
            </button>
          </div>
        </div>

        {/* Özet kartları */}
        {ozet && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'Toplam Hakediş', value: ozet.toplam_hakedis, bg: '#f0f9f0', border: '#d6e4d6', color: '#1a5c1a' },
              { label: 'Tamamlanan Hakediş', value: ozet.tamamlanan_hakedis, bg: '#f0fdf4', border: '#86efac', color: '#15803d' },
              { label: 'Gecikmeli Hakediş', value: ozet.gecikmeli_hakedis, bg: '#fff7ed', border: '#fed7aa', color: '#c2410c' },
              { label: 'Kayıp Hakediş', value: ozet.kayip_hakedis, bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
            ].map(card => (
              <div key={card.label} className="verde-card" style={{ padding: '14px 18px', background: card.bg, border: `1px solid ${card.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7a907a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: card.color }}>
                  {cokluPb ? `${card.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : fmt(card.value, paraBirimi)}
                </div>
                {card.label === 'Toplam Hakediş' && (
                  <div style={{ fontSize: 12, color: '#7a907a', marginTop: 4 }}>{ozet.toplam_gorev} görev</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tablo */}
        <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#7a907a', fontSize: 14 }}>Yükleniyor…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#7a907a', fontSize: 14 }}>
              Seçilen tarih aralığında birim fiyatı olan lokasyonlara ait görev bulunamadı.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f0f7f0' }}>
                    {[
                      'Lokasyon', 'Üst Lokasyon', 'Grup', 'Birim Fiyat', 'P.B.',
                      'Toplam', 'Tamamlanan', 'Gecikmeli', 'Kayıp', 'Aktif',
                      'Toplam Hakediş', 'Tamamlanan Hak.', 'Gecikmeli Hak.', 'Kayıp Hak.',
                    ].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#1a3a1a', borderBottom: '2px solid #d6e4d6', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.lokasyon_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafcfa', borderBottom: '1px solid #f0f7f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1a3a1a' }}>{r.lokasyon_tanim}</td>
                      <td style={{ padding: '8px 12px', color: '#506050' }}>{r.ust_tanim ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#506050' }}>{r.grup_adi ?? '—'}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1a3a1a' }}>{r.birim_fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '8px 12px', color: '#506050' }}>{r.para_birimi}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>{r.toplam}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#15803d', fontWeight: 600 }}>{r.tamamlanan}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#c2410c', fontWeight: 600 }}>{r.gecikmeli}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#b91c1c', fontWeight: 600 }}>{r.kayip}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#7a907a' }}>{r.aktif_gorev}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1a3a1a' }}>{r.toplam_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{r.tamamlanan_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#c2410c', fontWeight: 600 }}>{r.gecikmeli_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b91c1c', fontWeight: 600 }}>{r.kayip_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
                {ozet && (
                  <tfoot>
                    <tr style={{ background: '#eaf6ea', borderTop: '2px solid #d6e4d6' }}>
                      <td colSpan={5} style={{ padding: '9px 12px', fontWeight: 800, color: '#1a3a1a', fontSize: 13 }}>TOPLAM</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800 }}>{ozet.toplam_gorev}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#15803d' }}>{rows.reduce((s, r) => s + r.tamamlanan, 0)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#c2410c' }}>{rows.reduce((s, r) => s + r.gecikmeli, 0)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#b91c1c' }}>{rows.reduce((s, r) => s + r.kayip, 0)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#7a907a' }}>{rows.reduce((s, r) => s + r.aktif_gorev, 0)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800 }}>{ozet.toplam_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#15803d' }}>{ozet.tamamlanan_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#c2410c' }}>{ozet.gecikmeli_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: '#b91c1c' }}>{ozet.kayip_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {cokluPb && (
          <div style={{ fontSize: 12, color: '#92400e', background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 6, padding: '8px 12px' }}>
            ⚠️ Birden fazla para birimi tespit edildi. Toplamlar para birimi dönüşümü yapılmadan gösterilmektedir.
          </div>
        )}

      </div>
    </div>
  )
}
