'use client'

import React, { useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

interface Alici { id: string; isim_soyisim: string; bildirim_izni?: boolean | null }

interface Props {
  alicilar: Alici[]
  onClose: () => void
}

export default function PushBildirimModal({ alicilar, onClose }: Props) {
  const { toast } = useToast()
  const [baslik, setBaslik] = useState('')
  const [icerik, setIcerik] = useState('')
  const [link, setLink] = useState('')
  const [kanal, setKanal] = useState<'default' | 'gorev_uyari' | 'gorev_tamamla'>('default')
  const [sending, setSending] = useState(false)

  async function gonder() {
    if (!baslik.trim()) return toast({ type: 'error', title: 'Hata', message: 'Başlık zorunlu' })
    if (!icerik.trim()) return toast({ type: 'error', title: 'Hata', message: 'İçerik zorunlu' })
    if (baslik.length > 80) return toast({ type: 'error', title: 'Hata', message: 'Başlık en fazla 80 karakter' })
    if (icerik.length > 500) return toast({ type: 'error', title: 'Hata', message: 'İçerik en fazla 500 karakter' })
    if (link.trim() && !/^https?:\/\/.+/i.test(link.trim())) {
      return toast({ type: 'error', title: 'Hata', message: 'Link http:// veya https:// ile başlamalı' })
    }

    setSending(true)
    try {
      const res = await fetch('/api/push/manuel-gonder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: alicilar.map(a => a.id),
          title: baslik.trim(),
          body: icerik.trim(),
          kanal,
          ...(link.trim() ? { link: link.trim() } : {}),
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
  const kapaliAlicilar = alicilar.filter(a => a.bildirim_izni === false)
  const bilinmeyenAlicilar = alicilar.filter(a => a.bildirim_izni == null)

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
            <div style={{ fontSize: 12, color: '#6b7280', background: '#f9fafb', padding: '8px 12px', borderRadius: 8, maxHeight: 90, overflowY: 'auto' }}>
              <div style={{ marginBottom: 4 }}><strong>Alıcılar ({alicilar.length}):</strong></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {alicilar.map(a => {
                  const kapali = a.bildirim_izni === false
                  const bilinmeyen = a.bildirim_izni == null
                  return (
                    <span key={a.id}
                      style={{
                        fontSize: 11.5, padding: '2px 8px', borderRadius: 10,
                        background: kapali ? '#fee2e2' : bilinmeyen ? '#fef3c7' : '#dcfce7',
                        color: kapali ? '#991b1b' : bilinmeyen ? '#92400e' : '#166534',
                        fontWeight: 600,
                      }}
                      title={kapali ? 'Bildirim izni kapalı' : bilinmeyen ? 'İzin durumu bilinmiyor' : 'Bildirim izni açık'}
                    >
                      {kapali && '🔕 '}{bilinmeyen && '⚠️ '}{a.isim_soyisim}
                    </span>
                  )
                })}
              </div>
            </div>
          )}
          {tek && alicilar[0].bildirim_izni === false && (
            <div style={{ fontSize: 12.5, background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: '10px 12px', borderRadius: 8, lineHeight: 1.5 }}>
              🔕 <strong>{alicilar[0].isim_soyisim}</strong> cihazının bildirim izni <strong>kapalı</strong>. Bildirim gönderilse bile büyük ihtimalle görmeyecek.
            </div>
          )}
          {kapaliAlicilar.length > 0 && !tek && (
            <div style={{ fontSize: 12.5, background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', padding: '8px 12px', borderRadius: 8 }}>
              🔕 <strong>{kapaliAlicilar.length} alıcının</strong> bildirim izni kapalı. Bu kişiler büyük ihtimalle bildirimi görmeyecek.
            </div>
          )}
          {bilinmeyenAlicilar.length > 0 && !tek && (
            <div style={{ fontSize: 12, background: '#fef9e7', border: '1px solid #fcd34d', color: '#92400e', padding: '8px 12px', borderRadius: 8 }}>
              ⚠️ <strong>{bilinmeyenAlicilar.length} alıcının</strong> izin durumu bilinmiyor (mobil app henüz bildirim iznini raporlamadı).
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
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4b5563', marginBottom: 5 }}>Link (URL) — opsiyonel</label>
            <input
              type="url"
              className="verde-input"
              style={{ width: '100%' }}
              value={link}
              onChange={e => setLink(e.target.value)}
              maxLength={500}
              placeholder="https://… (mobilde 🔗 Bağlantıyı Aç butonu olarak görünür)"
              disabled={sending}
            />
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
