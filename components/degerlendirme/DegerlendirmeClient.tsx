'use client'

import { useEffect, useRef, useState } from 'react'

type Durum = 'yukleniyor' | 'form' | 'gonderildi' | 'hata'

interface LokasyonInfo {
  id: string
  tanim: string
  ust_tanim: string | null
}

export default function DegerlendirmeClient({ token }: { token: string }) {
  const [durum, setDurum]             = useState<Durum>('yukleniyor')
  const [hata, setHata]               = useState('')
  const [lokasyon, setLokasyon]       = useState<LokasyonInfo | null>(null)
  const [firmaAdi, setFirmaAdi]       = useState('')
  const [yildiz, setYildiz]           = useState(0)
  const [yildizHover, setYildizHover] = useState(0)
  const [yorum, setYorum]             = useState('')
  const [adSoyad, setAdSoyad]         = useState('')
  const [gorselUrl, setGorselUrl]     = useState<string | null>(null)
  const [gorselYuk, setGorselYuk]     = useState(false)
  const [gonderiyor, setGonderiyor]   = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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

  async function gorselSec(file: File) {
    setGorselYuk(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/degerlendirme/gorsel-yukle', { method: 'POST', body: fd })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setGorselUrl(json.url)
    } catch (e: any) { alert(e.message ?? 'Görsel yüklenemedi') }
    setGorselYuk(false)
  }

  async function gonder() {
    if (!yildiz) { alert('Lütfen bir puan seçin'); return }
    setGonderiyor(true)
    try {
      const res = await fetch(`/api/degerlendirme/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yildiz, yorum: yorum.trim() || null, ad_soyad: adSoyad.trim() || null, gorsel_url: gorselUrl }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setDurum('gonderildi')
    } catch (e: any) { alert(e.message ?? 'Gönderilemedi, lütfen tekrar deneyin') }
    setGonderiyor(false)
  }

  const S = {
    page:   { minHeight: '100dvh', background: '#f0f4f0', display: 'flex' as const, justifyContent: 'center' as const, padding: '20px 16px 48px' },
    card:   { width: '100%', maxWidth: 440, background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', overflow: 'hidden' as const, alignSelf: 'flex-start' as const },
    head:   (bg = '#1f6b1f') => ({ background: bg, padding: '24px 22px 20px', color: '#fff' }),
    body:   { padding: '22px 22px 32px', display: 'flex' as const, flexDirection: 'column' as const, gap: 18 },
    label:  { fontSize: 13, fontWeight: 600 as const, color: '#334155', marginBottom: 5, display: 'block' as const },
    input:  { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' },
    ta:     { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 15, outline: 'none', resize: 'vertical' as const, minHeight: 96, boxSizing: 'border-box' as const, fontFamily: 'inherit' },
    btn:    (dis: boolean) => ({ width: '100%', padding: 15, borderRadius: 12, border: 'none', background: '#1f6b1f', color: '#fff', fontSize: 16, fontWeight: 700 as const, cursor: dis ? 'not-allowed' as const : 'pointer' as const, opacity: dis ? 0.55 : 1, marginTop: 4 }),
    dashed: { width: '100%', padding: 14, borderRadius: 10, border: '1.5px dashed #d1d5db', background: '#f8fafc', color: '#64748b', fontSize: 14, cursor: 'pointer' as const, display: 'flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8 },
  }

  if (durum === 'yukleniyor') return (
    <div style={{ ...S.page, alignItems: 'center' }}>
      <div style={{ textAlign: 'center', color: '#64748b' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
        <div>Yükleniyor…</div>
      </div>
    </div>
  )

  if (durum === 'hata') return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.head('#dc2626')}>
          <div style={{ fontSize: 26, marginBottom: 6 }}>⚠️</div>
          <div style={{ fontSize: 19, fontWeight: 800 }}>Erişim Sağlanamadı</div>
        </div>
        <div style={{ padding: '22px', color: '#475569', fontSize: 15, lineHeight: 1.7 }}>{hata}</div>
      </div>
    </div>
  )

  if (durum === 'gonderildi') return (
    <div style={S.page}>
      <div style={{ ...S.card, textAlign: 'center' }}>
        <div style={S.head()}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 21, fontWeight: 900 }}>Teşekkürler!</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>Değerlendirmeniz alındı</div>
        </div>
        <div style={{ padding: '28px 22px', color: '#475569', fontSize: 15, lineHeight: 1.75 }}>
          <strong>{lokasyon?.tanim}</strong> için değerlendirmenizi ilettiğiniz için teşekkür ederiz.<br />
          Geri bildiriminiz hizmet kalitemizi geliştirmemize yardımcı olacak.
        </div>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      <div style={S.card}>

        {/* Header */}
        <div style={S.head()}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 2, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{firmaAdi}</div>
          <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.2 }}>{lokasyon?.tanim}</div>
          {lokasyon?.ust_tanim && <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>{lokasyon.ust_tanim}</div>}
          <div style={{ marginTop: 10, fontSize: 13.5, opacity: 0.85 }}>Hizmet değerlendirmenizi paylaşın</div>
        </div>

        <div style={S.body}>

          {/* Yıldız */}
          <div>
            <span style={S.label}>Değerlendirme Puanı *</span>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '6px 0' }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button"
                  onClick={() => setYildiz(n)}
                  onMouseEnter={() => setYildizHover(n)}
                  onMouseLeave={() => setYildizHover(0)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                >
                  <svg width="46" height="46" viewBox="0 0 24 24">
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
                {['','Çok Kötü','Kötü','Orta','İyi','Mükemmel'][yildiz]}
              </div>
            )}
          </div>

          {/* Yorum */}
          <div>
            <span style={S.label}>Yorumunuz <span style={{ fontWeight: 400, color: '#94a3b8' }}>(isteğe bağlı)</span></span>
            <textarea style={S.ta} placeholder="Deneyiminizi paylaşın…" value={yorum}
              onChange={e => setYorum(e.target.value)} maxLength={1000} />
            <div style={{ fontSize: 11.5, color: '#94a3b8', textAlign: 'right' as const, marginTop: 3 }}>{yorum.length}/1000</div>
          </div>

          {/* Ad */}
          <div>
            <span style={S.label}>Adınız <span style={{ fontWeight: 400, color: '#94a3b8' }}>(isteğe bağlı)</span></span>
            <input style={S.input} type="text" placeholder="Ad Soyad" value={adSoyad}
              onChange={e => setAdSoyad(e.target.value)} maxLength={100} />
          </div>

          {/* Görsel */}
          <div>
            <span style={S.label}>Fotoğraf <span style={{ fontWeight: 400, color: '#94a3b8' }}>(isteğe bağlı, maks 5MB)</span></span>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) gorselSec(f); e.target.value = '' }} />
            {gorselUrl ? (
              <div style={{ position: 'relative' as const }}>
                <img src={gorselUrl} alt="Yüklenen görsel"
                  style={{ width: '100%', maxHeight: 220, objectFit: 'cover' as const, borderRadius: 10, border: '1.5px solid #d1d5db', display: 'block' }} />
                <button type="button" onClick={() => setGorselUrl(null)}
                  style={{ position: 'absolute' as const, top: 8, right: 8, width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  ×
                </button>
              </div>
            ) : (
              <button type="button" style={S.dashed} onClick={() => fileRef.current?.click()} disabled={gorselYuk}>
                {gorselYuk ? '⏳ Yükleniyor…' : '📷 Fotoğraf Ekle'}
              </button>
            )}
          </div>

          {/* Gönder */}
          <button type="button" style={S.btn(gonderiyor || !yildiz)} onClick={gonder} disabled={gonderiyor || !yildiz}>
            {gonderiyor ? 'Gönderiliyor…' : 'Değerlendirmeyi Gönder'}
          </button>

        </div>
      </div>
    </div>
  )
}
