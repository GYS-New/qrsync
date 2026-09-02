'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import {
  RefreshCw, QrCode, Download, RotateCcw,
  LogIn, LogOut, Users, UserCheck, UserX, Filter, X,
  FileSpreadsheet, Archive,
} from 'lucide-react'
import QRCode from 'qrcode'

interface QrKod {
  id: string
  tip: 'GIRIS' | 'CIKIS'
  token: string
  nfc_token: string | null
  yeni?: boolean
}

interface PersonelSatir {
  user_id:      string
  isim_soyisim: string
  email:        string
  rol:          string
  aktif:        boolean
  last_seen_at: string | null
  giris_saati:  string | null
  cikis_saati:  string | null
  giris_tipi:   string | null
  cikis_tipi:   string | null
  ust_lokasyon_id?: string | null
}

interface MesaiKayit {
  id:           string
  user_id:      string
  isim_soyisim: string
  email:        string
  rol:          string
  kayit_tarihi: string
  giris_saati:  string | null
  cikis_saati:  string | null
  giris_tipi:   string | null
  cikis_tipi:   string | null
  aktif:        boolean
  arsivlendi:   boolean
  ust_lokasyon_id?: string | null
}

interface Kpi { toplam: number; aktif: number; pasif: number }

interface Props {
  base:            string
  isSA:            boolean
  initialFirmaId?: string | null
  initialProjeId?: string | null
  readonly?:       boolean   // M/U rolleri için QR sekme ve oluşturma gizlenir
  yetkiliUstLokIds?: string[] | null
}

// ── QR görsel üretici ─────────────────────────────────────────────────────────
async function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 300, margin: 2,
    color: { dark: '#1f2937', light: '#ffffff' },
  })
}

function saat(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

// TR gunu farkli ise "27.08 08:15" formati (sarkan V3 icin cikis)
function saatIleTarih(iso: string | null, refIso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const trSaat = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
  if (!refIso) return trSaat
  const refGun = new Date(refIso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
  const gun    = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
  if (gun === refGun) return trSaat
  // Ertesi gun ise "+1 08:15" (kompakt), farkli tarih ise "27.08 08:15"
  const kisa = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Istanbul' })
  return `${kisa} ${trSaat}`
}

function sure(giris: string | null, cikis: string | null) {
  if (!giris) return '—'
  const bitis = cikis ? new Date(cikis) : new Date()
  const dk    = Math.floor((bitis.getTime() - new Date(giris).getTime()) / 60000)
  const s     = Math.floor(dk / 60)
  const m     = dk % 60
  return `${s}s ${m}dk`
}

function sureDakika(giris: string | null, cikis: string | null): number {
  if (!giris) return 0
  const bitis = cikis ? new Date(cikis) : new Date()
  return Math.max(0, Math.floor((bitis.getTime() - new Date(giris).getTime()) / 60000))
}

// giris_saati'nden vardiya no tahmin (default 3 vardiya, tolerans 30 dk)
function vardiyaNo(giris: string | null): number | null {
  if (!giris) return null
  const trTime = new Date(giris).toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour12: false, hour: '2-digit', minute: '2-digit' })
  const [h, m] = trTime.split(':').map(Number)
  const dk = h * 60 + m
  // Tolerans 30 dk once vardiya baslangicina
  if (dk >= 15 * 60 + 30) return 3  // 15:30 sonrasi V3
  if (dk >= 7 * 60 + 30)  return 2  // 07:30 sonrasi V2
  return 1  // 00:00-07:29 V1
}

function tarihFormatla(kayitTarihi: string) {
  // kayit_tarihi YYYY-MM-DD formatında
  const [y, m, d] = kayitTarihi.split('-')
  return `${d}.${m}.${y}`
}

const ROL_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  tenant_admin: { label: 'Firma Admin', bg: '#f3f4f6', color: '#e65100' },
  tenant_user:  { label: 'Kullanıcı',   bg: '#f3e5f5', color: '#6a1b9a' },
  musteri:      { label: 'Müşteri',      bg: '#e3f2fd', color: '#1565c0' },
}

