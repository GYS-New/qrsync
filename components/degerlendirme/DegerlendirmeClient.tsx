'use client'

import { useEffect, useRef, useState } from 'react'

type Durum = 'yukleniyor' | 'form' | 'gonderildi' | 'hata'
type Dil = 'tr' | 'en'

interface LokasyonInfo {
  id: string
  tanim: string
  ust_tanim: string | null
}

// Çeviriler — tek nokta, kolay bakım. Yeni dil eklemek için buraya ekle.
const I18N = {
  tr: {
    subtitle: 'Hizmet değerlendirmenizi paylaşın',
    ratingLabel: 'Değerlendirme Puanı',
    ratingLevels: ['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel'],
    commentLabel: 'Yorumunuz',
    commentPlaceholder: 'Deneyiminizi paylaşın…',
    nameLabel: 'Adınız',
    namePlaceholder: 'Ad Soyad',
    gsmLabel: 'GSM',
    gsmPlaceholder: '05XX XXX XX XX',
    photoLabel: 'Fotoğraf',
    photoHint: 'isteğe bağlı, maks 5MB',
    photoAdd: '📷 Fotoğraf Ekle',
    photoLoading: '⏳ Yükleniyor…',
    optional: 'isteğe bağlı',
    submit: 'Değerlendirmeyi Gönder',
    submitting: 'Gönderiliyor…',
    loading: 'Yükleniyor…',
    successTitle: 'Teşekkürler!',
    successMsg1: 'Değerlendirmeniz alındı',
    successMsg2: 'için değerlendirmenizi ilettiğiniz için teşekkür ederiz.',
    successMsg3: 'Geri bildiriminiz hizmet kalitemizi geliştirmemize yardımcı olacak.',
    errorTitle: 'Erişim Sağlanamadı',
    ratingRequired: 'Lütfen bir puan seçin',
    photoFailed: 'Görsel yüklenemedi',
    gsmInvalid: 'GSM numarası en az 10 rakam içermeli',
  },
  en: {
    subtitle: 'Share your service feedback',
    ratingLabel: 'Rating',
    ratingLevels: ['', 'Very Bad', 'Bad', 'Average', 'Good', 'Excellent'],
    commentLabel: 'Your Comment',
    commentPlaceholder: 'Share your experience…',
    nameLabel: 'Your Name',
    namePlaceholder: 'Full Name',
    gsmLabel: 'Phone',
    gsmPlaceholder: '+90 5XX XXX XX XX',
    photoLabel: 'Photo',
    photoHint: 'optional, max 5MB',
    photoAdd: '📷 Add Photo',
    photoLoading: '⏳ Uploading…',
    optional: 'optional',
    submit: 'Submit Review',
    submitting: 'Submitting…',
    loading: 'Loading…',
    successTitle: 'Thank You!',
    successMsg1: 'Your review has been received',
    successMsg2: '— thank you for your feedback.',
    successMsg3: 'Your input helps us improve our service quality.',
    errorTitle: 'Access Denied',
    ratingRequired: 'Please select a rating',
    photoFailed: 'Image upload failed',
    gsmInvalid: 'Phone must contain at least 10 digits',
  },
} as const

const DIL_KEY = 'iogys.degerlendirme.dil'

function ilkDil(): Dil {
  if (typeof window === 'undefined') return 'tr'
  const kayit = window.localStorage.getItem(DIL_KEY)
  if (kayit === 'tr' || kayit === 'en') return kayit
  const nav = navigator.language?.slice(0, 2).toLowerCase()
  return nav === 'en' ? 'en' : 'tr'
}

