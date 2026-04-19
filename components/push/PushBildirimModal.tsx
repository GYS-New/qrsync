'use client'

import React, { useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

interface Alici { id: string; isim_soyisim: string }

interface Props {
  alicilar: Alici[]
  onClose: () => void
}

export default function PushBildirimModal({ alicilar, onClose }: Props) {
  const { toast } = useToast()
  const [baslik, setBaslik] = useState('')
  const [icerik, setIcerik] = useState('')
  const [kanal, setKanal] = useState<'default' | 'gorev_uyari' | 'gorev_tamamla'>('default')
  const [sending, setSending] = useState(false)

  async function gonder() {
    if (!baslik.trim()) return toast({ type: 'error', title: 'Hata', message: 'Başlık zorunlu' })
    if (!icerik.trim()) return toast({ type: 'error', title: 'Hata', message: 'İçerik zorunlu' })
    if (baslik.length > 80) return toast({ type: 'error', title: 'Hata', message: 'Başlık en fazla 80 karakter' })
    if (icerik.length > 500) return toast({ type: 'error', title: 'Hata', message: 'İçerik en fazla 500 karakter' })

    setSending(true)
    try {
      const res = await fetch('/api/push/manuel-gonder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: alicilar.map(a => a.id),
          title: baslik.trim(),
          body: icerik.trim(),
          kanal,
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Gönderim hatası')
      toast({
        type: 'success',
        title: 'Bildirim gönderildi',
        message: `${j.basarili}/${j.toplam} kişiye iletildi`,
      })
      onClose()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSending(false)
  }

  const tek = alicilar.length === 1

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(15,26,15,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={e => { if (e.target === e.currentTarget && !sending) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 12, width: 'min(520px, calc(100vw - 24px))', boxShadow: '0 18px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🔔</span>
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              {tek ? `Bildirim — ${alicilar[0].isim_soyisim}` : `Toplu Bildirim — ${alicilar.length} kişi`}
            </div>
          </div>
          <button onClick={() => !sending && onClose()} style={{ background: 'none', border: 'none', cursor: sending ? 'not-allowed' : 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
        </div>

        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!tek && (
            <div style={{ fontSize: 12, color: '#6b7280', background: '#f9fafb', padding: '8px 12px', borderRadius: 8, maxHeight: 70, overflowY: 'auto' }}>
              <strong>Alıcılar:</strong> {alicilar.map(a => a.isim_soyisim).join(', ')}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4b5563', marginBottom: 5 }}>Başlık *</label>
            <input
              type="text"
              className="verde-input"
              style={{ width: '100%' }}
              value={baslik}
              onChange={e => setBaslik(e.target.value)}
              maxLength={80}
              placeholder="Ör: Acil duyuru"
              disabled={sending}
            />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, textAlign: 'right' }}>{baslik.length}/80</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4b5563', marginBottom: 5 }}>İçerik *</label>
            <textarea
              className="verde-input"
              style={{ width: '100%', minHeight: 100, resize: 'vertical', fontFamily: 'inherit' }}
              value={icerik}
              onChange={e => setIcerik(e.target.value)}
              maxLength={500}
              placeholder="Bildirim içeriği"
              disabled={sending}
            />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, textAlign: 'right' }}>{icerik.length}/500</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4b5563', marginBottom: 5 }}>Ses Kanalı</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {([
                { k: 'default', l: 'Standart', a: 'Varsayılan ses' },
                { k: 'gorev_uyari', l: 'Uyarı', a: 'Sesli uyarı (vav)' },
                { k: 'gorev_tamamla', l: 'Tamamla', a: 'Tamamlama sesi' },
              ] as const).map(opt => (
                <button
                  key={opt.k}
                  type="button"
                  onClick={() => setKanal(opt.k as any)}
                  disabled={sending}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 7,
                    border: kanal === opt.k ? '2px solid #111827' : '1.5px solid #e5e7eb',
                    background: kanal === opt.k ? '#f9fafb' : '#fff',
                    color: kanal === opt.k ? '#111827' : '#6b7280',
                    cursor: sending ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 700,
                  }}
                  title={opt.a}
                >{opt.l}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} disabled={sending} className="verde-btn-outline-strong">İptal</button>
          <button onClick={gonder} disabled={sending} className="verde-btn-primary">
            {sending ? 'Gönderiliyor…' : `Gönder (${alicilar.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
