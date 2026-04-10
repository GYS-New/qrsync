'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import {
  RefreshCw, QrCode, Download, RotateCcw,
  LogIn, LogOut, Users, UserCheck, UserX, Filter, X,
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

function sure(giris: string | null, cikis: string | null) {
  if (!giris) return '—'
  const bitis = cikis ? new Date(cikis) : new Date()
  const dk    = Math.floor((bitis.getTime() - new Date(giris).getTime()) / 60000)
  const s     = Math.floor(dk / 60)
  const m     = dk % 60
  return `${s}s ${m}dk`
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
  const [kayitListe,      setKayitListe]      = useState<MesaiKayit[]>([])
  const [lokMap,          setLokMap]          = useState<Record<string, string>>({})
  const [kayitLoading,    setKayitLoading]    = useState(false)

  const filtreAktif       = !!(filtreBaslangic || filtreBitis)
  const aktifFiltreSayisi = [filtreBaslangic, filtreBitis].filter(Boolean).length

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
    setFiltreBaslangic(''); setFiltreBitis(''); setFiltreArama(''); setKayitListe([])
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
        return true
      })
      .sort((a, b) => {
        if (a.aktif && !b.aktif) return -1
        if (!a.aktif && b.aktif) return 1
        return (a.isim_soyisim ?? '').localeCompare(b.isim_soyisim ?? '', 'tr')
      })
  }, [liste, filtreArama, yetkiliUstLokIds])

  // ── Filtreli / sıralı liste (kayıt modu) ─────────────────────────────────
  const siraliKayitlar = useMemo(() => {
    const q = filtreArama.trim().toLowerCase()
    return [...kayitListe]
      .filter(k => {
        if (yetkiliUstLokIds && !(k as any).ust_lokasyon_id) return false
        if (yetkiliUstLokIds && !yetkiliUstLokIds.includes((k as any).ust_lokasyon_id)) return false
        if (q && !k.isim_soyisim?.toLowerCase().includes(q) && !k.email?.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => {
        if (a.kayit_tarihi !== b.kayit_tarihi) return b.kayit_tarihi.localeCompare(a.kayit_tarihi)
        return (a.isim_soyisim ?? '').localeCompare(b.isim_soyisim ?? '', 'tr')
      })
  }, [kayitListe, filtreArama, yetkiliUstLokIds])

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
                <span style={{ fontWeight: 800, fontSize: 14 }}>
                  {filtreAktif ? 'Filtreli Kayıtlar' : 'Personel Durumu — Bugün'}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    placeholder="İsim veya e-posta ara…"
                    value={filtreArama}
                    onChange={e => setFiltreArama(e.target.value)}
                    style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: 200 }}
                  />
                  <button
                    onClick={() => setFiltreAcik(v => !v)}
                    style={{
                      height: 32, padding: '0 12px', borderRadius: 8, fontWeight: 700, fontSize: 12,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      border: `1px solid ${filtreAcik || filtreAktif ? '#1f2937' : '#e2e8f0'}`,
                      background: filtreAcik || filtreAktif ? '#f9fafb' : '#fff',
                      color: filtreAcik || filtreAktif ? '#1f2937' : '#475569',
                    }}>
                    <Filter size={12} /> Filtrele
                    {aktifFiltreSayisi > 0 && (
                      <span style={{ background: '#1f2937', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                        {aktifFiltreSayisi}
                      </span>
                    )}
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
                    <input
                      type="date"
                      value={filtreBaslangic}
                      onChange={e => setFiltreBaslangic(e.target.value)}
                      style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bitiş Tarihi</div>
                    <input
                      type="date"
                      value={filtreBitis}
                      onChange={e => setFiltreBitis(e.target.value)}
                      style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }}
                    />
                  </div>
                  <button
                    onClick={filtreleUygula}
                    disabled={kayitLoading}
                    style={{ height: 32, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Filter size={12} /> {kayitLoading ? 'Yükleniyor…' : 'Uygula'}
                  </button>
                  {filtreAktif && (
                    <button
                      onClick={filtreyiTemizle}
                      style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <X size={12} /> Temizle
                    </button>
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
              ) : filtreAktif ? (

                /* ── Filtre modu tablosu ── */
                siraliKayitlar.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                    Seçilen tarih aralığında kayıt bulunamadı
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                        <tr style={{ background: '#1f2937' }}>
                          {['Personel', 'Üst Lokasyon', 'Rol', 'Tarih', 'Durum', 'İş Başı', 'İş Bitimi', 'Çalışma Süresi'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'left', whiteSpace: 'nowrap', background: '#1f2937' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {siraliKayitlar.map((k, i) => {
                          const dim = !k.aktif
                          const tc  = dim ? '#94a3b8' : '#111827'
                          return (
                            <tr key={k.id} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                              <td style={td()}>{personelHucresi(k.isim_soyisim, k.email, dim)}</td>
                              <td style={td({ fontSize: 12, color: tc })}>{k.ust_lokasyon_id ? lokMap[k.ust_lokasyon_id] ?? '—' : '—'}</td>
                              <td style={td()}>{rolBadge(k.rol, dim)}</td>
                              <td style={td({ fontWeight: 600, color: tc })}>{tarihFormatla(k.kayit_tarihi)}</td>
                              <td style={td()}>{durumBadge(k.aktif)}</td>
                              <td style={td({ fontWeight: 600, color: k.giris_saati ? tc : '#cbd5e1' })}>{saat(k.giris_saati)}</td>
                              <td style={td({ color: k.cikis_saati ? tc : '#cbd5e1' })}>{saat(k.cikis_saati)}</td>
                              <td style={td({ color: dim ? '#cbd5e1' : '#475569' })}>{sure(k.giris_saati, k.cikis_saati)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )

              ) : (

                /* ── Bugün modu tablosu ── */
                siraliListe.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Bu proje için personel bulunamadı</div>
                ) : (
                  <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 340px)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                        <tr style={{ background: '#1f2937' }}>
                          {['Personel', 'Üst Lokasyon', 'Rol', 'Durum', 'İş Başı', 'İş Bitimi', 'Çalışma Süresi', 'Son Görülme'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'left', whiteSpace: 'nowrap', background: '#1f2937' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {siraliListe.map((p, i) => {
                          const dim = !p.aktif
                          const tc  = dim ? '#94a3b8' : '#111827'
                          return (
                            <tr key={p.user_id} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                              <td style={td()}>{personelHucresi(p.isim_soyisim, p.email, dim)}</td>
                              <td style={td({ fontSize: 12, color: tc })}>{(p as any).ust_lokasyon_id ? lokMap[(p as any).ust_lokasyon_id] ?? '—' : '—'}</td>
                              <td style={td()}>{rolBadge(p.rol, dim)}</td>
                              <td style={td()}>{durumBadge(p.aktif)}</td>
                              <td style={td({ fontWeight: 600, color: p.giris_saati ? tc : '#cbd5e1' })}>{saat(p.giris_saati)}</td>
                              <td style={td({ color: p.cikis_saati ? tc : '#cbd5e1' })}>{saat(p.cikis_saati)}</td>
                              <td style={td({ color: dim ? '#cbd5e1' : '#475569' })}>{sure(p.giris_saati, p.cikis_saati)}</td>
                              <td style={td({ whiteSpace: 'nowrap', fontSize: 12, color: dim ? '#cbd5e1' : '#64748b' })}>{sonGorulme(p.last_seen_at)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

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