// ── QR Kart bileşeni ─────────────────────────────────────────────────────────
function QrKart({ qr, origin, projeAdi, onIndir }: {
  qr: QrKod; origin: string; projeAdi: string; onIndir: () => void
}) {
  const [imgSrc, setImgSrc] = useState<string | null>(null)
  const url = `${origin}/mesai/${qr.token}`
  const isGiris = qr.tip === 'GIRIS'

  useEffect(() => { qrDataUrl(url).then(setImgSrc) }, [url])

  const bg    = isGiris ? '#dbeafe' : '#fef3c7'
  const color = isGiris ? '#1d4ed8' : '#d97706'
  const label = isGiris ? 'İş Başı' : 'İş Bitimi'

  return (
    <div style={{ border: `2px solid ${color}`, borderRadius: 16, padding: '18px 20px', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, minWidth: 200 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isGiris ? <LogIn size={16} color={color} /> : <LogOut size={16} color={color} />}
        </div>
        <span style={{ fontWeight: 900, fontSize: 15, color }}>{label}</span>
      </div>

      {imgSrc
        ? <img src={imgSrc} alt={label} style={{ width: 160, height: 160, borderRadius: 8 }} />
        : <div style={{ width: 160, height: 160, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><RefreshCw size={20} style={{ animation: 'spin .9s linear infinite', color: '#94a3b8' }} /></div>
      }

      {projeAdi && <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>{projeAdi}</div>}

      <div style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace', wordBreak: 'break-all', textAlign: 'center' }}>{qr.token}</div>

      <button onClick={onIndir}
        style={{ height: 32, padding: '0 14px', borderRadius: 8, border: `1px solid ${color}`, background: bg, color, fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center' }}>
        <Download size={13} /> İndir
      </button>
    </div>
  )
}

// ── Ana bileşen ───────────────────────────────────────────────────────────────
export default function PersonelTakibiClient({ base, isSA, initialFirmaId, initialProjeId, readonly = false, yetkiliUstLokIds }: Props) {
  const { firmaId: saFirmaId } = useFirma()
  const { aktifProje } = useProje()

  const firmaId  = isSA ? saFirmaId : (initialFirmaId ?? null)
  const projeId  = aktifProje?.id ?? initialProjeId ?? null
  const projeAdi = aktifProje?.ad ?? ''

  const [aktifSekme, setAktifSekme] = useState<'bugun' | 'qr'>('bugun')
  const [kpi,        setKpi]        = useState<Kpi | null>(null)
  const [liste,      setListe]      = useState<PersonelSatir[]>([])
  const [qrKodlar,   setQrKodlar]   = useState<QrKod[]>([])
  const [loading,    setLoading]    = useState(false)
  const [qrLoading,  setQrLoading]  = useState(false)
  const [hata,       setHata]       = useState<string | null>(null)
  const [personelTakibiAktif, setPersonelTakibiAktif] = useState<boolean | null>(null)

  // ── Filtre state ──────────────────────────────────────────────────────────
  const [filtreAcik,      setFiltreAcik]      = useState(false)
  const [filtreBaslangic, setFiltreBaslangic] = useState('')
  const [filtreBitis,     setFiltreBitis]     = useState('')
  const [filtreArama,     setFiltreArama]     = useState('')
  const [filtreLokasyon,  setFiltreLokasyon]  = useState('')
  const [filtreDurum,     setFiltreDurum]     = useState<'' | 'aktif' | 'pasif'>('')
  const [filtreVardiya,   setFiltreVardiya]   = useState<'' | '1' | '2' | '3'>('')
  const [filtreGorunum,   setFiltreGorunum]   = useState<'detay' | 'ozet'>('detay')
  const [kayitListe,      setKayitListe]      = useState<MesaiKayit[]>([])
  const [lokMap,          setLokMap]          = useState<Record<string, string>>({})
  const [kayitLoading,    setKayitLoading]    = useState(false)

  // Sayfalama
  const [sayfa, setSayfa] = useState(1)
  const PAGE_SIZE = 50

  // Arşiv
  const [arsivData,     setArsivData]     = useState<any[]>([])
  const [arsivTotal,    setArsivTotal]    = useState(0)
  const [arsivSayfa,    setArsivSayfa]    = useState(1)
  const [arsivLoading,  setArsivLoading]  = useState(false)
  const [arsivAktif,    setArsivAktif]    = useState(false)

  const filtreAktif       = !!(filtreBaslangic || filtreBitis)
  const aktifFiltreSayisi = [filtreBaslangic, filtreBitis, filtreLokasyon, filtreDurum, filtreVardiya].filter(Boolean).length

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  // ── Bugünkü veriyi yükle ──────────────────────────────────────────────────
  const yukle = useCallback(async () => {
    if (!firmaId) return
    setLoading(true); setHata(null)
    try {
      const p = new URLSearchParams({ firma_id: firmaId })
      if (projeId) p.set('proje_id', projeId)
      const res  = await fetch(`/api/mesai/bugun?${p}`)
      const json = await res.json()
      if (!json.ok) { setHata(json.error); return }
      setPersonelTakibiAktif(json.personelTakibiAktif ?? false)
      setKpi(json.kpi)
      setListe(json.kayitlar ?? [])
      if (json.lokMap) setLokMap(prev => ({ ...prev, ...json.lokMap }))
    } finally { setLoading(false) }
  }, [firmaId, projeId])

  // ── Filtrelenmiş kayıtları yükle ─────────────────────────────────────────
  const yukleKayitlar = useCallback(async () => {
    if (!firmaId) return
    setKayitLoading(true); setHata(null)
    try {
      const p = new URLSearchParams({ firma_id: firmaId })
      if (projeId)         p.set('proje_id', projeId)
      if (filtreBaslangic) p.set('baslangic', filtreBaslangic)
      if (filtreBitis)     p.set('bitis', filtreBitis)
      const res  = await fetch(`/api/mesai/liste?${p}`)
      const json = await res.json()
      if (json.ok) { setKayitListe(json.data ?? []); setLokMap(json.lokMap ?? {}) }
      else setHata(json.error)
    } finally { setKayitLoading(false) }
  }, [firmaId, projeId, filtreBaslangic, filtreBitis])

  // ── QR kodları yükle ─────────────────────────────────────────────────────
  const yukleQr = useCallback(async () => {
    if (!firmaId) return
    setQrLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId })
      if (projeId) p.set('proje_id', projeId)
      const res  = await fetch(`/api/mesai/qr-kodlari?${p}`)
      const json = await res.json()
      if (json.ok) setQrKodlar(json.data ?? [])
    } finally { setQrLoading(false) }
  }, [firmaId, projeId])

  useEffect(() => { yukle() }, [yukle])
  useEffect(() => { if (aktifSekme === 'qr') yukleQr() }, [aktifSekme, yukleQr])

  function filtreleUygula() {
    if (filtreAktif) yukleKayitlar()
    else yukle()
  }

  function filtreyiTemizle() {
    setFiltreBaslangic(''); setFiltreBitis(''); setFiltreArama(''); setFiltreLokasyon(''); setFiltreDurum(''); setFiltreVardiya(''); setKayitListe([])
    setArsivAktif(false); setArsivData([]); setArsivTotal(0); setArsivSayfa(1)
    yukle()
  }

  // ── QR oluştur / yenile ───────────────────────────────────────────────────
  async function qrOlustur(yenile = false) {
    if (!firmaId) return
    setQrLoading(true)
    try {
      const res  = await fetch('/api/mesai/qr-kodlari', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma_id: firmaId, proje_id: projeId, yenile }),
      })
      const json = await res.json()
      if (json.ok) setQrKodlar(json.data ?? [])
    } finally { setQrLoading(false) }
  }

  // ── QR indir ─────────────────────────────────────────────────────────────
  async function indir(qr: QrKod) {
    const url  = `${origin}/mesai/${qr.token}`
    const src  = await qrDataUrl(url)
    const a    = document.createElement('a')
    a.href     = src
    a.download = `mesai-${qr.tip.toLowerCase()}-${projeAdi || 'genel'}.png`
    a.click()
  }

  // ── Son görülme formatı ───────────────────────────────────────────────────
  function sonGorulme(iso: string | null): string {
    if (!iso) return '—'
    const tarih    = new Date(iso)
    const dk       = Math.floor((Date.now() - tarih.getTime()) / 60000)
    const tarihStr = tarih.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const saatStr  = tarih.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

    let onceStr: string
    if (dk < 1)        onceStr = 'şimdi'
    else if (dk < 60)  onceStr = `${dk} dk önce`
    else               onceStr = `${Math.floor(dk/60)}s ${dk%60}dk önce`

    return `${tarihStr} ${saatStr} — ${onceStr}`
  }

  // ── Filtreli / sıralı liste (bugün modu) ─────────────────────────────────
  const siraliListe = useMemo(() => {
    const q = filtreArama.trim().toLowerCase()
    return [...liste]
      .filter(p => {
        if (yetkiliUstLokIds && !(p as any).ust_lokasyon_id) return false
        if (yetkiliUstLokIds && !yetkiliUstLokIds.includes((p as any).ust_lokasyon_id)) return false
        if (q && !p.isim_soyisim?.toLowerCase().includes(q) && !p.email?.toLowerCase().includes(q)) return false
        if (filtreLokasyon && (p as any).ust_lokasyon_id !== filtreLokasyon) return false
        if (filtreDurum === 'aktif' && !p.aktif) return false
        if (filtreDurum === 'pasif' && p.aktif) return false
        return true
      })
      .sort((a, b) => {
        if (a.aktif && !b.aktif) return -1
        if (!a.aktif && b.aktif) return 1
        return (a.isim_soyisim ?? '').localeCompare(b.isim_soyisim ?? '', 'tr')
      })
  }, [liste, filtreArama, filtreLokasyon, filtreDurum, yetkiliUstLokIds])

  // ── Filtreli / sıralı liste (kayıt modu) ─────────────────────────────────
  const siraliKayitlar = useMemo(() => {
    const q = filtreArama.trim().toLowerCase()
    return [...kayitListe]
      .filter(k => {
        if (yetkiliUstLokIds && !(k as any).ust_lokasyon_id) return false
        if (yetkiliUstLokIds && !yetkiliUstLokIds.includes((k as any).ust_lokasyon_id)) return false
        if (q && !k.isim_soyisim?.toLowerCase().includes(q) && !k.email?.toLowerCase().includes(q)) return false
        if (filtreLokasyon && (k as any).ust_lokasyon_id !== filtreLokasyon) return false
        if (filtreDurum === 'aktif' && !k.aktif) return false
        if (filtreDurum === 'pasif' && k.aktif) return false
        if (filtreVardiya) {
          const vNo = vardiyaNo(k.giris_saati)
          if (vNo !== Number(filtreVardiya)) return false
        }
        return true
      })
      .sort((a, b) => {
        if (a.kayit_tarihi !== b.kayit_tarihi) return b.kayit_tarihi.localeCompare(a.kayit_tarihi)
        return (a.isim_soyisim ?? '').localeCompare(b.isim_soyisim ?? '', 'tr')
      })
  }, [kayitListe, filtreArama, filtreLokasyon, filtreDurum, filtreVardiya, yetkiliUstLokIds])

  // Filtreli listenin ozet metrikleri
  const kayitOzeti = useMemo(() => {
    const toplamDk = siraliKayitlar.reduce((s, k) => s + sureDakika(k.giris_saati, k.cikis_saati), 0)
    const tamamKayit = siraliKayitlar.filter(k => k.cikis_saati).length
    const ortDk = tamamKayit > 0 ? Math.floor(toplamDk / tamamKayit) : 0
    const eksikCikis = siraliKayitlar.filter(k => !k.cikis_saati).length
    const farkliPersonel = new Set(siraliKayitlar.map(k => k.user_id)).size
    const fmtDk = (dk: number) => `${Math.floor(dk / 60)}s ${dk % 60}dk`
    return {
      toplamKayit: siraliKayitlar.length,
      toplamSaat: fmtDk(toplamDk),
      ortalamaSaat: tamamKayit > 0 ? fmtDk(ortDk) : '—',
      eksikCikis,
      farkliPersonel,
    }
  }, [siraliKayitlar])

  // Personel bazli aggregated ozet (personelOzeti gorunumu icin)
  type PersonelOzet = {
    user_id: string
    isim_soyisim: string
    email: string
    ust_lokasyon_id: string | null
    toplamGun: number
    vardiya1Gun: number
    vardiya2Gun: number
    vardiya3Gun: number
    toplamDk: number
    ortalamaDk: number
    eksikCikis: number
    ilkTarih: string | null
    sonTarih: string | null
  }
  const personelOzeti = useMemo<PersonelOzet[]>(() => {
    const map = new Map<string, PersonelOzet>()
    for (const k of siraliKayitlar) {
      if (!k.user_id) continue
      let p = map.get(k.user_id)
      if (!p) {
        p = {
          user_id: k.user_id,
          isim_soyisim: k.isim_soyisim ?? '—',
          email: k.email ?? '',
          ust_lokasyon_id: (k as any).ust_lokasyon_id ?? null,
          toplamGun: 0, vardiya1Gun: 0, vardiya2Gun: 0, vardiya3Gun: 0,
          toplamDk: 0, ortalamaDk: 0, eksikCikis: 0,
          ilkTarih: null, sonTarih: null,
        }
        map.set(k.user_id, p)
      }
      p.toplamGun += 1
      const vNo = vardiyaNo(k.giris_saati)
      if (vNo === 1) p.vardiya1Gun += 1
      else if (vNo === 2) p.vardiya2Gun += 1
      else if (vNo === 3) p.vardiya3Gun += 1
      p.toplamDk += sureDakika(k.giris_saati, k.cikis_saati)
      if (!k.cikis_saati) p.eksikCikis += 1
      if (!p.ilkTarih || k.kayit_tarihi < p.ilkTarih) p.ilkTarih = k.kayit_tarihi
      if (!p.sonTarih || k.kayit_tarihi > p.sonTarih) p.sonTarih = k.kayit_tarihi
    }
    for (const p of map.values()) {
      const tamamKayit = p.toplamGun - p.eksikCikis
      p.ortalamaDk = tamamKayit > 0 ? Math.floor(p.toplamDk / tamamKayit) : 0
    }
    return [...map.values()].sort((a, b) => b.toplamDk - a.toplamDk)
  }, [siraliKayitlar])

  // Sayfalama
  const aktifListe = filtreAktif ? siraliKayitlar : siraliListe
  const toplamSayfa = Math.max(1, Math.ceil(aktifListe.length / PAGE_SIZE))
  const sayfaRows = aktifListe.slice((sayfa - 1) * PAGE_SIZE, sayfa * PAGE_SIZE)
  useEffect(() => { setSayfa(1) }, [aktifListe.length])

  // Üst lokasyon listesi (filtre dropdown için)
  const ustLokasyonlar = useMemo(() => {
    const ids = new Set<string>()
    for (const p of liste) if ((p as any).ust_lokasyon_id) ids.add((p as any).ust_lokasyon_id)
    for (const k of kayitListe) if ((k as any).ust_lokasyon_id) ids.add((k as any).ust_lokasyon_id)
    return [...ids].map(id => ({ id, tanim: lokMap[id] ?? id })).sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))
  }, [liste, kayitListe, lokMap])

  // Excel download
  async function excelIndir() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'İOGYS'
    const ws = wb.addWorksheet('Personel Takibi')
    // Ozet gorunumu excel formati
    if (filtreAktif && filtreGorunum === 'ozet') {
      ws.columns = [
        { header: 'Personel', key: 'isim', width: 24 }, { header: 'Email', key: 'email', width: 28 },
        { header: 'Toplam Gün', key: 'gun', width: 12 },
        { header: '1. Vardiya (Gün)', key: 'v1', width: 15 },
        { header: '2. Vardiya (Gün)', key: 'v2', width: 15 },
        { header: '3. Vardiya (Gün)', key: 'v3', width: 15 },
        { header: 'Toplam Çalışma', key: 'toplam', width: 16 },
        { header: 'Ortalama/Gün', key: 'ort', width: 14 },
        { header: 'Eksik Çıkış', key: 'eksik', width: 12 },
        { header: 'İlk Kayıt', key: 'ilk', width: 12 }, { header: 'Son Kayıt', key: 'son', width: 12 },
      ]
      const fmt = (dk: number) => `${Math.floor(dk / 60)}s ${String(dk % 60).padStart(2, '0')}dk`
      personelOzeti.forEach(p => ws.addRow({
        isim: p.isim_soyisim, email: p.email,
        gun: p.toplamGun, v1: p.vardiya1Gun, v2: p.vardiya2Gun, v3: p.vardiya3Gun,
        toplam: fmt(p.toplamDk), ort: fmt(p.ortalamaDk),
        eksik: p.eksikCikis,
        ilk: p.ilkTarih ? tarihFormatla(p.ilkTarih) : '',
        son: p.sonTarih ? tarihFormatla(p.sonTarih) : '',
      }))
      const hr = ws.getRow(1)
      hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `personel-ozeti-${filtreBaslangic || 'tum'}-${filtreBitis || 'bugun'}.xlsx`
      a.click(); URL.revokeObjectURL(a.href)
      return
    }
    if (filtreAktif) {
      ws.columns = [
        { header: 'Personel', key: 'isim', width: 24 }, { header: 'Email', key: 'email', width: 28 },
        { header: 'Üst Lokasyon', key: 'lok', width: 20 }, { header: 'Rol', key: 'rol', width: 14 },
        { header: 'Tarih', key: 'tarih', width: 14 }, { header: 'Vardiya', key: 'vardiya', width: 10 },
        { header: 'Durum', key: 'durum', width: 12 },
        { header: 'İş Başı', key: 'giris', width: 12 }, { header: 'İş Bitimi', key: 'cikis', width: 14 },
        { header: 'Çalışma Süresi', key: 'sure', width: 16 },
      ]
      siraliKayitlar.forEach(k => {
        const vNo = vardiyaNo(k.giris_saati)
        ws.addRow({
          isim: k.isim_soyisim, email: k.email,
          lok: (k as any).ust_lokasyon_id ? lokMap[(k as any).ust_lokasyon_id] ?? '' : '',
          rol: ROL_BADGE[k.rol]?.label ?? k.rol,
          tarih: tarihFormatla(k.kayit_tarihi),
          vardiya: vNo ? `${vNo}. Vardiya` : '',
          durum: k.aktif ? 'Aktif' : 'Pasif',
          giris: saat(k.giris_saati),
          cikis: saatIleTarih(k.cikis_saati, k.giris_saati),
          sure: sure(k.giris_saati, k.cikis_saati),
        })
      })
    } else {
      ws.columns = [
        { header: 'Personel', key: 'isim', width: 24 }, { header: 'Email', key: 'email', width: 28 },
        { header: 'Üst Lokasyon', key: 'lok', width: 20 }, { header: 'Rol', key: 'rol', width: 14 },
        { header: 'Durum', key: 'durum', width: 12 },
        { header: 'İş Başı', key: 'giris', width: 12 }, { header: 'İş Bitimi', key: 'cikis', width: 12 },
        { header: 'Çalışma Süresi', key: 'sure', width: 16 },
      ]
      siraliListe.forEach(p => ws.addRow({
        isim: p.isim_soyisim, email: p.email,
        lok: (p as any).ust_lokasyon_id ? lokMap[(p as any).ust_lokasyon_id] ?? '' : '',
        rol: ROL_BADGE[p.rol]?.label ?? p.rol, durum: p.aktif ? 'Aktif' : 'Pasif',
        giris: saat(p.giris_saati), cikis: saat(p.cikis_saati),
        sure: sure(p.giris_saati, p.cikis_saati),
      }))
    }
    const hr = ws.getRow(1)
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } }
    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `personel-takibi-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click(); URL.revokeObjectURL(a.href)
  }

  // Arşiv yükle
  async function arsivYukle(pg?: number) {
    const page = pg ?? arsivSayfa
    setArsivLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId!, page: String(page), limit: '50' })
      if (projeId) p.set('proje_id', projeId)
      if (filtreBaslangic) p.set('baslangic', filtreBaslangic)
      if (filtreBitis) p.set('bitis', filtreBitis)
      const res = await fetch(`/api/mesai/arsiv?${p}`)
      const json = await res.json()
      setArsivData(json.data ?? [])
      setArsivTotal(json.total ?? json.data?.length ?? 0)
    } catch {} finally { setArsivLoading(false) }
  }

  const spinning    = { animation: 'spin 0.9s linear infinite' }
  const isLoading   = filtreAktif ? kayitLoading : loading

  const td = (e?: React.CSSProperties): React.CSSProperties => ({
    padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 13, verticalAlign: 'middle', ...e,
  })

  const sekme = (id: 'bugun' | 'qr') => ({
    height: 36, padding: '0 18px', border: 'none', cursor: 'pointer', fontWeight: 700,
    fontSize: 13, borderRadius: 8,
    background: aktifSekme === id ? '#1f2937' : 'transparent',
    color:      aktifSekme === id ? '#fff'    : '#475569',
  } as React.CSSProperties)

  // ── Durum badge ───────────────────────────────────────────────────────────
  function durumBadge(aktif: boolean) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
        background: aktif ? '#dcfce7' : '#fef2f2',
        color:      aktif ? '#166534' : '#dc2626',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: aktif ? '#16a34a' : '#ef4444' }} />
        {aktif ? 'Aktif' : 'Aktif Değil'}
      </span>
    )
  }

  // ── Personel avatar + isim hücresi ───────────────────────────────────────
  function personelHucresi(isim: string, email: string, dim: boolean) {
    const initials = isim?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    const tc = dim ? '#94a3b8' : '#111827'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
          background: dim ? '#e2e8f0' : 'linear-gradient(135deg,#374151,#1f2937)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: dim ? '#94a3b8' : '#fff', fontSize: 12, fontWeight: 800,
        }}>{initials}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: tc }}>{isim}</div>
          <div style={{ fontSize: 11.5, color: dim ? '#cbd5e1' : '#94a3b8' }}>{email}</div>
        </div>
      </div>
    )
  }

  function rolBadge(rol: string, dim: boolean) {
    const rb = ROL_BADGE[rol]
    return rb
      ? <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, background: rb.bg, color: rb.color, whiteSpace: 'nowrap', opacity: dim ? 0.5 : 1 }}>{rb.label}</span>
      : <span style={{ fontSize: 11.5, color: dim ? '#94a3b8' : '#64748b' }}>{rol}</span>
  }

  return (
    <div>
      <Topbar title="Personel Takibi" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: projeAdi || 'Tüm Firma' }, { label: 'Personel Takibi' }]} />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Sekmeler */}
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, alignSelf: 'flex-start' }}>
          <button style={sekme('bugun')} onClick={() => setAktifSekme('bugun')}>
            <Users size={14} style={{ display: 'inline', marginRight: 6 }} />Personel
          </button>
          {!readonly && (
            <button style={sekme('qr')} onClick={() => setAktifSekme('qr')}>
              <QrCode size={14} style={{ display: 'inline', marginRight: 6 }} />QR / NFC Kodlar
            </button>
          )}
        </div>

        {/* Personel takibi kapalı uyarısı */}
        {personelTakibiAktif === false && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, fontSize: 13, color: '#92400e' }}>
            <span style={{ fontSize: 18 }}>⚠️</span>
            <div>
              <strong>Personel takibi bu {projeId ? 'proje' : 'firma'} için aktif değil.</strong>
              <span style={{ marginLeft: 6 }}>
                {isSA
                  ? 'Firma Detay veya Proje Düzenle ekranından açabilirsiniz.'
                  : 'Sistem yöneticinizle iletişime geçin.'}
              </span>
            </div>
          </div>
        )}

        {/* ── PERSONEL SEKMESİ ── */}
        {aktifSekme === 'bugun' && (
          <>
            {/* KPI kartlar — bugün modu */}
            {kpi && !filtreAktif && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[
                  { label: 'Toplam Personel', val: kpi.toplam, icon: <Users size={20} color="#1f2937" />,     bg: '#f9fafb' },
                  { label: 'Aktif',           val: kpi.aktif,  icon: <UserCheck size={20} color="#16a34a" />, bg: '#dcfce7' },
                  { label: 'Aktif Değil',     val: kpi.pasif,  icon: <UserX size={20} color="#dc2626" />,     bg: '#fef2f2' },
                ].map(({ label, val, icon, bg }) => (
                  <div key={label} className="verde-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, background: bg }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>{icon}</div>
                    <div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: '#111827', lineHeight: 1 }}>{val}</div>
                      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>{label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* KPI kartlar — filtre modu */}
            {filtreAktif && siraliKayitlar.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
                {[
                  { label: 'Toplam Kayıt', val: siraliKayitlar.length,                          icon: <Users size={20} color="#1f2937" />,     bg: '#f9fafb' },
                  { label: 'Tamamlanan',   val: siraliKayitlar.filter(k => k.cikis_saati).length, icon: <UserCheck size={20} color="#16a34a" />, bg: '#dcfce7' },
                  { label: 'Eksik Çıkış',  val: siraliKayitlar.filter(k => !k.cikis_saati).length, icon: <UserX size={20} color="#f59e0b" />,   bg: '#fffbeb' },
                ].map(({ label, val, icon, bg }) => (
                  <div key={label} className="verde-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, background: bg }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>{icon}</div>
                    <div>
                      <div style={{ fontSize: 26, fontWeight: 900, color: '#111827', lineHeight: 1 }}>{val}</div>
                      <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 3 }}>{label}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Liste + araç çubuğu */}
            <div className="verde-card" style={{ overflow: 'hidden' }}>
              {/* Başlık + araçlar */}
              <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>
                    {filtreAktif ? 'Filtreli Kayıtlar' : 'Personel Durumu — Bugün'}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>({aktifListe.length} kayıt{toplamSayfa > 1 ? ` · Sayfa ${sayfa}/${toplamSayfa}` : ''})</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    placeholder="İsim veya e-posta ara…"
                    value={filtreArama}
                    onChange={e => setFiltreArama(e.target.value)}
                    style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: 200 }}
                  />
                  {ustLokasyonlar.length > 0 && (
                    <select value={filtreLokasyon} onChange={e => setFiltreLokasyon(e.target.value)}
                      style={{ height: 32, padding: '0 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, background: '#fff', minWidth: 140 }}>
                      <option value="">Tüm Lokasyonlar</option>
                      {ustLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                    </select>
                  )}
                  <select value={filtreDurum} onChange={e => setFiltreDurum(e.target.value as any)}
                    style={{ height: 32, padding: '0 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, background: '#fff', minWidth: 100 }}>
                    <option value="">Tüm Durum</option>
                    <option value="aktif">Aktif</option>
                    <option value="pasif">Pasif</option>
                  </select>
                  <button
                    onClick={() => setFiltreAcik(v => !v)}
                    style={{
                      height: 32, padding: '0 12px', borderRadius: 8, fontWeight: 700, fontSize: 12,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      border: `1px solid ${filtreAcik || filtreAktif ? '#1f2937' : '#e2e8f0'}`,
                      background: filtreAcik || filtreAktif ? '#f9fafb' : '#fff',
                      color: filtreAcik || filtreAktif ? '#1f2937' : '#475569',
                    }}>
                    <Filter size={12} /> Tarih Filtresi
                    {aktifFiltreSayisi > 0 && (
                      <span style={{ background: '#1f2937', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                        {aktifFiltreSayisi}
                      </span>
                    )}
                  </button>
                  <button onClick={excelIndir} disabled={aktifListe.length === 0}
                    style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#1d6f42', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', opacity: aktifListe.length === 0 ? 0.4 : 1 }}>
                    <FileSpreadsheet size={12} /> Excel
                  </button>
                  {!filtreAktif && (
                    <button onClick={yukle} disabled={loading || !firmaId}
                      style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#1f2937', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <RefreshCw size={12} style={loading ? spinning : {}} />
                      {loading ? 'Yükleniyor…' : 'Yenile'}
                    </button>
                  )}
                </div>
              </div>

              {/* Filtre paneli */}
              {filtreAcik && (
                <div style={{ padding: '14px 18px', background: '#f8fafc', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Başlangıç Tarihi</div>
                    <input type="date" value={filtreBaslangic} onChange={e => setFiltreBaslangic(e.target.value)}
                      style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bitiş Tarihi</div>
                    <input type="date" value={filtreBitis} onChange={e => setFiltreBitis(e.target.value)}
                      style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Vardiya</div>
                    <select value={filtreVardiya} onChange={e => setFiltreVardiya(e.target.value as any)}
                      style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff', minWidth: 160 }}>
                      <option value="">Tüm Vardiyalar</option>
                      <option value="1">1. Vardiya (00:00–08:00)</option>
                      <option value="2">2. Vardiya (08:00–16:00)</option>
                      <option value="3">3. Vardiya (16:00–24:00)</option>
                    </select>
                  </div>
                  <button onClick={filtreleUygula} disabled={kayitLoading}
                    style={{ height: 32, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Filter size={12} /> {kayitLoading ? 'Yükleniyor…' : 'Uygula'}
                  </button>
                  {filtreAktif && (
                    <button onClick={filtreyiTemizle}
                      style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <X size={12} /> Temizle
                    </button>
                  )}
                  {/* Gorunum toggle: Detay / Personel Ozeti */}
                  {filtreAktif && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#fff', padding: 2, borderRadius: 8, border: '1px solid #e2e8f0', marginLeft: 'auto' }}>
                      <button onClick={() => setFiltreGorunum('detay')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: 'none',
                          background: filtreGorunum === 'detay' ? '#0f172a' : 'transparent',
                          color: filtreGorunum === 'detay' ? '#fff' : '#475569',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        Detay Kayıt
                      </button>
                      <button onClick={() => setFiltreGorunum('ozet')}
                        style={{ padding: '5px 10px', borderRadius: 6, border: 'none',
                          background: filtreGorunum === 'ozet' ? '#0f172a' : 'transparent',
                          color: filtreGorunum === 'ozet' ? '#fff' : '#475569',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        📊 Personel Özeti
                      </button>
                    </div>
                  )}
                  {!filtreAktif && (
                    <div style={{ marginLeft: 'auto', fontSize: 11, color: '#64748b', fontStyle: 'italic', maxWidth: 300 }}>
                      Geçmiş tarih otomatik olarak arşiv kayıtlarını da içerir.
                    </div>
                  )}
                </div>
              )}

              {/* Filtre modu ozet metrikleri */}
              {filtreAktif && siraliKayitlar.length > 0 && (
                <div style={{ padding: '10px 18px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12 }}>
                  <span><strong style={{ color: '#1e40af' }}>Farklı Personel:</strong> {kayitOzeti.farkliPersonel}</span>
                  <span><strong style={{ color: '#1e40af' }}>Toplam Mesai:</strong> {kayitOzeti.toplamKayit}</span>
                  <span><strong style={{ color: '#1e40af' }}>Toplam Çalışma:</strong> {kayitOzeti.toplamSaat}</span>
                  <span><strong style={{ color: '#1e40af' }}>Kayıt Ortalaması:</strong> {kayitOzeti.ortalamaSaat}</span>
                  {kayitOzeti.eksikCikis > 0 && (
                    <span style={{ color: '#dc2626' }}><strong>⚠ Eksik Çıkış:</strong> {kayitOzeti.eksikCikis}</span>
                  )}
                </div>
              )}

              {/* İçerik */}
              {hata ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#dc2626', fontSize: 13 }}>{hata}</div>
              ) : !firmaId ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Firma seçin</div>
              ) : isLoading ? (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <RefreshCw size={22} style={{ ...spinning, color: '#1f2937', display: 'block', margin: '0 auto 10px' }} />
                </div>
              ) : filtreAktif && filtreGorunum === 'ozet' ? (
                /* ── PERSONEL OZETI gorunumu (aggregated) ── */
                personelOzeti.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                    Seçilen tarih aralığında kayıt yok
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
                    <table className="verde-table">
                      <thead><tr>
                        <th>Personel</th>
                        <th style={{ textAlign: 'center' }}>Toplam Gün</th>
                        <th style={{ textAlign: 'center' }}>1. Vardiya</th>
                        <th style={{ textAlign: 'center' }}>2. Vardiya</th>
                        <th style={{ textAlign: 'center' }}>3. Vardiya</th>
                        <th style={{ textAlign: 'right' }}>Toplam Çalışma</th>
                        <th style={{ textAlign: 'right' }}>Ortalama/Gün</th>
                        <th style={{ textAlign: 'center' }}>Eksik Çıkış</th>
                        <th>İlk / Son Kayıt</th>
                      </tr></thead>
                      <tbody>
                        {personelOzeti.map((p) => {
                          const fmt = (dk: number) => `${Math.floor(dk / 60)}s ${String(dk % 60).padStart(2, '0')}dk`
                          const vBadge = (adet: number, renk: string) => adet > 0
                            ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11.5, fontWeight: 700, background: renk + '22', color: renk }}>{adet}</span>
                            : <span style={{ color: '#cbd5e1' }}>—</span>
                          return (
                            <tr key={p.user_id}>
                              <td>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{p.isim_soyisim}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.email}</div>
                              </td>
                              <td style={{ textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{p.toplamGun}</td>
                              <td style={{ textAlign: 'center' }}>{vBadge(p.vardiya1Gun, '#7c3aed')}</td>
                              <td style={{ textAlign: 'center' }}>{vBadge(p.vardiya2Gun, '#0ea5e9')}</td>
                              <td style={{ textAlign: 'center' }}>{vBadge(p.vardiya3Gun, '#f59e0b')}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#166534' }}>{fmt(p.toplamDk)}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'ui-monospace, monospace', color: '#475569' }}>{fmt(p.ortalamaDk)}</td>
                              <td style={{ textAlign: 'center' }}>
                                {p.eksikCikis > 0
                                  ? <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: '#fee2e2', color: '#991b1b' }}>{p.eksikCikis}</span>
                                  : <span style={{ color: '#cbd5e1' }}>—</span>}
                              </td>
                              <td style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                                {p.ilkTarih ? tarihFormatla(p.ilkTarih) : '—'} → {p.sonTarih ? tarihFormatla(p.sonTarih) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : filtreAktif ? (

                /* ── Filtre modu tablosu (verde-table) — DETAY ── */
                sayfaRows.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                    {siraliKayitlar.length === 0 ? 'Seçilen tarih aralığında kayıt bulunamadı' : 'Filtre sonucu boş'}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
                    <table className="verde-table">
                      <thead><tr>
                        <th>Personel</th><th>Üst Lokasyon</th><th>Rol</th><th>Tarih</th>
                        <th>Durum</th><th>İş Başı</th><th>İş Bitimi</th><th>Çalışma Süresi</th>
                      </tr></thead>
                      <tbody>
                        {(sayfaRows as MesaiKayit[]).map((k) => {
                          const dim = !k.aktif
                          const tc  = dim ? '#94a3b8' : '#111827'
                          return (
                            <tr key={k.id}>
                              <td>{personelHucresi(k.isim_soyisim, k.email, dim)}</td>
                              <td style={{ fontSize: 12, color: tc }}>{k.ust_lokasyon_id ? lokMap[k.ust_lokasyon_id] ?? '—' : '—'}</td>
                              <td>{rolBadge(k.rol, dim)}</td>
                              <td style={{ fontWeight: 600, color: tc }}>{tarihFormatla(k.kayit_tarihi)}</td>
                              <td>{durumBadge(k.aktif)}</td>
                              <td style={{ fontWeight: 600, color: k.giris_saati ? tc : '#cbd5e1' }}>{saat(k.giris_saati)}</td>
                              <td style={{ color: k.cikis_saati ? tc : '#cbd5e1', whiteSpace: 'nowrap' }}
                                title={k.cikis_saati ? new Date(k.cikis_saati).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : ''}>
                                {saatIleTarih(k.cikis_saati, k.giris_saati)}
                              </td>
                              <td style={{ color: dim ? '#cbd5e1' : '#475569' }}>{sure(k.giris_saati, k.cikis_saati)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )

              ) : (

                /* ── Bugün modu tablosu (verde-table) ── */
                sayfaRows.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Bu proje için personel bulunamadı</div>
                ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 380px)' }}>
                    <table className="verde-table">
                      <thead><tr>
                        <th>Personel</th><th>Üst Lokasyon</th><th>Rol</th><th>Durum</th>
                        <th>İş Başı</th><th>İş Bitimi</th><th>Çalışma Süresi</th><th>Son Görülme</th>
                      </tr></thead>
                      <tbody>
                        {(sayfaRows as PersonelSatir[]).map((p) => {
                          const dim = !p.aktif
                          const tc  = dim ? '#94a3b8' : '#111827'
                          return (
                            <tr key={p.user_id}>
                              <td>{personelHucresi(p.isim_soyisim, p.email, dim)}</td>
                              <td style={{ fontSize: 12, color: tc }}>{(p as any).ust_lokasyon_id ? lokMap[(p as any).ust_lokasyon_id] ?? '—' : '—'}</td>
                              <td>{rolBadge(p.rol, dim)}</td>
                              <td>{durumBadge(p.aktif)}</td>
                              <td style={{ fontWeight: 600, color: p.giris_saati ? tc : '#cbd5e1' }}>{saat(p.giris_saati)}</td>
                              <td style={{ color: p.cikis_saati ? tc : '#cbd5e1' }}>{saat(p.cikis_saati)}</td>
                              <td style={{ color: dim ? '#cbd5e1' : '#475569' }}>{sure(p.giris_saati, p.cikis_saati)}</td>
                              <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: dim ? '#cbd5e1' : '#64748b' }}>{sonGorulme(p.last_seen_at)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* Sayfalama */}
              {toplamSayfa > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 18px', borderTop: '1px solid #f3f4f6' }}>
                  <button onClick={() => setSayfa(1)} disabled={sayfa === 1}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: sayfa === 1 ? 0.4 : 1 }}>«</button>
                  <button onClick={() => setSayfa(s => Math.max(1, s - 1))} disabled={sayfa === 1}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: sayfa === 1 ? 0.4 : 1 }}>‹ Önceki</button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{sayfa} / {toplamSayfa}</span>
                  <button onClick={() => setSayfa(s => Math.min(toplamSayfa, s + 1))} disabled={sayfa >= toplamSayfa}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: sayfa >= toplamSayfa ? 0.4 : 1 }}>Sonraki ›</button>
                  <button onClick={() => setSayfa(toplamSayfa)} disabled={sayfa >= toplamSayfa}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: sayfa >= toplamSayfa ? 0.4 : 1 }}>»</button>
                </div>
              )}
            </div>

            {/* Arsiv bolumu kaldirildi (26.08.2026): /api/mesai/liste endpoint'i
                zaten hem canli hem arsiv kayitlarini birlikte donuyor. Ayri
                buton yerine tarih filtresi otomatik arsive de bakar. */}

            {personelTakibiAktif && kpi && kpi.pasif > 0 && !filtreAktif && (
              <div style={{ fontSize: 12.5, color: '#dc2626', background: '#fef2f2', padding: '8px 14px', borderRadius: 8, border: '1px solid #fecaca' }}>
                ⚠️ Aktif olmayan <strong>{kpi.pasif} personele</strong> görev ataması yapılamaz.
              </div>
            )}
          </>
        )}

        {/* ── QR / NFC SEKMESİ ── */}
        {aktifSekme === 'qr' && (
          <div className="verde-card" style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 900, color: '#111827', margin: 0 }}>Mesai QR / NFC Kodları</h2>
                <p style={{ fontSize: 12.5, color: '#64748b', marginTop: 4 }}>
                  {projeAdi ? `Proje: ${projeAdi}` : 'Tüm Firma'} — Personeller bu QR kodlarını okutarak iş başı / bitimi yapar.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {qrKodlar.length === 0
                  ? <button onClick={() => qrOlustur(false)} disabled={qrLoading || !firmaId}
                      style={{ height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <QrCode size={14} /> {qrLoading ? 'Oluşturuluyor…' : 'QR Kod Oluştur'}
                    </button>
                  : <button onClick={() => qrOlustur(true)} disabled={qrLoading}
                      style={{ height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid #fcd34d', background: '#fef3c7', color: '#92400e', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <RotateCcw size={13} /> Yenile
                    </button>
                }
              </div>
            </div>

            {!firmaId ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Firma seçin</div>
            ) : qrLoading ? (
              <div style={{ padding: 32, textAlign: 'center' }}><RefreshCw size={22} style={{ ...spinning, color: '#1f2937', display: 'block', margin: '0 auto' }} /></div>
            ) : qrKodlar.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                <QrCode size={36} style={{ margin: '0 auto 12px', display: 'block', color: '#cbd5e1' }} />
                Bu proje için henüz QR kodu oluşturulmadı.
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center' }}>
                {qrKodlar.map(qr => (
                  <QrKart key={qr.id} qr={qr} origin={origin} projeAdi={projeAdi} onIndir={() => indir(qr)} />
                ))}
              </div>
            )}

            {/* NFC token bilgisi */}
            {qrKodlar.some(q => q.nfc_token) && (
              <div style={{ marginTop: 16, background: '#f9fafb', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#166534' }}>
                <strong>NFC Token'ları:</strong>
                {qrKodlar.filter(q => q.nfc_token).map(q => (
                  <div key={q.id} style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 12 }}>
                    {q.tip === 'GIRIS' ? '🟢 Giriş' : '🔴 Çıkış'}: {q.nfc_token}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
