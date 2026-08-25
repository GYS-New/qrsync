/**
 * Public sayfa: personel push bildirimden acar. Token bazli, auth gerekmez.
 * URL: /mesai/cikis-onay/[token]
 *
 * Mobil (Capacitor) push data.link ile bu sayfaya yonlendirir; web browser'da
 * da ayni sayfa acilir. Iki buton: Cikisimi Yap / Devam Ediyorum.
 */
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  params: { token: string }
}

export default function CikisOnayPage({ params }: Props) {
  const router = useRouter()
  const [durum, setDurum] = useState<'karar_bekliyor' | 'gonderiliyor' | 'basarili' | 'hata'>('karar_bekliyor')
  const [mesaj, setMesaj] = useState<string>('')
  const [saatGosterim, setSaatGosterim] = useState<string>('')

  useEffect(() => {
    setSaatGosterim(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))
    const t = setInterval(() => {
      setSaatGosterim(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))
    }, 30_000)
    return () => clearInterval(t)
  }, [])

  async function karar(k: 'kapat' | 'devam') {
    setDurum('gonderiliyor')
    setMesaj('')
    try {
      const res = await fetch('/api/mesai/cikis-onay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, karar: k }),
      })
      const json = await res.json()
      if (json.ok) {
        setDurum('basarili')
        setMesaj(json.mesaj ?? 'İşlem başarılı.')
      } else {
        setDurum('hata')
        setMesaj(json.error ?? 'Bir hata oluştu.')
      }
    } catch (e: any) {
      setDurum('hata')
      setMesaj(e?.message ?? 'Bağlantı hatası.')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f4f8, #dfe7ef)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: 440,
        width: '100%',
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
        padding: '28px 24px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🚪</div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
            İş Çıkışı Onayı
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
            Şu an: {saatGosterim}
          </div>
        </div>

        {durum === 'karar_bekliyor' && (
          <>
            <div style={{
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              color: '#92400e',
              borderRadius: 10,
              padding: '14px 16px',
              fontSize: 14,
              lineHeight: 1.5,
              marginBottom: 20,
            }}>
              <strong>Vardiyanız bittiği hâlde iş çıkış QR/NFC'nizi okutmadınız.</strong>
              <div style={{ marginTop: 8 }}>
                • Çalışmıyorsanız <strong>"Çıkışımı Yap"</strong> deyin, sistem sizin yerinize çıkış saatini yazacak.
              </div>
              <div style={{ marginTop: 4 }}>
                • Fazla mesai yapıyorsanız <strong>"Devam Ediyorum"</strong> deyin, çıkışı manuel yapacaksınız.
              </div>
              <div style={{ marginTop: 10, fontSize: 12.5, color: '#78350f' }}>
                Karar vermezseniz vardiya bitişinden 30 dk sonra çıkışınız otomatik yapılır.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => karar('kapat')}
                style={{
                  padding: '14px 20px', borderRadius: 12,
                  border: 'none', background: '#dc2626', color: '#fff',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(220,38,38,0.24)',
                }}>
                🚪 Çıkışımı Yap
              </button>
              <button onClick={() => karar('devam')}
                style={{
                  padding: '14px 20px', borderRadius: 12,
                  border: '2px solid #0ea5e9', background: '#fff', color: '#0ea5e9',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer',
                }}>
                ⏱ Devam Ediyorum
              </button>
            </div>
          </>
        )}

        {durum === 'gonderiliyor' && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b' }}>
            <div style={{
              width: 40, height: 40, margin: '0 auto 12px',
              border: '3px solid #e2e8f0', borderTopColor: '#0ea5e9',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            Gönderiliyor…
          </div>
        )}

        {durum === 'basarili' && (
          <div style={{
            background: '#dcfce7', border: '1px solid #86efac',
            color: '#166534', borderRadius: 10,
            padding: '18px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{mesaj}</div>
            <button onClick={() => router.push('/')} style={{
              marginTop: 16, padding: '10px 20px', borderRadius: 8,
              border: 'none', background: '#166534', color: '#fff',
              fontWeight: 600, cursor: 'pointer', fontSize: 14,
            }}>
              Kapat
            </button>
          </div>
        )}

        {durum === 'hata' && (
          <div style={{
            background: '#fee2e2', border: '1px solid #fca5a5',
            color: '#991b1b', borderRadius: 10,
            padding: '18px 16px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{mesaj}</div>
            <button onClick={() => setDurum('karar_bekliyor')} style={{
              marginTop: 14, padding: '10px 20px', borderRadius: 8,
              border: '1px solid #991b1b', background: '#fff', color: '#991b1b',
              fontWeight: 600, cursor: 'pointer', fontSize: 13,
            }}>
              Tekrar Dene
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  )
}
