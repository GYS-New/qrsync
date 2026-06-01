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
  fiyat_turu: 'lokasyon' | 'grup' | 'yok'
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

type Grup = { id: string; ad: string; ust_lokasyon_id: string | null }
type Lokasyon = { id: string; tanim: string; parent_id: string | null }
type GrupUye = { grup_id: string; lokasyon_id: string }

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
  const [ustLokasyonFilter, setUstLokasyonFilter] = useState('')
  const [grupFilter, setGrupFilter]       = useState('')
  const [lokasyonFilter, setLokasyonFilter] = useState('')

  const [gruplar, setGruplar]       = useState<Grup[]>([])
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>([])
  const [grupUyeleri, setGrupUyeleri] = useState<GrupUye[]>([])

  const [rows, setRows]   = useState<Row[]>([])
  const [ozet, setOzet]   = useState<Ozet | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Üst lokasyonlar (parent_id IS NULL) — dropdown için
  const ustLokasyonlar = lokasyonlar.filter(l => !l.parent_id)

  // Üst seçilirse o üstün descendant'ları (kendisi dahil)
  const ustDescIds = (() => {
    if (!ustLokasyonFilter) return null
    const set = new Set<string>([ustLokasyonFilter])
    let changed = true
    while (changed) {
      changed = false
      for (const l of lokasyonlar) {
        if (!set.has(l.id) && l.parent_id && set.has(l.parent_id)) {
          set.add(l.id); changed = true
        }
      }
    }
    return set
  })()

  // Cascade: üst seçilirse lokasyon ve grup dropdown'ları daralt
  const filteredGruplar = ustLokasyonFilter
    ? gruplar.filter(g => g.ust_lokasyon_id === ustLokasyonFilter)
    : gruplar

  // Seçili grup'ların üye lokasyon ID seti (aynı isimli grupları merge ettiğimiz için
  // dropdown'da gösterilen tek ID ama backend'de farklı grup ID'leri olabilir →
  // merged grubun ID'si seçilince, AYNI ADLI tüm grupların üyelerini birleştir)
  const mergedGruplarList = Array.from(
    filteredGruplar.reduce((acc, g) => { if (!acc.has(g.ad)) acc.set(g.ad, g.id); return acc }, new Map<string, string>())
  ).map(([ad, id]) => ({ id, ad }))

  const grupUyeLokIds = (() => {
    if (!grupFilter) return null
    // Seçili merged grup'un adı
    const seciliGrupAd = mergedGruplarList.find(g => g.id === grupFilter)?.ad
    if (!seciliGrupAd) return new Set<string>()
    // Aynı ada sahip tüm filtreli grup ID'leri
    const ayniAdliGrupIds = new Set(filteredGruplar.filter(g => g.ad === seciliGrupAd).map(g => g.id))
    // Bu grupların üye lokasyon ID'leri
    return new Set(grupUyeleri.filter(u => ayniAdliGrupIds.has(u.grup_id)).map(u => u.lokasyon_id))
  })()

  // Lokasyon dropdown: önce üst, sonra grup ile daralt
  let filteredLokasyonlar = ustDescIds
    ? lokasyonlar.filter(l => ustDescIds.has(l.id))
    : lokasyonlar
  if (grupUyeLokIds) {
    filteredLokasyonlar = filteredLokasyonlar.filter(l => grupUyeLokIds.has(l.id))
  }

  // Üst değişirse alt filter'lar geçersizse otomatik temizle
  useEffect(() => {
    if (!ustLokasyonFilter) return
    if (lokasyonFilter && !ustDescIds?.has(lokasyonFilter)) setLokasyonFilter('')
    if (grupFilter && !filteredGruplar.some(g => g.id === grupFilter)) setGrupFilter('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ustLokasyonFilter])

  // Grup değişirse mevcut lokasyon seçimi grup üyesi değilse temizle
  useEffect(() => {
    if (!grupFilter || !lokasyonFilter) return
    if (grupUyeLokIds && !grupUyeLokIds.has(lokasyonFilter)) setLokasyonFilter('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grupFilter])

  useEffect(() => {
    fetch(`/api/birim-fiyatlar?proje_id=${projeId}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          setGruplar(j.gruplar ?? [])
          setLokasyonlar(j.lokasyonlar ?? [])
          setGrupUyeleri(j.grup_uyeleri ?? [])
        }
      })
  }, [projeId])

  const fetchRapor = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ firma_id: firmaId, proje_id: projeId })
      if (baslangic) params.set('baslangic', baslangic)
      if (bitis)     params.set('bitis', bitis)
      if (ustLokasyonFilter) params.set('ust_lokasyon_id', ustLokasyonFilter)
      if (grupFilter)        params.set('grup_id', grupFilter)
      if (lokasyonFilter)    params.set('lokasyon_id', lokasyonFilter)

      const res = await fetch(`/api/reports/hakedis?${params}`)
      const text = await res.text()
      let json: any
      try { json = JSON.parse(text) } catch {
        throw new Error(`Sunucu yanıtı geçersiz (HTTP ${res.status}). Lütfen tekrar deneyin.`)
      }
      if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setRows(json.rows ?? [])
      setOzet(json.ozet ?? null)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }, [firmaId, projeId, baslangic, bitis, ustLokasyonFilter, grupFilter, lokasyonFilter, toast])

  useEffect(() => { fetchRapor() }, [fetchRapor])

  function handleExcel() {
    setExporting(true)
    const params = new URLSearchParams({ firma_id: firmaId, proje_id: projeId })
    if (baslangic) params.set('baslangic', baslangic)
    if (bitis)     params.set('bitis', bitis)
    if (ustLokasyonFilter) params.set('ust_lokasyon_id', ustLokasyonFilter)
    if (grupFilter)        params.set('grup_id', grupFilter)
    if (lokasyonFilter)    params.set('lokasyon_id', lokasyonFilter)
    window.location.href = `/api/reports/hakedis/export?${params}`
    setTimeout(() => setExporting(false), 2000)
  }

  function handlePdf() {
    const el = document.getElementById('hakedis-print-table')
    if (!el) return
    const pw = window.open('', '_blank', 'width=1200,height=800')
    if (!pw) return
    pw.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Hakediş Raporu</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#111}
      h2{font-size:14px;margin:0 0 4px}
      .sub{font-size:10px;color:#666;margin-bottom:14px}
      table{width:100%;border-collapse:collapse}
      th{background:#e8f5e8;padding:7px 8px;text-align:left;border:1px solid #b0ccb0;font-size:10px;font-weight:bold}
      td{padding:5px 8px;border:1px solid #e0ece0;font-size:11px}
      tr:nth-child(even) td{background:#f8fcf8}
      .total td{background:#dff0df;font-weight:bold;border-top:2px solid #90c090}
      .num{text-align:right} .ctr{text-align:center}
      @media print{@page{size:A4 landscape;margin:10mm}}
    </style></head><body>
      <h2>HAKEDİŞ RAPORU</h2>
      <div class="sub">Tarih: ${baslangic ?? '—'} — ${bitis ?? '—'}</div>
      ${el.outerHTML}
    </body></html>`)
    pw.document.close()
    pw.focus()
    setTimeout(() => { pw.print() }, 400)
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

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Filtreler */}
        <div className="verde-card" style={{ padding: '14px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#4b5563' }}>BAŞLANGIÇ</label>
            <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#4b5563' }}>BİTİŞ</label>
            <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#4b5563' }}>ÜST LOKASYON</label>
            <select value={ustLokasyonFilter} onChange={e => setUstLokasyonFilter(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, minWidth: 160 }}>
              <option value="">Tümü</option>
              {ustLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#4b5563' }}>LOKASYON GRUBU</label>
            <select value={grupFilter} onChange={e => setGrupFilter(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, minWidth: 160 }}>
              <option value="">Tümü</option>
              {mergedGruplarList.map(g => <option key={g.id} value={g.id}>{g.ad}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#4b5563' }}>LOKASYON</label>
            <select value={lokasyonFilter} onChange={e => setLokasyonFilter(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13, minWidth: 160 }}>
              <option value="">Tümü</option>
              {filteredLokasyonlar.map(l => (
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
              { label: 'Toplam Hakediş', value: ozet.toplam_hakedis, bg: '#f9fafb', border: '#e5e7eb', color: '#1a5c1a' },
              { label: 'Tamamlanan Hakediş', value: ozet.tamamlanan_hakedis, bg: '#f9fafb', border: '#86efac', color: '#15803d' },
              { label: 'Gecikmeli Hakediş', value: ozet.gecikmeli_hakedis, bg: '#f9fafb', border: '#fed7aa', color: '#c2410c' },
              { label: 'Kayıp Hakediş', value: ozet.kayip_hakedis, bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' },
            ].map(card => (
              <div key={card.label} className="verde-card" style={{ padding: '14px 18px', background: card.bg, border: `1px solid ${card.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: card.color }}>
                  {cokluPb ? `${card.value.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : fmt(card.value, paraBirimi)}
                </div>
                {card.label === 'Toplam Hakediş' && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{ozet.toplam_gorev} görev</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tablo */}
        <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Yükleniyor…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
              Seçilen tarih aralığında görev bulunamadı.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table id="hakedis-print-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f0f7f0' }}>
                    {[
                      'Lokasyon', 'Üst Lokasyon', 'Grup', 'Birim Fiyat', 'P.B.',
                      'Toplam', 'Tamamlanan', 'Gecikmeli', 'Kayıp', 'Aktif',
                      'Toplam Hakediş', 'Tamamlanan Hak.', 'Gecikmeli Hak.', 'Kayıp Hak.',
                    ].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#1a3a1a', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', fontSize: 12 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.lokasyon_id} style={{ background: i % 2 === 0 ? '#fff' : '#fafcfa', borderBottom: '1px solid #f0f7f0' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1a3a1a' }}>{r.lokasyon_tanim}</td>
                      <td style={{ padding: '8px 12px', color: '#4b5563' }}>{r.ust_tanim ?? '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#4b5563' }}>{r.grup_adi ?? '—'}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: r.fiyat_turu === 'yok' ? '#92400e' : '#1a3a1a' }}>
                        {r.birim_fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        {r.fiyat_turu === 'yok' && (
                          <span title="Bu lokasyon için birim fiyat tanımlı değil — 0 TL üzerinden hesaplanıyor"
                            style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e', fontWeight: 700, verticalAlign: 'middle' }}>
                            FİYAT YOK
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#4b5563' }}>{r.para_birimi}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>{r.toplam}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#15803d', fontWeight: 600 }}>{r.tamamlanan}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#c2410c', fontWeight: 600 }}>{r.gecikmeli}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#b91c1c', fontWeight: 600 }}>{r.kayip}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#6b7280' }}>{r.aktif_gorev}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1a3a1a' }}>{r.toplam_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#15803d', fontWeight: 600 }}>{r.tamamlanan_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#c2410c', fontWeight: 600 }}>{r.gecikmeli_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: '#b91c1c', fontWeight: 600 }}>{r.kayip_hakedis.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
                {ozet && (
                  <tfoot>
                    <tr style={{ background: '#f3f4f6', borderTop: '2px solid #e5e7eb' }}>
                      <td colSpan={5} style={{ padding: '9px 12px', fontWeight: 800, color: '#1a3a1a', fontSize: 13 }}>TOPLAM</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800 }}>{ozet.toplam_gorev}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#15803d' }}>{rows.reduce((s, r) => s + r.tamamlanan, 0)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#c2410c' }}>{rows.reduce((s, r) => s + r.gecikmeli, 0)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#b91c1c' }}>{rows.reduce((s, r) => s + r.kayip, 0)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#6b7280' }}>{rows.reduce((s, r) => s + r.aktif_gorev, 0)}</td>
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
