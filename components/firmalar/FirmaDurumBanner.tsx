'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, XCircle, Clock } from 'lucide-react'

type Durum = 'pasif' | 'lisans_doldu' | null

interface Props {
  durum: Durum
  lisansTarihi?: string | null
}

export default function FirmaDurumBanner({ durum, lisansTarihi }: Props) {
  const router = useRouter()
  const [popupKapali, setPopupKapali] = useState(false)

  // Her mount'ta popup göster (sayfa değişimlerinde yeniden)
  useEffect(() => {
    setPopupKapali(false)
  }, [durum])

  if (!durum) return null

  const config = {
    pasif: {
      renk:     '#dc2626',
      bg:       '#fef2f2',
      border:   '#fecaca',
      ikon:     <XCircle size={22} color="#dc2626" />,
      baslik:   'Sistem Pasif Edildi',
      mesaj:    'Firmanız sistem yöneticisi tarafından pasif edilmiştir. Erişim kısıtlanmıştır.',
      detay:    'Lütfen sistem yöneticinizle iletişime geçin.',
    },
    lisans_doldu: {
      renk:     '#d97706',
      bg:       '#fffbeb',
      border:   '#fde68a',
      ikon:     <Clock size={22} color="#d97706" />,
      baslik:   'Lisans Süreniz Doldu',
      mesaj:    `Lisans süreniz ${lisansTarihi ? new Date(lisansTarihi).toLocaleDateString('tr-TR') + ' tarihinde' : ''} dolmuştur. Erişim kısıtlanmıştır.`,
      detay:    'Lisansınızı yenilemek için sistem yöneticinizle iletişime geçin.',
    },
  }[durum]

  return (
    <>
      {/* Kalıcı banner — her sayfada üstte görünür */}
      <div style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: 10,
        padding: '12px 18px',
        margin: '16px 28px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        {config.ikon}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: config.renk }}>{config.baslik}</div>
          <div style={{ fontSize: 12.5, color: '#506050', marginTop: 2 }}>{config.detay}</div>
        </div>
        <button
          onClick={() => router.push('/ta/dashboard/firma-ayarlar')}
          style={{
            padding: '5px 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 700,
            background: config.renk, color: '#fff', border: 'none', cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Detaylar
        </button>
      </div>

      {/* Popup — ilk açılışta gösterilir */}
      {!popupKapali && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '32px 28px',
            maxWidth: 440, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            border: `2px solid ${config.border}`,
            animation: 'fadeUp 300ms ease both',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 14, background: config.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {config.ikon}
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: '#0f1a0f', lineHeight: 1.2 }}>
                {config.baslik}
              </div>
            </div>

            <div style={{ fontSize: 14.5, color: '#334155', lineHeight: 1.7, marginBottom: 8 }}>
              {config.mesaj}
            </div>
            <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6, marginBottom: 24 }}>
              {config.detay}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setPopupKapali(true); router.push('/ta/dashboard/firma-ayarlar') }}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 9, fontSize: 14, fontWeight: 700,
                  background: config.renk, color: '#fff', border: 'none', cursor: 'pointer',
                }}
              >
                Detayları Gör
              </button>
              <button
                onClick={() => setPopupKapali(true)}
                style={{
                  padding: '11px 20px', borderRadius: 9, fontSize: 14, fontWeight: 700,
                  background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer',
                }}
              >
                Kapat
              </button>
            </div>
          </div>
          <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }`}</style>
        </div>
      )}
    </>
  )
}
