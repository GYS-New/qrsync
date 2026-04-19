'use client'

import React, { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

interface Alert {
  id: number
  tarih: string
  seviye: 'kritik' | 'yuksek' | 'orta' | 'dusuk'
  baslik: string
  mesaj: string
  firma_id: string | null
  kaynak: string | null
  cozuldu: boolean
  cozum_tarihi: string | null
  detay: any
}

const SEVIYE_STYLE: Record<string, { bg: string; color: string; border: string; etiket: string }> = {
  kritik: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', etiket: '🔴 KRİTİK' },
  yuksek: { bg: '#ffedd5', color: '#9a3412', border: '#fdba74', etiket: '🟠 YÜKSEK' },
  orta:   { bg: '#fef3c7', color: '#92400e', border: '#fcd34d', etiket: '🟡 ORTA' },
  dusuk:  { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd', etiket: '🔵 DÜŞÜK' },
}

export default function SistemAlertsClient() {
  const { toast } = useToast()
  const [data, setData] = useState<Alert[]>([])
  const [loading, setLoading] = useState(true)
  const [cozuldu, setCozuldu] = useState<'false' | 'true' | ''>('false')
  const [detay, setDetay] = useState<Alert | null>(null)

  function yukle() {
    setLoading(true)
    const p = new URLSearchParams()
    if (cozuldu) p.set('cozuldu', cozuldu)
    fetch(`/api/sistem-alerts?${p}`)
      .then(r => r.json())
      .then(j => setData(Array.isArray(j?.data) ? j.data : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { yukle() }, [cozuldu])

  async function cozIsaretle(id: number) {
    try {
      const res = await fetch('/api/sistem-alerts', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ type: 'success', title: 'Çözüldü', message: 'Uyarı çözüldü olarak işaretlendi' })
      yukle()
      if (detay?.id === id) setDetay(null)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  function tarihFormat(iso: string) {
    try {
      return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }

  const cozulmeyen = data.filter(a => !a.cozuldu)
  const [butunluk, setButunluk] = useState<{ toplam: number; firmalar: any[] } | null>(null)
  const [butunlukLoading, setButunlukLoading] = useState(false)

  async function butunlukKontrolEt() {
    setButunlukLoading(true)
    try {
      const res = await fetch('/api/sistem-alerts/butunluk-kontrol', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setButunluk({ toplam: j.toplam, firmalar: j.firmalar ?? [] })
      toast({
        type: j.toplam > 0 ? 'warning' as any : 'success',
        title: j.toplam > 0 ? 'Yetim kayıt bulundu' : 'Her şey yolunda',
        message: j.toplam > 0 ? `${j.toplam} yetim çeklist kaydı var` : 'Yetim kayıt bulunamadı',
      })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setButunlukLoading(false)
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      {/* Bütünlük kontrol paneli */}
      <div className="verde-card" style={{ marginBottom: 14, padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>🔍 Veri Bütünlük Kontrolü</div>
            <div style={{ fontSize: 12.5, color: '#64748b' }}>
              Çeklist arşivinde yetim kalmış kayıtları taramak için "Şimdi Kontrol Et" butonuna bas. Her gece 02:00'de otomatik çalışır.
            </div>
          </div>
          <button onClick={butunlukKontrolEt} disabled={butunlukLoading}
            style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #7c3aed', background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            {butunlukLoading ? 'Kontrol Ediliyor…' : '🔍 Şimdi Kontrol Et'}
          </button>
        </div>
        {butunluk && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: butunluk.toplam > 0 ? '#fef3c7' : '#dcfce7', border: `1px solid ${butunluk.toplam > 0 ? '#fcd34d' : '#86efac'}`, borderRadius: 8, fontSize: 13 }}>
            {butunluk.toplam > 0 ? (
              <>
                <strong>⚠️ {butunluk.toplam} yetim çeklist kaydı tespit edildi</strong>
                <div style={{ fontSize: 12, marginTop: 4, color: '#78350f' }}>
                  {butunluk.firmalar.map((f: any) => (
                    <div key={f.firma_id}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{f.firma_id?.slice(0, 8)}…</span> — <strong>{f.yetim_sayi}</strong> yetim
                      (ilk: {new Date(f.en_eski).toLocaleString('tr-TR')}, son: {new Date(f.en_yeni).toLocaleString('tr-TR')})
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <><strong>✓ Her şey yolunda</strong> — yetim kayıt tespit edilmedi.</>
            )}
          </div>
        )}
      </div>

      <div className="verde-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Sistem Uyarıları</div>
          {cozulmeyen.length > 0 && (
            <span style={{ padding: '3px 10px', borderRadius: 12, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 700 }}>
              {cozulmeyen.length} çözülmemiş
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="verde-select" value={cozuldu} onChange={e => setCozuldu(e.target.value as any)} style={{ width: 170 }}>
              <option value="false">Sadece çözülmemiş</option>
              <option value="true">Sadece çözülmüş</option>
              <option value="">Tümü</option>
            </select>
            <button onClick={yukle} disabled={loading} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13 }}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </button>
          </div>
        </div>

        <div style={{ padding: 14 }}>
          {loading && data.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Yükleniyor…</div>
          ) : data.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
              <div>{cozuldu === 'false' ? 'Çözülmemiş uyarı yok' : 'Kayıt bulunamadı'}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.map(a => {
                const s = SEVIYE_STYLE[a.seviye] ?? SEVIYE_STYLE.dusuk
                return (
                  <div key={a.id}
                    onClick={() => setDetay(a)}
                    style={{
                      background: a.cozuldu ? '#f9fafb' : s.bg,
                      border: `1px solid ${a.cozuldu ? '#e5e7eb' : s.border}`,
                      borderRadius: 10, padding: '12px 14px',
                      cursor: 'pointer', opacity: a.cozuldu ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: s.color }}>{s.etiket}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{a.baslik}</span>
                        {a.kaynak && (
                          <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 4, background: '#e5e7eb', color: '#4b5563' }}>{a.kaynak}</span>
                        )}
                        {a.cozuldu && (
                          <span style={{ fontSize: 10.5, padding: '1px 6px', borderRadius: 4, background: '#dcfce7', color: '#166534', fontWeight: 700 }}>✓ Çözüldü</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#4b5563', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {a.mesaj}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{tarihFormat(a.tarih)}</div>
                    {!a.cozuldu && (
                      <button
                        onClick={(e) => { e.stopPropagation(); cozIsaretle(a.id) }}
                        style={{ padding: '5px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #16a34a', background: '#dcfce7', color: '#166534', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Çözüldü
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {detay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,26,15,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setDetay(null) }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(620px, calc(100vw - 24px))', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800 }}>{detay.baslik}</div>
              <button onClick={() => setDetay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div><strong>Seviye:</strong> {SEVIYE_STYLE[detay.seviye]?.etiket ?? detay.seviye}</div>
              <div><strong>Tarih:</strong> {tarihFormat(detay.tarih)}</div>
              {detay.kaynak && <div><strong>Kaynak:</strong> {detay.kaynak}</div>}
              {detay.firma_id && <div><strong>Firma ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{detay.firma_id}</span></div>}
              <div><strong>Mesaj:</strong></div>
              <div style={{ background: '#f9fafb', padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap' }}>{detay.mesaj}</div>
              {detay.detay && (
                <>
                  <div><strong>Detay:</strong></div>
                  <pre style={{ background: '#f9fafb', padding: 12, borderRadius: 8, fontSize: 11, overflow: 'auto' }}>
                    {JSON.stringify(detay.detay, null, 2)}
                  </pre>
                </>
              )}
              {detay.cozuldu && detay.cozum_tarihi && (
                <div style={{ background: '#dcfce7', padding: '8px 12px', borderRadius: 8, color: '#166534' }}>
                  ✓ Bu uyarı {tarihFormat(detay.cozum_tarihi)} tarihinde çözüldü olarak işaretlendi.
                </div>
              )}
            </div>
            {!detay.cozuldu && (
              <div style={{ padding: '12px 18px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => cozIsaretle(detay.id)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #16a34a', background: '#16a34a', color: '#fff', fontWeight: 600, cursor: 'pointer' }}
                >
                  ✓ Çözüldü Olarak İşaretle
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
