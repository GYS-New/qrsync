'use client'

import { useEffect, useMemo, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import { RefreshCw, Star, Pencil, Trash2, RotateCcw, X, Check } from 'lucide-react'

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
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1a0f', marginBottom: 8 }}>{baslik}</div>
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
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1a0f' }}>Değerlendirmeyi Düzenle</div>
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
            style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: '#1f6b1f', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
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

  const [kayitlar, setKayitlar]         = useState<Kayit[]>([])
  const [loading, setLoading]           = useState(false)
  const [baslangic, setBaslangic]       = useState('')
  const [bitis, setBitis]               = useState('')
  const [filtreYildiz, setFiltreYildiz] = useState(0)
  const [filtreKanal, setFiltreKanal]   = useState<'TUMU' | 'QR' | 'NFC'>('TUMU')
  const [gorselModal, setGorselModal]   = useState<string | null>(null)
  const [hata, setHata]                 = useState<string | null>(null)

  // Aksiyon state'leri
  const [duzenleKayit,   setDuzenleKayit]   = useState<Kayit | null>(null)
  const [silKayit,       setSilKayit]       = useState<Kayit | null>(null)
  const [arsivleKayit,   setArsivleKayit]   = useState<Kayit | null>(null)
  const [aksiyonLoading, setAksiyonLoading] = useState(false)

  const spinning = { animation: 'spin 0.9s linear infinite' }

  async function yukle() {
    if (!firmaId) return
    setLoading(true)
    setHata(null)
    try {
      const p = new URLSearchParams({ firma_id: firmaId })
      if (effectiveProjeId) p.set('proje_id', effectiveProjeId)
      if (baslangic) p.set('baslangic', baslangic)
      if (bitis)     p.set('bitis', bitis)
      const res  = await fetch(`/api/raporlar/musteri-degerlendirme?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.ok) setKayitlar(json.data)
      else setHata(json.error ?? 'Yüklenemedi')
    } finally { setLoading(false) }
  }

  useEffect(() => { yukle() }, [firmaId, effectiveProjeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtreliKayitlar = useMemo(() => {
    return kayitlar.filter(k => {
      if (filtreYildiz && k.yildiz !== filtreYildiz) return false
      if (filtreKanal !== 'TUMU' && k.kanal !== filtreKanal) return false
      return true
    })
  }, [kayitlar, filtreYildiz, filtreKanal])

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
    yukle()
  }

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
      yukle()
    } finally { setAksiyonLoading(false) }
  }

  async function sil(kayit: Kayit) {
    setAksiyonLoading(true)
    try {
      const res  = await fetch(`/api/raporlar/musteri-degerlendirme?id=${kayit.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.ok) { setHata(json.error ?? 'Silinemedi'); return }
      setSilKayit(null)
      yukle()
    } finally { setAksiyonLoading(false) }
  }

  const td = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '10px 14px', borderBottom: '1px solid #e8f0e8', fontSize: 13, verticalAlign: 'top', ...extra,
  })

  const aksBtn = (color: string, borderColor: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 7, border: `1px solid ${borderColor}`,
    cursor: 'pointer', background: 'none', color,
  })

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
            <h2 style={{ fontSize: 15, fontWeight: 900, color: '#0f1a0f', margin: 0 }}>Müşteri Değerlendirmeleri</h2>
            <button onClick={yukle} disabled={loading || !firmaId}
              style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #d6e4d6', background: '#f0f9f0', color: '#1f6b1f', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
              <RefreshCw size={13} style={loading ? spinning : {}} />
              {loading ? 'Yükleniyor…' : 'Yenile'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { label: 'Başlangıç', node: <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' }} /> },
              { label: 'Bitiş',     node: <input type="date" value={bitis}     onChange={e => setBitis(e.target.value)}     style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' }} /> },
              { label: 'Yıldız', node: (
                <select value={filtreYildiz} onChange={e => setFiltreYildiz(Number(e.target.value))}
                  style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: '100%', background: '#fff' }}>
                  <option value={0}>Tümü</option>
                  {[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)} — {YILDIZ_ETIKET[n]}</option>)}
                </select>
              )},
              { label: 'Kanal', node: (
                <select value={filtreKanal} onChange={e => setFiltreKanal(e.target.value as any)}
                  style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: '100%', background: '#fff' }}>
                  <option value="TUMU">Tümü</option>
                  <option value="QR">QR</option>
                  <option value="NFC">NFC</option>
                </select>
              )},
            ].map(({ label, node }) => (
              <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                {node}
              </label>
            ))}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button onClick={yukle} disabled={loading || !firmaId}
                style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1f6b1f', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, width: '100%' }}>
                Uygula
              </button>
            </div>
          </div>
        </div>

        {/* Özet kartları */}
        {ozet && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10 }}>
            {[
              { label: 'Toplam',     val: ozet.toplam,                    color: '#0f1a0f' },
              { label: 'Ort. Puan', val: ozet.ortYildiz.toFixed(1) + ' ★', color: '#d97706' },
              { label: 'Yorumlu',   val: ozet.yorumlu,                   color: '#1f6b1f' },
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

        {/* Tablo */}
        <div className="verde-card" style={{ overflow: 'hidden' }}>
          {!firmaId ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>Firma seçin</div>
          ) : loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} style={{ ...spinning, margin: '0 auto 12px', display: 'block', color: '#2e8b2e' }} />
              Yükleniyor…
            </div>
          ) : filtreliKayitlar.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
              Henüz değerlendirme yok
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1f6b1f' }}>
                    {['Tarih', 'Lokasyon (Üst > Alt)', 'Kanal', 'Puan', 'Yorum', 'Ad Soyad', 'Fotoğraf', 'İşlemler'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtreliKayitlar.map((k, i) => (
                    <tr key={k.id} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                      <td style={td({ whiteSpace: 'nowrap', color: '#64748b' })}>
                        {new Date(k.olusturma_tarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={td({ fontWeight: 600, color: '#0f1a0f' })}>{k.lokasyon_tanim}</td>
                      <td style={td()}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11.5, fontWeight: 700, background: k.kanal === 'QR' ? '#e0f2fe' : '#f0fdf4', color: k.kanal === 'QR' ? '#0369a1' : '#166534' }}>
                          {k.kanal}
                        </span>
                      </td>
                      <td style={td()}><YildizRow yildiz={k.yildiz} /></td>
                      <td style={td({ maxWidth: 280, color: '#334155' })}>
                        {k.yorum ? (
                          <span title={k.yorum} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                            {k.yorum}
                          </span>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={td({ color: k.ad_soyad ? '#0f1a0f' : '#cbd5e1' })}>{k.ad_soyad || '—'}</td>
                      <td style={td()}>
                        {k.gorsel_url ? (
                          <button onClick={() => setGorselModal(k.gorsel_url!)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            <img src={k.gorsel_url} alt="Görsel" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                          </button>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={td({ whiteSpace: 'nowrap' })}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button onClick={() => setDuzenleKayit(k)} title="Düzenle"       style={aksBtn('#1d4ed8', '#bfdbfe')}><Pencil size={13} /></button>
                          <button onClick={() => setArsivleKayit(k)} title="Arşivle"       style={aksBtn('#c2410c', '#fed7aa')}><RotateCcw size={13} /></button>
                          <button onClick={() => setSilKayit(k)}      title="Kalıcı Sil"   style={aksBtn('#dc2626', '#fecaca')}><Trash2 size={13} /></button>
                        </div>
                      </td>
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