export default function DegerlendirmeClient({ token }: { token: string }) {
  const [dil, setDil]                 = useState<Dil>('tr')  // ilk render TR, mount'ta düzenlenir
  const [durum, setDurum]             = useState<Durum>('yukleniyor')
  const [hata, setHata]               = useState('')
  const [lokasyon, setLokasyon]       = useState<LokasyonInfo | null>(null)
  const [firmaAdi, setFirmaAdi]       = useState('')
  const [yildiz, setYildiz]           = useState(0)
  const [yildizHover, setYildizHover] = useState(0)
  const [yorum, setYorum]             = useState('')
  const [adSoyad, setAdSoyad]         = useState('')
  const [gsm, setGsm]                 = useState('')
  const [gorselUrl, setGorselUrl]     = useState<string | null>(null)
  const [gorselYuk, setGorselYuk]     = useState(false)
  const [gonderiyor, setGonderiyor]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const L = I18N[dil]

  // Dil tercihini mount sonrası ayarla (hydration mismatch olmasın diye)
  useEffect(() => { setDil(ilkDil()) }, [])

  useEffect(() => {
    fetch(`/api/degerlendirme/${token}`)
      .then(r => r.json())
      .then(json => {
        if (!json.ok) { setHata(json.error ?? 'Bir hata oluştu'); setDurum('hata'); return }
        setLokasyon(json.lokasyon)
        setFirmaAdi(json.firma.adi)
        setDurum('form')
      })
      .catch(() => { setHata('Bağlantı hatası oluştu'); setDurum('hata') })
  }, [token])

  function dilDegistir(y: Dil) {
    setDil(y)
    try { window.localStorage.setItem(DIL_KEY, y) } catch {}
  }

  async function gorselSec(file: File) {
    setGorselYuk(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/degerlendirme/gorsel-yukle', { method: 'POST', body: fd })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setGorselUrl(json.url)
    } catch (e: any) { alert(e.message ?? L.photoFailed) }
    setGorselYuk(false)
  }

  async function gonder() {
    if (!yildiz) { alert(L.ratingRequired); return }
    // GSM opsiyonel; verildiyse min 10 rakam
    if (gsm.trim() && gsm.replace(/\D/g, '').length < 10) {
      alert(L.gsmInvalid); return
    }
    setGonderiyor(true)
    try {
      const res = await fetch(`/api/degerlendirme/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yildiz,
          yorum: yorum.trim() || null,
          ad_soyad: adSoyad.trim() || null,
          gsm: gsm.trim() || null,
          gorsel_url: gorselUrl,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setDurum('gonderildi')
    } catch (e: any) { alert(e.message ?? 'Gönderilemedi') }
    setGonderiyor(false)
  }

  const S = {
    page:   { minHeight: '100dvh', background: '#f0f4f0', display: 'flex' as const, justifyContent: 'center' as const, padding: '16px 16px 40px' },
    card:   { width: '100%', maxWidth: 440, background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', overflow: 'hidden' as const, alignSelf: 'flex-start' as const },
    head:   (bg = '#1f2937') => ({ background: bg, padding: '18px 22px 16px', color: '#fff', position: 'relative' as const }),
    body:   { padding: '18px 22px 26px', display: 'flex' as const, flexDirection: 'column' as const, gap: 14 },
    label:  { fontSize: 13, fontWeight: 600 as const, color: '#334155', marginBottom: 5, display: 'block' as const },
    input:  { width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
    ta:     { width: '100%', padding: '11px 14px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 15, outline: 'none', resize: 'vertical' as const, minHeight: 80, boxSizing: 'border-box' as const, fontFamily: 'inherit' },
    btn:    (dis: boolean) => ({ width: '100%', padding: 13, borderRadius: 12, border: 'none', background: '#1f2937', color: '#fff', fontSize: 16, fontWeight: 700 as const, cursor: dis ? 'not-allowed' as const : 'pointer' as const, opacity: dis ? 0.55 : 1, marginTop: 2 }),
    dashed: { width: '100%', padding: 12, borderRadius: 10, border: '1.5px dashed #d1d5db', background: '#f8fafc', color: '#64748b', fontSize: 14, cursor: 'pointer' as const, display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 },
    // Dil pill — header sağ-üst köşesinde. Dokunma hedefi mobilde min 40px
    // olmalı, aksi halde parmak isabet ettiremez ve "hassas değil" hissi verir.
    // Ayrıca touchAction: manipulation ile 300ms iOS click gecikmesi kalkar,
    // -webkit-tap-highlight ile de görsel geribildirim netleşir.
    dilPill: {
      position: 'absolute' as const, top: 10, right: 12,
      display: 'inline-flex' as const, background: 'rgba(255,255,255,0.18)',
      borderRadius: 999, padding: 3,
    },
    dilBtn:  (aktif: boolean) => ({
      minWidth: 44, minHeight: 34, padding: '7px 14px', borderRadius: 999,
      border: 'none', cursor: 'pointer' as const,
      background: aktif ? '#fff' : 'transparent',
      color: aktif ? '#1f2937' : 'rgba(255,255,255,0.92)',
      fontSize: 12.5, fontWeight: 800 as const, letterSpacing: '0.04em',
      touchAction: 'manipulation' as const,
      WebkitTapHighlightColor: 'rgba(255,255,255,0.3)' as any,
      transition: 'background 0.15s',
    }),
  }

  const DilPill = (
    <div style={S.dilPill}>
      <button type="button" style={S.dilBtn(dil === 'tr')} onClick={() => dilDegistir('tr')}>TR</button>
      <button type="button" style={S.dilBtn(dil === 'en')} onClick={() => dilDegistir('en')}>EN</button>
    </div>
  )

  if (durum === 'yukleniyor') return (
    <div style={{ ...S.page, alignItems: 'center' }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
        <div>{L.loading}</div>
      </div>
    </div>
  )

  if (durum === 'hata') return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.head('#dc2626')}>
          {DilPill}
          <div style={{ fontSize: 26, marginBottom: 6 }}>⚠️</div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>{L.errorTitle}</div>
        </div>
        <div style={{ padding: '22px', color: '#475569', fontSize: 15, lineHeight: 1.7 }}>{hata}</div>
      </div>
    </div>
  )

  if (durum === 'gonderildi') return (
    <div style={S.page}>
      <div style={{ ...S.card, textAlign: 'center' }}>
        <div style={S.head()}>
          {DilPill}
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 21, fontWeight: 900 }}>{L.successTitle}</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>{L.successMsg1}</div>
        </div>
        <div style={{ padding: '24px 22px', color: '#475569', fontSize: 15, lineHeight: 1.75 }}>
          <strong>{lokasyon?.tanim}</strong> {L.successMsg2}<br />
          {L.successMsg3}
        </div>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      <div style={S.card}>

        {/* Header */}
        <div style={S.head()}>
          {DilPill}
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em', paddingRight: 108 }}>{firmaAdi}</div>
          <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.2, paddingRight: 108 }}>{lokasyon?.tanim}</div>
          {lokasyon?.ust_tanim && <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>{lokasyon.ust_tanim}</div>}
          <div style={{ marginTop: 8, fontSize: 13.5, opacity: 0.85 }}>{L.subtitle}</div>
        </div>

        <div style={S.body}>

          {/* Yıldız */}
          <div>
            <span style={S.label}>{L.ratingLabel} *</span>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '4px 0' }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button"
                  onClick={() => setYildiz(n)}
                  onMouseEnter={() => setYildizHover(n)}
                  onMouseLeave={() => setYildizHover(0)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                >
                  <svg width="42" height="42" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                      fill={(yildizHover || yildiz) >= n ? '#f59e0b' : '#e2e8f0'}
                      stroke={(yildizHover || yildiz) >= n ? '#d97706' : '#cbd5e1'}
                      strokeWidth="1" />
                  </svg>
                </button>
              ))}
            </div>
            {yildiz > 0 && (
              <div style={{ textAlign: 'center', fontSize: 13.5, color: '#64748b', marginTop: 2, fontWeight: 600 }}>
                {L.ratingLevels[yildiz]}
              </div>
            )}
          </div>

          {/* Yorum */}
          <div>
            <span style={S.label}>{L.commentLabel} <span style={{ fontWeight: 400, color: '#94a3b8' }}>({L.optional})</span></span>
            <textarea style={S.ta} placeholder={L.commentPlaceholder} value={yorum}
              onChange={e => setYorum(e.target.value)} maxLength={1000} />
            <div style={{ fontSize: 11.5, color: '#94a3b8', textAlign: 'right' as const, marginTop: 3 }}>{yorum.length}/1000</div>
          </div>

          {/* Ad */}
          <div>
            <span style={S.label}>{L.nameLabel} <span style={{ fontWeight: 400, color: '#94a3b8' }}>({L.optional})</span></span>
            <input style={S.input} type="text" placeholder={L.namePlaceholder} value={adSoyad}
              onChange={e => setAdSoyad(e.target.value)} maxLength={100} />
          </div>

          {/* GSM */}
          <div>
            <span style={S.label}>{L.gsmLabel} <span style={{ fontWeight: 400, color: '#94a3b8' }}>({L.optional})</span></span>
            <input style={S.input} type="tel" placeholder={L.gsmPlaceholder}
              inputMode="tel" autoComplete="tel"
              value={gsm} onChange={e => setGsm(e.target.value)} maxLength={40} />
          </div>

          {/* Görsel */}
          <div>
            <span style={S.label}>{L.photoLabel} <span style={{ fontWeight: 400, color: '#94a3b8' }}>({L.photoHint})</span></span>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) gorselSec(f); e.target.value = '' }} />
            {gorselUrl ? (
              <div style={{ position: 'relative' as const }}>
                <img src={gorselUrl} alt=""
                  style={{ width: '100%', maxHeight: 200, objectFit: 'cover' as const, borderRadius: 10, border: '1.5px solid #d1d5db', display: 'block' }} />
                <button type="button" onClick={() => setGorselUrl(null)}
                  style={{ position: 'absolute' as const, top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ×
                </button>
              </div>
            ) : (
              <button type="button" style={S.dashed} onClick={() => fileRef.current?.click()} disabled={gorselYuk}>
                {gorselYuk ? L.photoLoading : L.photoAdd}
              </button>
            )}
          </div>

          {/* Gönder */}
          <button type="button" style={S.btn(gonderiyor || !yildiz)} onClick={gonder} disabled={gonderiyor || !yildiz}>
            {gonderiyor ? L.submitting : L.submit}
          </button>

        </div>
      </div>
    </div>
  )
}
