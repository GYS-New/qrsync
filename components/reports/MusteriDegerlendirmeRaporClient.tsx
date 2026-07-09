'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import { RefreshCw, Star, Pencil, Trash2, RotateCcw, X, Check, Filter, XCircle, FileSpreadsheet, FileText, Download } from 'lucide-react'

interface Aksiyon {
  aksiyon_metni: string
  gorsel_urls: string[]
  olusturan_id?: string | null
  olusturan_isim?: string | null
  olusturma_tarihi?: string
  guncelleme_tarihi?: string | null
}

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
  aksiyon?: Aksiyon | null
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

  // Müşteri değerlendirmesi aksiyon paneli state'leri
  const [acikAksiyonId, setAcikAksiyonId] = useState<string | null>(null) // expand edilen kayıt id
  const [aksiyonMetinDraft, setAksiyonMetinDraft] = useState('')
  const [aksiyonGorseller, setAksiyonGorseller] = useState<string[]>([])
  const [aksiyonSaving, setAksiyonSaving] = useState(false)
  const [aksiyonGorselYukleniyor, setAksiyonGorselYukleniyor] = useState(false)
  const [aksiyonDuzenleMod, setAksiyonDuzenleMod] = useState(false) // false = read-only görünüm, true = edit

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
    setAramaQ(''); setBaslangic(''); setBitis(''); setFiltreYildiz(0)
    setFiltreMod(false)
    yukle()
  }

  useEffect(() => { yukle() }, [firmaId, effectiveProjeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtreliKayitlar = useMemo(() => {
    const s = aramaQ.trim().toLowerCase()
    return kayitlar.filter((k: any) => {
      if (filtreYildiz && k.yildiz !== filtreYildiz) return false
      if (s && ![k.lokasyon_tanim, k.ad_soyad, k.yorum].join(' ').toLowerCase().includes(s)) return false
      return true
    })
  }, [kayitlar, filtreYildiz, aramaQ])

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

  // ── Aksiyon panel handlerlar ────────────────────────────────────────────────
  function aksiyonPaneliAc(kayit: Kayit) {
    if (acikAksiyonId === kayit.id) {
      // Açıksa kapat
      setAcikAksiyonId(null)
      setAksiyonMetinDraft('')
      setAksiyonGorseller([])
      setAksiyonDuzenleMod(false)
      return
    }
    setAcikAksiyonId(kayit.id)
    setAksiyonMetinDraft(kayit.aksiyon?.aksiyon_metni ?? '')
    setAksiyonGorseller(kayit.aksiyon?.gorsel_urls ?? [])
    setAksiyonDuzenleMod(!kayit.aksiyon)  // aksiyon yoksa direkt edit modu
  }

  async function aksiyonGorselYukle(file: File) {
    setAksiyonGorselYukleniyor(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/raporlar/musteri-degerlendirme/aksiyon/gorsel-yukle', { method: 'POST', body: fd })
      const j = await res.json()
      if (!j.ok) { setHata(j.error ?? 'Görsel yüklenemedi'); return }
      setAksiyonGorseller(prev => [...prev, j.url])
    } finally { setAksiyonGorselYukleniyor(false) }
  }

  async function aksiyonKaydet() {
    if (!acikAksiyonId) return
    if (!aksiyonMetinDraft.trim() || aksiyonMetinDraft.trim().length < 3) {
      setHata('Aksiyon metni en az 3 karakter olmalı')
      return
    }
    setAksiyonSaving(true)
    setHata(null)
    try {
      const res = await fetch('/api/raporlar/musteri-degerlendirme/aksiyon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          degerlendirmeId: acikAksiyonId,
          aksiyon_metni: aksiyonMetinDraft.trim(),
          gorsel_urls: aksiyonGorseller,
        }),
      })
      const j = await res.json()
      if (!j.ok) { setHata(j.error ?? 'Kaydedilemedi'); return }
      // Kayıt başarılı — local state'i güncelle, paneli kapat
      setKayitlar(prev => prev.map(k => k.id === acikAksiyonId
        ? { ...k, aksiyon: {
            aksiyon_metni: aksiyonMetinDraft.trim(),
            gorsel_urls: aksiyonGorseller,
            ...(j.aksiyon ?? {}),
          } as Aksiyon }
        : k))
      setAcikAksiyonId(null)
      setAksiyonMetinDraft('')
      setAksiyonGorseller([])
      setAksiyonDuzenleMod(false)
    } finally { setAksiyonSaving(false) }
  }

  async function aksiyonSil() {
    if (!acikAksiyonId) return
    if (!confirm('Bu aksiyon kaydı silinsin mi?')) return
    setAksiyonSaving(true)
    try {
      const res = await fetch('/api/raporlar/musteri-degerlendirme/aksiyon', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ degerlendirmeId: acikAksiyonId }),
      })
      const j = await res.json()
      if (!j.ok) { setHata(j.error ?? 'Silinemedi'); return }
      setKayitlar(prev => prev.map(k => k.id === acikAksiyonId ? { ...k, aksiyon: null } : k))
      setAcikAksiyonId(null)
      setAksiyonMetinDraft('')
      setAksiyonGorseller([])
      setAksiyonDuzenleMod(false)
    } finally { setAksiyonSaving(false) }
  }

  // ── Excel İndir ─────────────────────────────────────────────────────────
  async function excelIndir() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'İOGYS'
    const ws = wb.addWorksheet('Müşteri Değerlendirmeleri')
    ws.columns = [
      { header: 'Tarih',                  key: 'tarih',           width: 20 },
      { header: 'Lokasyon',               key: 'lokasyon',        width: 28 },
      { header: 'Puan',                   key: 'puan',            width: 8 },
      { header: 'Etiket',                 key: 'etiket',          width: 14 },
      { header: 'Yorum',                  key: 'yorum',           width: 50 },
      { header: 'Ad Soyad',               key: 'ad',              width: 20 },
      { header: 'Değerlendirme Görseli',  key: 'gorsel',          width: 40 },
      { header: 'Aksiyon',                key: 'aksiyon',         width: 50 },
      { header: 'Aksiyon Görselleri',     key: 'aksiyonGorseller', width: 40 },
    ]
    const hr = ws.getRow(1)
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
    hr.height = 22
    filtreliKayitlar.forEach((k: any) => {
      const aksiyonGorseller: string[] = (k.aksiyon?.gorsel_urls ?? []).filter(Boolean)
      const row = ws.addRow({
        tarih: new Date(k.olusturma_tarihi).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }),
        lokasyon: k.lokasyon_tanim,
        puan: k.yildiz,
        etiket: YILDIZ_ETIKET[k.yildiz],
        yorum: k.yorum ?? '',
        ad: k.ad_soyad ?? '',
        gorsel: k.gorsel_url ?? '',
        aksiyon: k.aksiyon?.aksiyon_metni ?? '',
        aksiyonGorseller: aksiyonGorseller.join('\n'),
      })
      // Degerlendirme gorseli — hyperlink (tiklanabilir mavi link)
      if (k.gorsel_url) {
        const cell = row.getCell('gorsel')
        cell.value = { text: 'Görseli Aç', hyperlink: k.gorsel_url } as any
        cell.font = { color: { argb: 'FF1D4ED8' }, underline: true }
      }
      // Aksiyon gorselleri — birden fazla olabilir, her satirda 'Görsel N' link
      if (aksiyonGorseller.length > 0) {
        const cell = row.getCell('aksiyonGorseller')
        // Tek görsel varsa hyperlink; birden fazla varsa metin olarak URL'ler
        if (aksiyonGorseller.length === 1) {
          cell.value = { text: 'Görseli Aç', hyperlink: aksiyonGorseller[0] } as any
          cell.font = { color: { argb: 'FF1D4ED8' }, underline: true }
        } else {
          cell.value = aksiyonGorseller.join('\n')
          cell.alignment = { wrapText: true, vertical: 'top' }
        }
      }
      // Uzun metin hucreleri icin wrap
      row.getCell('yorum').alignment = { wrapText: true, vertical: 'top' }
      row.getCell('aksiyon').alignment = { wrapText: true, vertical: 'top' }
    })
    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `musteri-degerlendirme-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click(); URL.revokeObjectURL(a.href)
  }

  // ── PDF (Yazdır) ────────────────────────────────────────────────────────
  function pdfIndir() {
    // XSS koruması — HTML enjeksiyonu önle
    const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, ch => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!
    ))
    const linkHtml = (url: string, label: string) =>
      `<a href="${esc(url)}" target="_blank" style="color:#1d4ed8;text-decoration:underline">${esc(label)}</a>`
    const rows = filtreliKayitlar.map((k: any) => {
      const aksiyonGorseller: string[] = (k.aksiyon?.gorsel_urls ?? []).filter(Boolean)
      const gorselCell = k.gorsel_url ? linkHtml(k.gorsel_url, 'Görseli Aç') : '—'
      const aksiyonMetni = k.aksiyon?.aksiyon_metni ? esc(k.aksiyon.aksiyon_metni) : '—'
      const aksiyonGorselCell = aksiyonGorseller.length === 0
        ? '—'
        : aksiyonGorseller.map((u, i) => linkHtml(u, `Görsel ${i + 1}`)).join('<br>')
      return `<tr>
        <td>${esc(new Date(k.olusturma_tarihi).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }))}</td>
        <td>${esc(k.lokasyon_tanim)}</td>
        <td>${'★'.repeat(k.yildiz)} ${esc(YILDIZ_ETIKET[k.yildiz])}</td>
        <td>${esc(k.yorum ?? '—')}</td>
        <td>${esc(k.ad_soyad ?? '—')}</td>
        <td>${gorselCell}</td>
        <td>${aksiyonMetni}</td>
        <td>${aksiyonGorselCell}</td>
      </tr>`
    }).join('')

    const ozetHtml = ozet ? `
      <div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
        <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px"><strong>${ozet.toplam}</strong> Toplam</div>
        <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px"><strong>${ozet.ortYildiz.toFixed(1)} ★</strong> Ortalama</div>
        <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px"><strong>${ozet.yorumlu}</strong> Yorumlu</div>
        <div style="padding:8px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px"><strong>${ozet.gorsellli}</strong> Fotoğraflı</div>
      </div>
    ` : ''

    const w = window.open('', '_blank', 'width=1400,height=800')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
      <title>Müşteri Değerlendirmeleri</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:10.5px;padding:20px;color:#111827}
        h2{color:#1f2937;margin-bottom:8px}
        table{width:100%;border-collapse:collapse;margin-top:8px;table-layout:fixed}
        th{background:#1f2937;color:#fff;font-weight:700;padding:7px 8px;text-align:left;font-size:10.5px}
        td{padding:6px 8px;border:1px solid #e5e7eb;font-size:10.5px;vertical-align:top;word-wrap:break-word}
        tr:nth-child(even) td{background:#f9fafb}
        a{word-break:break-all}
      </style>
    </head><body>
      <h2>Müşteri Değerlendirmeleri Raporu</h2>
      <div style="font-size:11px;color:#64748b;margin-bottom:12px">${esc(new Date().toLocaleDateString('tr-TR'))} — ${filtreliKayitlar.length} kayıt</div>
      ${ozetHtml}
      <table>
        <thead><tr>
          <th style="width:9%">Tarih</th>
          <th style="width:11%">Lokasyon</th>
          <th style="width:8%">Puan</th>
          <th style="width:20%">Yorum</th>
          <th style="width:9%">Ad Soyad</th>
          <th style="width:9%">Görsel</th>
          <th style="width:22%">Aksiyon</th>
          <th style="width:12%">Aksiyon Görselleri</th>
        </tr></thead>
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
                    <th>Puan</th>
                    <th>Yorum</th>
                    <th>Ad Soyad</th>
                    <th>Fotoğraf</th>
                    <th style={{ textAlign: 'center' }}>Aksiyon</th>
                    {filtreMod && <th>Kaynak</th>}
                    {(yetkiler.duzenleyebilir || yetkiler.silebilir) && <th style={{ textAlign: 'center' }}>İşlemler</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtreliKayitlar.map((k: any) => {
                    const dusukPuan = k.yildiz <= 3
                    const aksiyonVar = !!k.aksiyon
                    const acik = acikAksiyonId === k.id
                    const colSpan = 7 + (filtreMod ? 1 : 0) + ((yetkiler.duzenleyebilir || yetkiler.silebilir) ? 1 : 0)
                    return (
                      <React.Fragment key={k.id}>
                    <tr style={{ background: acik ? '#fafbff' : undefined }}>
                      <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: 12 }}>
                        {new Date(k.olusturma_tarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ fontWeight: 600, color: '#111827' }}>{k.lokasyon_tanim}</td>
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
                      <td style={{ textAlign: 'center' }}>
                        {/* Aksiyon kolonu: ≤3★ ise buton; aksiyon varsa badge */}
                        {aksiyonVar ? (
                          <button onClick={() => aksiyonPaneliAc(k)}
                            style={{
                              padding: '4px 10px', fontSize: 11.5, fontWeight: 700,
                              borderRadius: 6, border: '1.5px solid #10b981',
                              background: acik ? '#10b981' : '#ecfdf5',
                              color: acik ? '#fff' : '#047857',
                              cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                            <Check size={12} /> Aksiyon Alındı
                          </button>
                        ) : dusukPuan ? (
                          // Sayfaya erişen herkes (TA + yetkili U dahil) aksiyon ekleyebilir
                          // — backend'de lokasyon scope ile sınırlandırılır
                          <button onClick={() => aksiyonPaneliAc(k)}
                            style={{
                              padding: '4px 10px', fontSize: 11.5, fontWeight: 700,
                              borderRadius: 6, border: '1.5px solid #f59e0b',
                              background: acik ? '#f59e0b' : '#fffbeb',
                              color: acik ? '#fff' : '#92400e',
                              cursor: 'pointer', whiteSpace: 'nowrap',
                            }}>
                            ⚡ Aksiyon Al
                          </button>
                        ) : (
                          <span style={{ color: '#cbd5e1', fontSize: 12 }}>—</span>
                        )}
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

                    {/* Aksiyon paneli — açıkken bu satırın altına gelir */}
                    {acik && (
                      <tr>
                        <td colSpan={colSpan} style={{ padding: 0, background: '#fafbff', borderTop: '2px solid #6366f1' }}>
                          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                                {aksiyonVar ? (aksiyonDuzenleMod ? '✏️ Aksiyon Düzenle' : '📋 Alınan Aksiyon') : '⚡ Yeni Aksiyon'}
                              </span>
                              {aksiyonVar && k.aksiyon?.olusturma_tarihi && (
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                  Kaydedildi: {new Date(k.aksiyon.olusturma_tarihi).toLocaleString('tr-TR')}
                                  {k.aksiyon.guncelleme_tarihi && ` · Güncellendi: ${new Date(k.aksiyon.guncelleme_tarihi).toLocaleString('tr-TR')}`}
                                </span>
                              )}
                              <button onClick={() => aksiyonPaneliAc(k)}
                                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                                <X size={14} /> Kapat
                              </button>
                            </div>

                            {/* Read-only görünüm (aksiyon var + edit modu kapalı) */}
                            {aksiyonVar && !aksiyonDuzenleMod ? (
                              <div>
                                <div style={{ padding: '12px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#334155', fontSize: 13.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                  {k.aksiyon!.aksiyon_metni}
                                </div>
                                {k.aksiyon?.olusturan_isim && (
                                  <div style={{ marginTop: 6, fontSize: 11.5, color: '#64748b', fontStyle: 'italic' }}>
                                    Kaydeden: <strong style={{ color: '#475569', fontStyle: 'normal' }}>{k.aksiyon.olusturan_isim}</strong>
                                  </div>
                                )}
                                {(k.aksiyon?.gorsel_urls?.length ?? 0) > 0 && (
                                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {(k.aksiyon!.gorsel_urls as string[]).map((url: string, i: number) => (
                                      <button key={i} onClick={() => setGorselModal(url)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                        <img src={url} alt={`Aksiyon görsel ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {/* Düzenle/Sil — sayfaya erişen herkes (aksiyon yetki sisteminden bağımsız);
                                    backend'de lokasyon scope ile sınırlandırılır */}
                                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                  <button onClick={() => setAksiyonDuzenleMod(true)}
                                    style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #1d4ed8', background: '#eff6ff', color: '#1d4ed8', fontWeight: 600, cursor: 'pointer' }}>
                                    ✏️ Düzenle
                                  </button>
                                  <button onClick={aksiyonSil} disabled={aksiyonSaving}
                                    style={{ padding: '6px 12px', fontSize: 12, borderRadius: 6, border: '1px solid #dc2626', background: '#fef2f2', color: '#dc2626', fontWeight: 600, cursor: 'pointer' }}>
                                    🗑 Sil
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Edit görünümü (yeni veya düzenleme) */
                              <div>
                                <textarea
                                  value={aksiyonMetinDraft}
                                  onChange={e => setAksiyonMetinDraft(e.target.value)}
                                  placeholder="Hangi aksiyon alındı? Kim/ne zaman/sonuç..."
                                  style={{ width: '100%', minHeight: 100, padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                                />
                                {/* Görsel listesi */}
                                {aksiyonGorseller.length > 0 && (
                                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {aksiyonGorseller.map((url, i) => (
                                      <div key={i} style={{ position: 'relative' }}>
                                        <img src={url} alt={`Görsel ${i + 1}`} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                                        <button onClick={() => setAksiyonGorseller(prev => prev.filter((_, idx) => idx !== i))}
                                          style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* Görsel yükleme butonu */}
                                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12, borderRadius: 6, border: '1px dashed #94a3b8', background: '#fff', color: '#475569', fontWeight: 600, cursor: aksiyonGorselYukleniyor ? 'wait' : 'pointer', opacity: aksiyonGorselYukleniyor ? 0.6 : 1 }}>
                                    {aksiyonGorselYukleniyor ? '⏳ Yükleniyor...' : '📎 Görsel Ekle'}
                                    <input type="file" accept="image/jpeg,image/png,image/webp"
                                      onChange={e => { const f = e.target.files?.[0]; if (f) aksiyonGorselYukle(f); e.target.value = '' }}
                                      disabled={aksiyonGorselYukleniyor || aksiyonGorseller.length >= 10}
                                      style={{ display: 'none' }} />
                                  </label>
                                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{aksiyonGorseller.length}/10 · max 5MB · JPG/PNG/WebP</span>
                                </div>
                                {/* Kaydet butonları */}
                                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                                  <button onClick={aksiyonKaydet} disabled={aksiyonSaving || !aksiyonMetinDraft.trim()}
                                    style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, border: 'none', background: aksiyonSaving || !aksiyonMetinDraft.trim() ? '#94a3b8' : '#10b981', color: '#fff', fontWeight: 700, cursor: aksiyonSaving || !aksiyonMetinDraft.trim() ? 'not-allowed' : 'pointer' }}>
                                    {aksiyonSaving ? 'Kaydediliyor...' : '💾 Kaydet'}
                                  </button>
                                  <button onClick={() => aksiyonPaneliAc(k)} disabled={aksiyonSaving}
                                    style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>
                                    İptal
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                      </React.Fragment>
                    )
                  })}
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
