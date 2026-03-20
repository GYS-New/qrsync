'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { LogIn, LogOut, Loader2, CheckCircle, XCircle } from 'lucide-react'

type Durum = 'yukleniyor' | 'hazir' | 'islemde' | 'basarili' | 'hata' | 'yetki_yok'

interface TokenBilgi {
  tip: 'GIRIS' | 'CIKIS'
  firma_adi: string
  proje_adi: string | null
}

export default function MesaiTokenPage() {
  const { token } = useParams() as { token: string }
  const router    = useRouter()

  const [durum,    setDurum]    = useState<Durum>('yukleniyor')
  const [bilgi,    setBilgi]    = useState<TokenBilgi | null>(null)
  const [mesaj,    setMesaj]    = useState('')
  const [isim,     setIsim]     = useState('')

  useEffect(() => {
    fetch(`/api/mesai/tarat/${token}`)
      .then(r => r.json())
      .then(json => {
        if (!json.ok) { setDurum('hata'); setMesaj(json.error ?? 'Geçersiz QR kodu'); return }
        setBilgi(json)
        setDurum('hazir')
      })
      .catch(() => { setDurum('hata'); setMesaj('Sunucuya ulaşılamadı') })
  }, [token])

  async function tarat() {
    setDurum('islemde')
    try {
      const res  = await fetch(`/api/mesai/tarat/${token}`, { method: 'POST' })
      const json = await res.json()

      if (res.status === 401 && json.requireAuth) {
        router.push(`/login?redirect=/mesai/${token}`)
        return
      }

      if (!json.ok) {
        setDurum('hata')
        setMesaj(json.error ?? 'İşlem başarısız')
        return
      }

      setIsim(json.isim ?? '')
      setDurum('basarili')
      setMesaj(json.sonuc === 'giris' ? 'İş başı yapıldı' : 'İş bitimi yapıldı')
    } catch {
      setDurum('hata')
      setMesaj('Bağlantı hatası')
    }
  }

  const isGiris = bilgi?.tip === 'GIRIS'

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg,#f0fdf0 0%,#dcfce7 100%)',
      fontFamily: 'Inter, system-ui, sans-serif', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '40px 32px',
        maxWidth: 380, width: '100%', textAlign: 'center',
        boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
      }}>

        {/* Logo / ikon */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: durum === 'basarili' ? '#dcfce7' : durum === 'hata' ? '#fee2e2' : isGiris ? '#dbeafe' : '#fef3c7',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          {durum === 'yukleniyor' || durum === 'islemde'
            ? <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#475569' }} />
            : durum === 'basarili'
            ? <CheckCircle size={32} color="#16a34a" />
            : durum === 'hata'
            ? <XCircle size={32} color="#dc2626" />
            : isGiris
            ? <LogIn size={32} color="#1d4ed8" />
            : <LogOut size={32} color="#d97706" />
          }
        </div>

        {/* İçerik */}
        {durum === 'yukleniyor' && (
          <p style={{ color: '#64748b', fontSize: 15 }}>QR kodu doğrulanıyor…</p>
        )}

        {durum === 'hazir' && bilgi && (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f1a0f', marginBottom: 6 }}>
              {isGiris ? '🟢 İş Başı' : '🔴 İş Bitimi'}
            </div>
            <div style={{ fontSize: 14, color: '#475569', marginBottom: 4 }}>{bilgi.firma_adi}</div>
            {bilgi.proje_adi && (
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>{bilgi.proje_adi}</div>
            )}
            <button onClick={tarat}
              style={{
                width: '100%', height: 52, borderRadius: 12, border: 'none',
                background: isGiris ? '#1d4ed8' : '#d97706',
                color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
              {isGiris ? <><LogIn size={20} /> İş Başı Yap</> : <><LogOut size={20} /> İş Bitimi Yap</>}
            </button>
          </>
        )}

        {durum === 'islemde' && (
          <p style={{ color: '#64748b', fontSize: 15 }}>İşleniyor…</p>
        )}

        {durum === 'basarili' && (
          <>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#16a34a', marginBottom: 8 }}>{mesaj}</div>
            {isim && <div style={{ fontSize: 15, color: '#475569', marginBottom: 20 }}>Hoş geldin, {isim} 👋</div>}
            <button onClick={() => { setDurum('hazir') }}
              style={{ fontSize: 13, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Tekrar tarat
            </button>
          </>
        )}

        {durum === 'hata' && (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Hata</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>{mesaj}</div>
            <button onClick={() => setDurum('hazir')}
              style={{ fontSize: 13, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Tekrar dene
            </button>
          </>
        )}

        <div style={{ marginTop: 28, fontSize: 11, color: '#cbd5e1' }}>QRSync Personel Takip Sistemi</div>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
