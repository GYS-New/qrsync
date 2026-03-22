'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle, XCircle, Minus, AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  taskId: string
  taskType: 'gorevler' | 'canli_gorevler'
  onKapat: () => void
}

type Sonuc = {
  sira: number; madde: string; zorunlu: boolean
  durum: boolean | null; not: string | null; yapan: string | null
  tarih: string | null; kanal: string | null; dolduruldu: boolean
}

type ModalData = {
  gorev: { id: string; tanim: string; durum: string; tamamlanma_tarihi: string | null; atanan: string | null }
  lokasyon: string
  sonuclar: Sonuc[]
  mesaj?: string
}

function fmt(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const DURUM_LABEL: Record<string, string> = {
  ACIK: 'Açık', ISLEMDE: 'İşlemde', TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal', HAZIR: 'Hazır', BEKLEMEDE: 'Beklemede',
  ZAMANI_GECMIS: 'Zamanı Geçmiş', ZAMANINDA_YAPILAMAYAN: 'Zamanında Yapılamayan',
}

export default function ChecklistModal({ taskId, taskType, onKapat }: Props) {
  const [data,    setData]    = useState<ModalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hata,    setHata]    = useState<string | null>(null)

  useEffect(() => {
    setLoading(true); setHata(null)
    fetch(`/api/checklist-results?task_id=${taskId}&task_type=${taskType}`)
      .then(r => r.json())
      .then(j => {
        if (!j.ok) throw new Error(j.error ?? 'Yüklenemedi')
        setData(j)
      })
      .catch(e => setHata(e.message))
      .finally(() => setLoading(false))
  }, [taskId, taskType])

  const dolduruldu  = data?.sonuclar.filter(s => s.dolduruldu).length ?? 0
  const toplam      = data?.sonuclar.length ?? 0
  const tamamlanan  = data?.sonuclar.filter(s => s.durum === true).length ?? 0
  const basariPct   = toplam > 0 ? Math.round(tamamlanan / toplam * 100) : 0

  return (
    <div
      onClick={onKapat}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
      >
        {/* Başlık */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Çeklist Tamamlanma Raporu</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{data?.gorev.tanim ?? '—'}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 5, flexWrap: 'wrap', fontSize: 12.5, color: '#64748b' }}>
              <span>📍 {data?.lokasyon ?? '—'}</span>
              {data?.gorev.atanan && <span>👤 {data.gorev.atanan}</span>}
              <span>📋 {DURUM_LABEL[data?.gorev.durum ?? ''] ?? data?.gorev.durum ?? '—'}</span>
              {data?.gorev.tamamlanma_tarihi && <span>✓ {fmt(data.gorev.tamamlanma_tarihi)}</span>}
            </div>
          </div>
          <button onClick={onKapat} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* İçerik */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <RefreshCw size={24} style={{ animation: 'spin 0.9s linear infinite', margin: '0 auto 10px', display: 'block', color: '#2e8b2e' }} />
              Yükleniyor…
            </div>
          )}
          {hata && (
            <div style={{ padding: '14px 16px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} /> {hata}
            </div>
          )}
          {data?.mesaj && !loading && (
            <div style={{ padding: '14px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', fontSize: 13 }}>
              {data.mesaj}
            </div>
          )}

          {!loading && !hata && data && data.sonuclar.length > 0 && (
            <>
              {/* Özet bar */}
              <div style={{ marginBottom: 18, padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>Tamamlanma Durumu</span>
                  <span style={{ fontWeight: 700, color: basariPct === 100 ? '#1a5c2a' : basariPct >= 50 ? '#d97706' : '#dc2626' }}>%{basariPct}</span>
                </div>
                <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${basariPct}%`, background: basariPct === 100 ? '#2e8b2e' : basariPct >= 50 ? '#d97706' : '#dc2626', borderRadius: 4, transition: 'width .4s ease' }} />
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11.5, color: '#64748b' }}>
                  <span>✅ {tamamlanan} tamamlandı</span>
                  <span>📋 {dolduruldu}/{toplam} dolduruldu</span>
                  <span>⚠️ {data.sonuclar.filter(s => s.zorunlu && s.durum !== true).length} zorunlu eksik</span>
                </div>
              </div>

              {/* Madde tablosu */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1a5c2a' }}>
                    <th style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, fontSize: 11.5, textAlign: 'left', width: 32 }}>#</th>
                    <th style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, fontSize: 11.5, textAlign: 'left' }}>MADDE</th>
                    <th style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, fontSize: 11.5, textAlign: 'center', width: 80 }}>SONUÇ</th>
                    <th style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, fontSize: 11.5, textAlign: 'left', width: 140 }}>NOT</th>
                    <th style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, fontSize: 11.5, textAlign: 'center', width: 70 }}>KANAL</th>
                    <th style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, fontSize: 11.5, textAlign: 'left', width: 130 }}>TARIH</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sonuclar.map((s, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 10px', color: '#94a3b8', fontWeight: 600 }}>{s.sira}</td>
                      <td style={{ padding: '9px 10px' }}>
                        <div style={{ fontWeight: 500, color: '#0f172a' }}>{s.madde}</div>
                        {s.zorunlu && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 4 }}>Zorunlu</span>}
                      </td>
                      <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                        {!s.dolduruldu
                          ? <Minus size={16} color="#94a3b8" />
                          : s.durum === true
                          ? <CheckCircle size={18} color="#16a34a" />
                          : <XCircle size={18} color="#dc2626" />
                        }
                      </td>
                      <td style={{ padding: '9px 10px', color: '#475569', fontSize: 12 }}>{s.not ?? '—'}</td>
                      <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                        {s.kanal
                          ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: s.kanal === 'QR' ? '#dbeafe' : '#f0fdf4', color: s.kanal === 'QR' ? '#1d4ed8' : '#15803d' }}>{s.kanal}</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '9px 10px', color: '#64748b', fontSize: 11.5, whiteSpace: 'nowrap' }}>{fmt(s.tarih)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onKapat}
            style={{ height: 36, padding: '0 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            Kapat
          </button>
        </div>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
