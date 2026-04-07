'use client'

import { useEffect, useMemo, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import { RefreshCw, Star, Pencil, Trash2, RotateCcw, X, Check, Filter, XCircle, FileSpreadsheet, FileText, Download } from 'lucide-react'

interface Kayit {
  id: string
  lokasyon_id: string
  lokasyon_tanim: string
  kanal: 'QR' | 'NFC'
  yildiz: number
  yorum: string | null
  ad_soyad: string | null
  gorsel_url: string | null
  olusturma_tarihi: string
}

interface Props {
  base: string
  isSA: boolean
  initialFirmaId?: string | null
  projeId?: string | null
}

const YILDIZ_ETIKET = ['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel']

const YILDIZ_RENK: Record<number, { bg: string; text: string }> = {
  1: { bg: '#fee2e2', text: '#991b1b' },
  2: { bg: '#fef3c7', text: '#92400e' },
  3: { bg: '#f1f5f9', text: '#475569' },
  4: { bg: '#dcfce7', text: '#166534' },
  5: { bg: '#d1fae5', text: '#065f46' },
}

function YildizStar({ n, dolu }: { n: number; dolu: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" style={{ display: 'inline' }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={dolu ? '#f59e0b' : '#e2e8f0'} stroke={dolu ? '#d97706' : '#cbd5e1'} strokeWidth="1" />
    </svg>
  )
}

function YildizRow({ yildiz }: { yildiz: number }) {
  const { bg, text } = YILDIZ_RENK[yildiz] ?? YILDIZ_RENK[3]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: bg }}>
      {[1,2,3,4,5].map(n => <YildizStar key={n} n={n} dolu={n <= yildiz} />)}
      <span style={{ fontSize: 11.5, fontWeight: 700, color: text, marginLeft: 2 }}>{YILDIZ_ETIKET[yildiz]}</span>
    </span>
  )
}

