'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle, XCircle, Minus, AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  taskId: string
  taskType: 'gorevler' | 'canli_gorevler'
  onKapat: () => void
}

export type Sonuc = {
  sira: number
  madde: string
  zorunlu: boolean
  gorsel_gerekli?: boolean
  secenekler?: string[]
  durum: boolean | null
  secenek: string | null
  not: string | null
  gorsel_url: string | null
  yapan: string | null
  tarih: string | null
  kanal: string | null
  dolduruldu: boolean
}

export type ChecklistData = {
  gorev: { id: string; tanim: string; durum: string; tamamlanma_tarihi: string | null; atanan: string | null }
  lokasyon: string
  sablon: { baslik: string; tanim: string } | null
  sonuclar: Sonuc[]
  mesaj?: string
}

const DURUM_LABEL: Record<string, string> = {
  ACIK: 'Açık', ISLEMDE: 'İşlemde', TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal', HAZIR: 'Hazır', BEKLEMEDE: 'Beklemede',
  ZAMANI_GECMIS: 'Zamanı Geçmiş', ZAMANINDA_YAPILAMAYAN: 'Zamanında Yapılamayan',
}

function fmtTarih(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v); if (isNaN(d.getTime())) return v
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()}`
}

// ── Paylaşılan çeklist tablo bileşeni ────────────────────────────────────────
export function ChecklistTablo({ sonuclar, mesaj, sablonBaslik }: {
  sonuclar: Sonuc[]
  mesaj?: string
  sablonBaslik?: string
}) {
  const [buyukFoto, setBuyukFoto] = useState<string | null>(null)

  if (mesaj && !sonuclar.length) {
    return (
      <div style={{ padding: '12px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', fontSize: 13 }}>
        {mesaj}
      </div>
    )
  }
  if (!sonuclar.length) return null

  const dolduruldu = sonuclar.filter(s => s.dolduruldu).length
  const toplam     = sonuclar.length
  const basariPct  = toplam > 0 ? Math.round(dolduruldu / toplam * 100) : 0

  return (
    <>
      {sablonBaslik && (
        <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: '#475569' }}>
          📋 {sablonBaslik}
        </div>
      )}

      {/* Özet bar */}
      <div style={{ marginBottom: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, fontSize: 12.5 }}>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>Doldurulma Oranı</span>
          <span style={{ fontWeight: 700, color: basariPct === 100 ? '#1a5c2a' : basariPct >= 50 ? '#d97706' : '#dc2626' }}>
            %{basariPct}
          </span>
        </div>
        <div style={{ height: 7, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${basariPct}%`, background: basariPct === 100 ? '#2e8b2e' : basariPct >= 50 ? '#d97706' : '#dc2626', borderRadius: 4, transition: 'width .4s ease' }} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11.5, color: '#64748b' }}>
          <span>✅ {dolduruldu}/{toplam} madde dolduruldu</span>
          <span style={{ color: '#dc2626' }}>⚠️ {sonuclar.filter(s => s.zorunlu && !s.dolduruldu).length} zorunlu boş</span>
        </div>
      </div>

      {/* Maddeler */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sonuclar.map((s, i) => (
          <div key={i} style={{
            border: `1px solid ${s.dolduruldu ? '#d1fae5' : s.zorunlu ? '#fecaca' : '#e2e8f0'}`,
            borderRadius: 8, overflow: 'hidden',
            background: s.dolduruldu ? '#f0fdf4' : '#fff',
          }}>
            {/* Madde başlık satırı */}
            <div style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: s.dolduruldu || s.not || s.gorsel_url ? '1px solid #f1f5f9' : 'none' }}>
              <div style={{ flexShrink: 0 }}>
                {!s.dolduruldu
                  ? <Minus size={16} color="#94a3b8" />
                  : <CheckCircle size={17} color="#16a34a" />
                }
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0f172a' }}>
                  {s.sira}. {s.madde}
                </span>
                {s.zorunlu && (
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '1px 5px', borderRadius: 4 }}>
                    Zorunlu
                  </span>
                )}
              </div>
              {/* Seçilen cevap */}
              {s.secenek && (
                <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', flexShrink: 0 }}>
                  {s.secenek}
                </span>
              )}
              {/* Kanal + tarih */}
              {s.tarih && (
                <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>
                  {s.kanal && (
                    <span style={{ marginRight: 4, fontWeight: 700, color: s.kanal === 'QR' ? '#1d4ed8' : '#15803d' }}>{s.kanal}</span>
                  )}
                  {fmtTarih(s.tarih)}
                </span>
              )}
            </div>

            {/* Not + fotoğraf */}
            {(s.not || s.gorsel_url) && (
              <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {s.gorsel_url && (
                  <img
                    src={s.gorsel_url}
                    alt="çeklist"
                    onClick={() => setBuyukFoto(s.gorsel_url)}
                    style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'zoom-in', flexShrink: 0 }}
                    title="Büyütmek için tıkla"
                  />
                )}
                {s.not && (
                  <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.5 }}>{s.not}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {buyukFoto && (
        <div
          onClick={() => setBuyukFoto(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <img src={buyukFoto} alt="büyük" style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} />
          <button onClick={() => setBuyukFoto(null)}
            style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 40, height: 40, cursor: 'pointer', color: '#fff', fontSize: 20, display: 'grid', placeItems: 'center' }}>
            ✕
          </button>
        </div>
      )}
    </>
  )
}

// ── Modal bileşeni ────────────────────────────────────────────────────────────
export default function ChecklistModal({ taskId, taskType, onKapat }: Props) {
  const [data,    setData]    = useState<ChecklistData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hata,    setHata]    = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setHata(null)
    fetch(`/api/checklist-results?task_id=${taskId}&task_type=${taskType}`)
      .then(r => r.json())
      .then(j => { if (!j.ok) throw new Error(j.error ?? 'Yüklenemedi'); setData(j) })
      .catch(e => setHata(e.message))
      .finally(() => setLoading(false))
  }, [taskId, taskType])

  return (
    <div onClick={onKapat}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Başlık */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Çeklist Sonuçları</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{data?.gorev.tanim ?? '—'}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
              <span>📍 {data?.lokasyon ?? '—'}</span>
              {data?.gorev.atanan && <span>👤 {data.gorev.atanan}</span>}
              <span>📋 {DURUM_LABEL[data?.gorev.durum ?? ''] ?? data?.gorev.durum ?? '—'}</span>
              {data?.gorev.tamamlanma_tarihi && <span>✓ {fmtTarih(data.gorev.tamamlanma_tarihi)}</span>}
            </div>
          </div>
          <button onClick={onKapat} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, flexShrink: 0 }}>
            <X size={20} />
          </button>
        </div>

        {/* İçerik */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '18px 22px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <RefreshCw size={24} style={{ animation: 'spin 0.9s linear infinite', margin: '0 auto 10px', display: 'block', color: '#2e8b2e' }} />
              Yükleniyor…
            </div>
          )}
          {hata && (
            <div style={{ padding: '12px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} /> {hata}
            </div>
          )}
          {!loading && !hata && data && (
            <ChecklistTablo
              sonuclar={data.sonuclar}
              mesaj={data.mesaj}
              sablonBaslik={data.sablon?.baslik}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onKapat}
            style={{ height: 34, padding: '0 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            Kapat
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
