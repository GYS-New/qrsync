'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { LogIn, LogOut, Loader2, CheckCircle, XCircle, ShieldOff } from 'lucide-react'

type Durum = 'yukleniyor' | 'hazir' | 'islemde' | 'basarili' | 'hata' | 'yetki_yok'

interface TokenBilgi {
  tip: 'GIRIS' | 'CIKIS'
  firma_adi: string
  proje_adi: string | null
}

export default function MesaiTokenPage() {
  const { token } = useParams() as { token: string }

  const [durum, setDurum] = useState<Durum>('yukleniyor')
  const [bilgi, setBilgi] = useState<TokenBilgi | null>(null)
  const [mesaj, setMesaj] = useState('')
  const [isim,  setIsim]  = useState('')

  useEffect(() => {
    // Önce oturum/cihaz yetkisi kontrol et
    fetch('/api/auth/me')
      .then(r => {
        if (!r.ok) {
          // Oturum yok → hiç token bilgisi yükleme, direkt yetki_yok
          setDurum('yetki_yok')
          return null
        }
        return r.json()
      })
      .then(me => {
        if (!me) return
        // Oturum var → token bilgisini yükle
        return fetch(`/api/mesai/tarat/${token}`)
          .then(r => r.json())
          .then(json => {
            if (!json.ok) { setDurum('hata'); setMesaj(json.error ?? 'Geçersiz QR kodu'); return }
            setBilgi(json)
            setDurum('hazir')
          })
      })
      .catch(() => { setDurum('hata'); setMesaj('Sunucuya ulaşılamadı') })
  }, [token])

  async function tarat() {
    setDurum('islemde')
    try {
      const res  = await fetch(`/api/mesai/tarat/${token}`, { method: 'POST' })
      const json = await res.json()

      if ((res.status === 401 || res.status === 403) && json.requireAuth) {
        setDurum('yetki_yok')
        return
      }

      if (!json.ok) {
        // Özel durumlar: tekrar giriş / çıkış denenmiş
        if (json.durum === 'zaten_acik') {
          setDurum('hata')
          setMesaj('Bugün için zaten iş başı yapıldı. Önce iş bitimi yapmanız gerekiyor.')
          return
        }
        if (json.durum === 'kayit_yok') {
          setDurum('hata')
          setMesaj('Henüz iş başı yapmadınız. Önce iş başı yapmanız gerekiyor.')
          return
        }
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

        {/* İkon */}
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background:
            durum === 'basarili'  ? '#dcfce7' :
            durum === 'hata'      ? '#fee2e2' :
            durum === 'yetki_yok' ? '#fef3c7' :
            isGiris               ? '#dbeafe' : '#fef3c7',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          {durum === 'yukleniyor' || durum === 'islemde'
            ? <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#475569' }} />
            : durum === 'basarili'
            ? <CheckCircle size={32} color="#16a34a" />
            : durum === 'hata'
            ? <XCircle size={32} color="#dc2626" />
            : durum === 'yetki_yok'
            ? <ShieldOff size={32} color="#d97706" />
            : isGiris
            ? <LogIn size={32} color="#1d4ed8" />
            : <LogOut size={32} color="#d97706" />
          }
        </div>

        {/* Yükleniyor */}
        {durum === 'yukleniyor' && (
          <p style={{ color: '#64748b', fontSize: 15 }}>Doğrulanıyor…</p>
        )}

        {/* Hazır — yetkili kullanıcıya göster */}
        {durum === 'hazir' && bilgi && (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#111827', marginBottom: 6 }}>
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
                marginTop: 16,
              }}>
              {isGiris ? <><LogIn size={20} /> İş Başı Yap</> : <><LogOut size={20} /> İş Bitimi Yap</>}
            </button>
          </>
        )}

        {/* İşleniyor */}
        {durum === 'islemde' && (
          <p style={{ color: '#64748b', fontSize: 15 }}>İşleniyor…</p>
        )}

        {/* Yetkisiz */}
        {durum === 'yetki_yok' && (
          <>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#d97706', marginBottom: 8 }}>
              Yetkisiz Erişim
            </div>
            <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
              Bu işlem için yetkiniz yok.
            </div>
          </>
        )}

        {/* Başarılı */}
        {durum === 'basarili' && (
          <>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#16a34a', marginBottom: 8 }}>{mesaj}</div>
            {isim && <div style={{ fontSize: 15, color: '#475569', marginBottom: 20 }}>Hoş geldin, {isim} 👋</div>}
            <button onClick={() => setDurum('hazir')}
              style={{ fontSize: 13, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Tekrar tarat
            </button>
          </>
        )}

        {/* Hata */}
        {durum === 'hata' && (
          <>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>İşlem Başarısız</div>
            <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 20 }}>{mesaj}</div>
            <button onClick={() => setDurum('hazir')}
              style={{ fontSize: 13, color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Geri dön
            </button>
          </>
        )}

        <div style={{ marginTop: 28, fontSize: 11, color: '#cbd5e1' }}>QRSync Personel Takip Sistemi</div>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
