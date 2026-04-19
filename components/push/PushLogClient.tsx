'use client'

import React, { useEffect, useMemo, useState } from 'react'

interface LogKayit {
  id: string
  firma_id: string
  proje_id: string | null
  gonderen_id: string | null
  gonderen_isim: string
  alici_id: string | null
  alici_isim: string
  baslik: string
  icerik: string
  kanal: string
  cihaz_sayisi: number
  basarili: boolean
  hata_mesaji: string | null
  olusturma_tarihi: string
}

interface Props {
  firmaId: string
  projeId?: string | null
}

const KANAL_ETIKET: Record<string, string> = {
  default: 'Standart',
  gorev_uyari: 'Uyarı',
  gorev_tamamla: 'Tamamla',
}

export default function PushLogClient({ firmaId, projeId }: Props) {
  const [kayitlar, setKayitlar] = useState<LogKayit[]>([])
  const [loading, setLoading] = useState(true)
  const [gun, setGun] = useState(30)
  const [basarili, setBasarili] = useState<'' | 'true' | 'false'>('')
  const [q, setQ] = useState('')
  const [detay, setDetay] = useState<LogKayit | null>(null)

  function yukle() {
    setLoading(true)
    const p = new URLSearchParams({ firmaId, gun: String(gun) })
    if (projeId) p.set('projeId', projeId)
    if (basarili) p.set('basarili', basarili)
    if (q.trim()) p.set('q', q.trim())
    fetch(`/api/push/log?${p}`)
      .then(r => r.json())
      .then(j => setKayitlar(Array.isArray(j?.data) ? j.data : []))
      .catch(() => setKayitlar([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { yukle() }, [firmaId, projeId, gun, basarili])

  const basariliSayi = useMemo(() => kayitlar.filter(k => k.basarili).length, [kayitlar])
  const basarisizSayi = kayitlar.length - basariliSayi

  function tarihFormat(iso: string) {
    try {
      return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }

  function kisalt(s: string, n = 60) {
    if (!s) return ''
    return s.length > n ? s.slice(0, n) + '…' : s
  }

  return (
    <div style={{ padding: '20px 24px' }}>
      <div className="verde-card">
        {/* Başlık + filtreler */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="verde-input"
            placeholder="Ara (gönderen, alıcı, başlık, içerik)"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') yukle() }}
            style={{ maxWidth: 280 }}
          />
          <select className="verde-select" value={gun} onChange={e => setGun(Number(e.target.value))} style={{ width: 130 }}>
            <option value={1}>Son 1 gün</option>
            <option value={7}>Son 7 gün</option>
            <option value={30}>Son 30 gün</option>
            <option value={90}>Son 90 gün</option>
            <option value={365}>Son 1 yıl</option>
          </select>
          <select className="verde-select" value={basarili} onChange={e => setBasarili(e.target.value as any)} style={{ width: 140 }}>
            <option value="">Durum (Tümü)</option>
            <option value="true">Başarılı</option>
            <option value="false">Başarısız</option>
          </select>
          <button onClick={yukle} disabled={loading} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13 }}>
            {loading ? 'Yükleniyor…' : '↻ Yenile'}
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center', fontSize: 12.5 }}>
            <span><strong>{kayitlar.length}</strong> kayıt</span>
            <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ {basariliSayi}</span>
            {basarisizSayi > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>✕ {basarisizSayi}</span>}
          </div>
        </div>

        {/* Tablo */}
        <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
          <table className="verde-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              <col style={{ width: 140 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 180 }} />
              <col />
              <col style={{ width: 90 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 90 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Gönderen</th>
                <th>Alıcı</th>
                <th>Başlık</th>
                <th>İçerik</th>
                <th>Kanal</th>
                <th>Cihaz</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {loading && kayitlar.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Yükleniyor…</td></tr>
              ) : kayitlar.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Kayıt bulunamadı</td></tr>
              ) : (
                kayitlar.map(k => (
                  <tr key={k.id} style={{ cursor: 'pointer' }} onClick={() => setDetay(k)}>
                    <td style={{ fontSize: 12.5, color: '#4b5563', whiteSpace: 'nowrap' }}>{tarihFormat(k.olusturma_tarihi)}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.gonderen_isim}>{k.gonderen_isim}</td>
                    <td style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.alici_isim}>{k.alici_isim}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.baslik}>{k.baslik}</td>
                    <td style={{ fontSize: 12.5, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.icerik}>{kisalt(k.icerik, 80)}</td>
                    <td style={{ fontSize: 11.5, color: '#6b7280' }}>{KANAL_ETIKET[k.kanal] ?? k.kanal}</td>
                    <td style={{ fontSize: 12, color: '#4b5563', textAlign: 'center' }}>{k.cihaz_sayisi}</td>
                    <td>
                      {k.basarili ? (
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#dcfce7', color: '#166534' }}>✓ Başarılı</span>
                      ) : (
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#fee2e2', color: '#991b1b' }}>✕ Hata</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detay modalı */}
      {detay && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,26,15,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setDetay(null) }}
        >
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(560px, calc(100vw - 24px))', boxShadow: '0 18px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>🔔 Bildirim Kaydı</div>
              <button onClick={() => setDetay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div><strong>Tarih:</strong> {tarihFormat(detay.olusturma_tarihi)}</div>
              <div><strong>Gönderen:</strong> {detay.gonderen_isim}</div>
              <div><strong>Alıcı:</strong> {detay.alici_isim}</div>
              <div><strong>Kanal:</strong> {KANAL_ETIKET[detay.kanal] ?? detay.kanal}</div>
              <div><strong>Hedef Cihaz Sayısı:</strong> {detay.cihaz_sayisi}</div>
              <div><strong>Durum:</strong>{' '}
                {detay.basarili
                  ? <span style={{ color: '#166534', fontWeight: 700 }}>✓ Başarılı</span>
                  : <span style={{ color: '#991b1b', fontWeight: 700 }}>✕ Başarısız</span>}
              </div>
              {detay.hata_mesaji && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 8, color: '#991b1b' }}>
                  <strong>Hata:</strong> {detay.hata_mesaji}
                </div>
              )}
              <div style={{ marginTop: 6, padding: '10px 12px', background: '#f9fafb', borderRadius: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{detay.baslik}</div>
                <div style={{ fontSize: 13, color: '#4b5563', whiteSpace: 'pre-wrap' }}>{detay.icerik}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