// ── Onay modalı ───────────────────────────────────────────────────────────────
function OnayModal({ baslik, mesaj, onayMetin, iptalMetin, onayRenk, onOnayla, onIptal, loading }: {
  baslik: string; mesaj: string; onayMetin: string; iptalMetin: string; onayRenk: string
  onOnayla: () => void; onIptal: () => void; loading: boolean
}) {
  return (
    <div onClick={onIptal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', maxWidth: 400, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 8 }}>{baslik}</div>
        <div style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.6, marginBottom: 22 }}>{mesaj}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onIptal} disabled={loading}
            style={{ height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            {iptalMetin}
          </button>
          <button onClick={onOnayla} disabled={loading}
            style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: onayRenk, color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            {loading && <RefreshCw size={13} style={{ animation: 'spin 0.9s linear infinite' }} />}
            {onayMetin}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Düzenle modalı ────────────────────────────────────────────────────────────
function DuzenleModal({ kayit, onKaydet, onIptal }: {
  kayit: Kayit
  onKaydet: (g: { yildiz: number; yorum: string; ad_soyad: string }) => Promise<void>
  onIptal: () => void
}) {
  const [yildiz,  setYildiz]  = useState(kayit.yildiz)
  const [yorum,   setYorum]   = useState(kayit.yorum ?? '')
  const [adSoyad, setAdSoyad] = useState(kayit.ad_soyad ?? '')
  const [loading, setLoading] = useState(false)

  async function kaydet() {
    setLoading(true)
    try { await onKaydet({ yildiz, yorum, ad_soyad: adSoyad }) }
    finally { setLoading(false) }
  }

  const inp: React.CSSProperties = { width: '100%', height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }

  return (
    <div onClick={onIptal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', maxWidth: 480, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Değerlendirmeyi Düzenle</div>
          <button onClick={onIptal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Lokasyon</label>
            <div style={{ fontSize: 13, color: '#475569', background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>{kayit.lokasyon_tanim}</div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Puan</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setYildiz(n)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, transform: n === yildiz ? 'scale(1.2)' : 'scale(1)', transition: 'transform .15s' }}>
                  <svg width="28" height="28" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                      fill={n <= yildiz ? '#f59e0b' : '#e2e8f0'} stroke={n <= yildiz ? '#d97706' : '#cbd5e1'} strokeWidth="1" />
                  </svg>
                </button>
              ))}
              <span style={{ fontSize: 13, color: '#64748b', alignSelf: 'center', marginLeft: 4 }}>{YILDIZ_ETIKET[yildiz]}</span>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Ad Soyad</label>
            <input value={adSoyad} onChange={e => setAdSoyad(e.target.value)} placeholder="İsteğe bağlı" style={inp} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Yorum</label>
            <textarea value={yorum} onChange={e => setYorum(e.target.value)} placeholder="İsteğe bağlı" rows={3}
              style={{ ...inp, height: 'auto', padding: '8px 10px', resize: 'vertical' as const }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button onClick={onIptal} disabled={loading}
            style={{ height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            İptal
          </button>
          <button onClick={kaydet} disabled={loading}
            style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            {loading ? <RefreshCw size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> : <Check size={14} />}
            Kaydet
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function MusteriDegerlendirmeRaporClient({ base, isSA, initialFirmaId, projeId }: Props) {
  const { firmaId: saFirmaId } = useFirma()
  const { aktifProje } = useProje()
  const firmaId = isSA ? saFirmaId : (initialFirmaId ?? null)
  const effectiveProjeId = isSA ? (aktifProje?.id ?? null) : (projeId ?? null)

  const [kayitlar, setKayitlar]         = useState<any[]>([])
  const [loading, setLoading]           = useState(false)
  const [baslangic, setBaslangic]       = useState('')
  const [bitis, setBitis]               = useState('')
  const [filtreYildiz, setFiltreYildiz] = useState(0)
  const [filtreKanal, setFiltreKanal]   = useState<'TUMU' | 'QR' | 'NFC'>('TUMU')
  const [gorselModal, setGorselModal]   = useState<string | null>(null)
  const [hata, setHata]                 = useState<string | null>(null)
  const [filtreMod, setFiltreMod]       = useState(false)
  const [aramaQ, setAramaQ]             = useState('')

  // Yetkiler
  const [yetkiler, setYetkiler] = useState({ duzenleyebilir: false, silebilir: false })

  // Aksiyon state'leri
  const [duzenleKayit,   setDuzenleKayit]   = useState<Kayit | null>(null)
  const [silKayit,       setSilKayit]       = useState<Kayit | null>(null)
  const [arsivleKayit,   setArsivleKayit]   = useState<Kayit | null>(null)
  const [aksiyonLoading, setAksiyonLoading] = useState(false)

  const spinning = { animation: 'spin 0.9s linear infinite' }

  // Varsayılan yükleme: sadece aktif tablo
  async function yukle() {
    if (!firmaId) return
    setLoading(true)
    setHata(null)
    try {
      const p = new URLSearchParams({ firma_id: firmaId })
      if (effectiveProjeId) p.set('proje_id', effectiveProjeId)
      const res  = await fetch(`/api/raporlar/musteri-degerlendirme?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.ok) {
        setKayitlar(json.data)
        if (json.yetkiler) setYetkiler(json.yetkiler)
      } else setHata(json.error ?? 'Yüklenemedi')
    } finally { setLoading(false) }
  }

  // Filtrele: aktif + arşiv birleşik
  async function filtreUygula() {
    if (!firmaId) return
    setLoading(true)
    setHata(null)
    try {
      const p = new URLSearchParams({ firma_id: firmaId, birlesik: 'true' })
      if (effectiveProjeId) p.set('proje_id', effectiveProjeId)
      if (baslangic) p.set('baslangic', baslangic)
      if (bitis)     p.set('bitis', bitis)
      const res  = await fetch(`/api/raporlar/musteri-degerlendirme?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.ok) {
        setKayitlar(json.data); setFiltreMod(true)
        if (json.yetkiler) setYetkiler(json.yetkiler)
      } else setHata(json.error ?? 'Yüklenemedi')
    } finally { setLoading(false) }
  }

  function filtreTemizle() {
    setAramaQ(''); setBaslangic(''); setBitis(''); setFiltreYildiz(0); setFiltreKanal('TUMU')
    setFiltreMod(false)
    yukle()
  }

  useEffect(() => { yukle() }, [firmaId, effectiveProjeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtreliKayitlar = useMemo(() => {
    const s = aramaQ.trim().toLowerCase()
    return kayitlar.filter((k: any) => {
      if (filtreYildiz && k.yildiz !== filtreYildiz) return false
      if (filtreKanal !== 'TUMU' && k.kanal !== filtreKanal) return false
      if (s && ![k.lokasyon_tanim, k.ad_soyad, k.yorum].join(' ').toLowerCase().includes(s)) return false
      return true
    })
  }, [kayitlar, filtreYildiz, filtreKanal, aramaQ])

  const ozet = useMemo(() => {
    if (!filtreliKayitlar.length) return null
    const toplam    = filtreliKayitlar.length
    const ortYildiz = filtreliKayitlar.reduce((s, k) => s + k.yildiz, 0) / toplam
    const dagilim   = [1,2,3,4,5].map(n => ({ yildiz: n, sayi: filtreliKayitlar.filter(k => k.yildiz === n).length }))
    const yorumlu   = filtreliKayitlar.filter(k => k.yorum).length
    const gorsellli = filtreliKayitlar.filter(k => k.gorsel_url).length
    return { toplam, ortYildiz, dagilim, yorumlu, gorsellli }
  }, [filtreliKayitlar])

  // ── Aksiyonlar ────────────────────────────────────────────────────────────
  async function duzenleKaydet(g: { yildiz: number; yorum: string; ad_soyad: string }) {
    if (!duzenleKayit) return
    const res  = await fetch('/api/raporlar/musteri-degerlendirme', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: duzenleKayit.id, ...g }),
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error ?? 'Güncellenemedi')
    setDuzenleKayit(null)
    yenile()
  }

  // Aksiyon sonrası yenile (filtre modundaysa filtreUygula, değilse yukle)
  function yenile() { filtreMod ? filtreUygula() : yukle() }

  async function arsivle(kayit: Kayit) {
    setAksiyonLoading(true)
    try {
      const res  = await fetch('/api/raporlar/musteri-degerlendirme', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: kayit.id, arsivlendi: true }),
      })
      const json = await res.json()
      if (!json.ok) { setHata(json.error ?? 'Arşivlenemedi'); return }
      setArsivleKayit(null)
      yenile()
    } finally { setAksiyonLoading(false) }
  }

  async function sil(kayit: Kayit) {
    setAksiyonLoading(true)
    try {
      const res  = await fetch(`/api/raporlar/musteri-degerlendirme?id=${kayit.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.ok) { setHata(json.error ?? 'Silinemedi'); return }
      setSilKayit(null)
      yenile()
    } finally { setAksiyonLoading(false) }
  }

  const aksBtn = (color: string, bg: string, borderColor: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 34, height: 34, borderRadius: 8, border: `1.5px solid ${borderColor}`,
    cursor: 'pointer', background: bg, color, transition: 'opacity .15s',
  })

  // ── Excel İndir ─────────────────────────────────────────────────────────
  async function excelIndir() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'QR-Sync'
    const ws = wb.addWorksheet('Müşteri Değerlendirmeleri')
    ws.columns = [
      { header: 'Tarih',    key: 'tarih',    width: 20 },
      { header: 'Lokasyon', key: 'lokasyon', width: 28 },
      { header: 'Kanal',    key: 'kanal',    width: 10 },
      { header: 'Puan',     key: 'puan',     width: 8 },
      { header: 'Etiket',   key: 'etiket',   width: 14 },
      { header: 'Yorum',    key: 'yorum',    width: 40 },
      { header: 'Ad Soyad', key: 'ad',       width: 20 },
    ]
    const hr = ws.getRow(1)
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
    hr.height = 22
    filtreliKayitlar.forEach((k: any) => ws.addRow({
      tarih: new Date(k.olusturma_tarihi).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
      lokasyon: k.lokasyon_tanim, kanal: k.kanal, puan: k.yildiz,
      etiket: YILDIZ_ETIKET[k.yildiz], yorum: k.yorum ?? '', ad: k.ad_soyad ?? '',
    }))
    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `musteri-degerlendirme-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click(); URL.revokeObjectURL(a.href)
  }

  // ── PDF (Yazdır) ────────────────────────────────────────────────────────
  function pdfIndir() {
    const rows = filtreliKayitlar.map((k: any) =>
      `<tr>
        <td>${new Date(k.olusturma_tarihi).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}</td>
        <td>${k.lokasyon_tanim}</td>
        <td>${k.kanal}</td>
        <td>${'★'.repeat(k.yildiz)} ${YILDIZ_ETIKET[k.yildiz]}</td>
        <td>${k.yorum ?? '—'}</td>
        <td>${k.ad_soyad ?? '—'}</td>
      </tr>`
    ).join('')

    const ozetHtml = ozet ? `
      <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
        <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px"><strong>${ozet.toplam}</strong> Toplam</div>
        <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px"><strong>${ozet.ortYildiz.toFixed(1)} ★</strong> Ortalama</div>
        <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px"><strong>${ozet.yorumlu}</strong> Yorumlu</div>
        <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px"><strong>${ozet.gorsellli}</strong> Fotoğraflı</div>
      </div>
    ` : ''

    const w = window.open('', '_blank', 'width=1100,height=700')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
      <title>Müşteri Değerlendirmeleri</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;padding:20px;color:#111827}
        h2{color:#1f2937;margin-bottom:8px}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th{background:#1f2937;color:#fff;font-weight:700;padding:7px 10px;text-align:left;font-size:11px}
        td{padding:6px 10px;border:1px solid #e5e7eb;font-size:11px}
        tr:nth-child(even) td{background:#f9fafb}
      </style>
    </head><body>
      <h2>Müşteri Değerlendirmeleri Raporu</h2>
      <div style="font-size:11px;color:#64748b;margin-bottom:12px">${new Date().toLocaleDateString('tr-TR')} — ${filtreliKayitlar.length} kayıt</div>
      ${ozetHtml}
      <table>
        <thead><tr><th>Tarih</th><th>Lokasyon</th><th>Kanal</th><th>Puan</th><th>Yorum</th><th>Ad Soyad</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 400)
  }

  return (
    <div>
      <Topbar title="Müşteri Değerlendirmeleri" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Müşteri Değerlendirmeleri' }]} />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Hata bandı */}
        {hata && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#991b1b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{hata}</span>
            <button onClick={() => setHata(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}><X size={15} /></button>
          </div>
        )}

        {/* Filtreler */}
        <div className="verde-card" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 900, color: '#111827', margin: 0 }}>Müşteri Değerlendirmeleri</h2>
              {filtreMod && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: '#e0f2fe', color: '#0369a1' }}>
                  Filtre Aktif — Tablo + Arşiv
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={excelIndir} disabled={!filtreliKayitlar.length}
                className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40"
                style={{ color: '#1d6f42', fontWeight: 600 }}>
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button onClick={pdfIndir} disabled={!filtreliKayitlar.length}
                className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40"
                style={{ color: '#185a9b', fontWeight: 600 }}>
                <FileText size={14} /> PDF
              </button>
              <button onClick={filtreMod ? filtreTemizle : yukle} disabled={loading || !firmaId}
                style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#1f2937', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
                <RefreshCw size={13} style={loading ? spinning : {}} />
                {loading ? 'Yükleniyor…' : 'Yenile'}
              </button>
            </div>
          </div>

          {/* Filtre satırı */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input placeholder="Lokasyon / yorum / ad ara…" value={aramaQ} onChange={e => setAramaQ(e.target.value)}
              style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', flex: '1 1 180px' }} />
            <select value={filtreYildiz} onChange={e => setFiltreYildiz(Number(e.target.value))}
              style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', minWidth: 140 }}>
              <option value={0}>Puan (Tümü)</option>
              {[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)} — {YILDIZ_ETIKET[n]}</option>)}
            </select>
            <select value={filtreKanal} onChange={e => setFiltreKanal(e.target.value as any)}
              style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', minWidth: 100 }}>
              <option value="TUMU">Kanal (Tümü)</option>
              <option value="QR">QR</option>
              <option value="NFC">NFC</option>
            </select>
            <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
              style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
            <span style={{ color: '#94a3b8' }}>—</span>
            <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
              style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
            <button onClick={filtreUygula} disabled={loading || !firmaId}
              style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={13} /> Filtrele
            </button>
            <button onClick={filtreTemizle}
              style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <XCircle size={13} /> Temizle
            </button>
          </div>
        </div>

        {/* Özet kartları */}
        {ozet && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10 }}>
            {[
              { label: 'Toplam',     val: ozet.toplam,                    color: '#111827' },
              { label: 'Ort. Puan', val: ozet.ortYildiz.toFixed(1) + ' ★', color: '#d97706' },
              { label: 'Yorumlu',   val: ozet.yorumlu,                   color: '#1f2937' },
              { label: 'Fotoğraflı', val: ozet.gorsellli,                color: '#5a46d1' },
            ].map(({ label, val, color }) => (
              <div key={label} className="verde-card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
              </div>
            ))}
            <div className="verde-card" style={{ padding: '12px 16px', gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Puan Dağılımı</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[5,4,3,2,1].map(n => {
                  const sayi  = ozet.dagilim.find(d => d.yildiz === n)?.sayi ?? 0
                  const oran  = ozet.toplam > 0 ? (sayi / ozet.toplam) * 100 : 0
                  const { bg } = YILDIZ_RENK[n]
                  const barColor = bg === '#d1fae5' ? '#10b981' : bg === '#dcfce7' ? '#34d399' : bg === '#fee2e2' ? '#ef4444' : bg === '#fef3c7' ? '#f59e0b' : '#94a3b8'
                  return (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11.5, color: '#64748b', width: 12, flexShrink: 0 }}>{n}</span>
                      <Star size={11} color="#f59e0b" fill="#f59e0b" />
                      <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${oran}%`, background: barColor, borderRadius: 4, transition: 'width .4s ease' }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: '#64748b', width: 20, textAlign: 'right' as const }}>{sayi}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Kayıt sayısı */}
        <div style={{ fontSize: 13, color: '#64748b' }}>
          <strong style={{ color: '#1f2937' }}>{filtreliKayitlar.length}</strong> kayıt
          {filtreMod && <span style={{ marginLeft: 6, fontSize: 11.5, color: '#0369a1' }}>(tablo + arşiv)</span>}
        </div>

        {/* Tablo */}
        <div className="verde-card" style={{ overflow: 'hidden' }}>
          {!firmaId ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>Firma seçin</div>
          ) : loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} style={{ ...spinning, margin: '0 auto 12px', display: 'block', color: '#374151' }} />
              Yükleniyor…
            </div>
          ) : filtreliKayitlar.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
              Henüz değerlendirme yok
            </div>
          ) : (
            <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', overflowX: 'auto' }}>
              <table className="verde-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Lokasyon (Üst &gt; Alt)</th>
                    <th>Kanal</th>
                    <th>Puan</th>
                    <th>Yorum</th>
                    <th>Ad Soyad</th>
                    <th>Fotoğraf</th>
                    {filtreMod && <th>Kaynak</th>}
                    {(yetkiler.duzenleyebilir || yetkiler.silebilir) && <th style={{ textAlign: 'center' }}>İşlemler</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtreliKayitlar.map((k: any) => (
                    <tr key={k.id}>
                      <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }}>
                        {new Date(k.olusturma_tarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ fontWeight: 600, color: '#111827' }}>{k.lokasyon_tanim}</td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11.5, fontWeight: 700, background: k.kanal === 'QR' ? '#e0f2fe' : '#f9fafb', color: k.kanal === 'QR' ? '#0369a1' : '#166534' }}>
                          {k.kanal}
                        </span>
                      </td>
                      <td><YildizRow yildiz={k.yildiz} /></td>
                      <td style={{ maxWidth: 280, color: '#334155' }}>
                        {k.yorum ? (
                          <span title={k.yorum} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                            {k.yorum}
                          </span>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ color: k.ad_soyad ? '#111827' : '#cbd5e1' }}>{k.ad_soyad || '—'}</td>
                      <td>
                        {k.gorsel_url ? (
                          <button onClick={() => setGorselModal(k.gorsel_url!)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            <img src={k.gorsel_url} alt="Görsel" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                          </button>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      {filtreMod && (
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                            background: k.segment === 'arsiv' ? '#fef3c7' : '#e0f2fe',
                            color:      k.segment === 'arsiv' ? '#92400e' : '#0369a1',
                          }}>
                            {k.segment === 'arsiv' ? 'Arşiv' : 'Tablo'}
                          </span>
                        </td>
                      )}
                      {(yetkiler.duzenleyebilir || yetkiler.silebilir) && (
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                          {yetkiler.duzenleyebilir && !k.arsivlendi && (
                            <button onClick={() => setDuzenleKayit(k)} title="Düzenle" style={aksBtn('#1d4ed8', '#eff6ff', '#bfdbfe')}><Pencil size={14} /></button>
                          )}
                          {yetkiler.duzenleyebilir && !k.arsivlendi && (
                            <button onClick={() => setArsivleKayit(k)} title="Arşivle" style={aksBtn('#c2410c', '#fff7ed', '#fed7aa')}><RotateCcw size={14} /></button>
                          )}
                          {yetkiler.silebilir && (
                            <button onClick={() => setSilKayit(k)} title="Kalıcı Sil" style={aksBtn('#dc2626', '#fef2f2', '#fecaca')}><Trash2 size={14} /></button>
                          )}
                        </div>
                      </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modallar */}
      {duzenleKayit && (
        <DuzenleModal kayit={duzenleKayit} onKaydet={duzenleKaydet} onIptal={() => setDuzenleKayit(null)} />
      )}

      {arsivleKayit && (
        <OnayModal
          baslik="Arşivle"
          mesaj={`"${arsivleKayit.lokasyon_tanim}" lokasyonuna ait bu değerlendirme arşive taşınacak. Arşiv sayfasından erişilebilir.`}
          onayMetin="Arşivle" iptalMetin="İptal" onayRenk="#c2410c"
          loading={aksiyonLoading}
          onOnayla={() => arsivle(arsivleKayit)}
          onIptal={() => setArsivleKayit(null)}
        />
      )}

      {silKayit && (
        <OnayModal
          baslik="Kalıcı Sil"
          mesaj={`"${silKayit.lokasyon_tanim}" lokasyonuna ait bu değerlendirme kalıcı olarak silinecek. Bu işlem geri alınamaz.`}
          onayMetin="Evet, Kalıcı Sil" iptalMetin="Vazgeç" onayRenk="#dc2626"
          loading={aksiyonLoading}
          onOnayla={() => sil(silKayit)}
          onIptal={() => setSilKayit(null)}
        />
      )}

      {gorselModal && (
        <div onClick={() => setGorselModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <img src={gorselModal} alt="Büyük görsel"
            style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }} />
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
