'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle, Minus, AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  taskId: string
  taskType: 'gorevler' | 'canli_gorevler'
  onKapat: () => void
  duzenleme?: boolean        // düzenleme modu
  onKaydet?: () => void      // kaydet sonrası geri dön callback
}

export type Sonuc = {
  madde_id: string
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
  lokasyon_id?: string | null
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
          <span style={{ fontWeight: 700, color: basariPct === 100 ? '#111827' : basariPct >= 50 ? '#d97706' : '#dc2626' }}>
            %{basariPct}
          </span>
        </div>
        <div style={{ height: 7, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${basariPct}%`, background: basariPct === 100 ? '#374151' : basariPct >= 50 ? '#d97706' : '#dc2626', borderRadius: 4, transition: 'width .4s ease' }} />
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
            background: s.dolduruldu ? '#f9fafb' : '#fff',
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
                    onClick={() => setBuyukFoto(s.gorsel_url!)}
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
export default function ChecklistModal({ taskId, taskType, onKapat, duzenleme = false, onKaydet }: Props) {
  const [data,     setData]     = useState<ChecklistData | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [hata,     setHata]     = useState<string | null>(null)
  const [kayit,    setKayit]    = useState(false)

  // Düzenleme state: madde_id → { secenek, not }
  const [cevaplar, setCevaplar] = useState<Record<string, { secenek: string; not: string }>>({})
  const [eksikIds, setEksikIds] = useState<Set<string>>(new Set())
  // Fotoğraf upload state: madde_id → { url, uploading }
  const [gorselState, setGorselState] = useState<Record<string, { url: string; uploading: boolean }>>({})

  function updateGorsel(maddeId: string, patch: { url?: string; uploading?: boolean }) {
    setGorselState(prev => ({
      ...prev,
      [maddeId]: { url: prev[maddeId]?.url ?? '', uploading: prev[maddeId]?.uploading ?? false, ...patch },
    }))
  }

  async function uploadGorselWeb(maddeId: string, file: File | null) {
    if (!file || !data) return
    updateGorsel(maddeId, { uploading: true })
    try {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('taskId', taskId)
      formData.set('maddeId', maddeId)
      formData.set('lokasyonId', data.lokasyon_id ?? '')
      formData.set('kanal', 'WEB')
      const res  = await fetch('/api/upload/checklist', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Görsel yükleme başarısız')
      updateGorsel(maddeId, { url: json.publicUrl || '', uploading: false })
    } catch (e: any) {
      updateGorsel(maddeId, { uploading: false })
      setHata(e.message)
    }
  }

  function loadData() {
    setLoading(true); setHata(null)
    fetch(`/api/checklist-results?task_id=${taskId}&task_type=${taskType}`)
      .then(r => r.json())
      .then(j => {
        if (!j.ok) throw new Error(j.error ?? 'Yüklenemedi')
        setData(j)
        // Mevcut cevapları düzenleme state'e yükle
        const init: Record<string, { secenek: string; not: string }> = {}
        const gorselInit: Record<string, { url: string; uploading: boolean }> = {}
        for (const s of j.sonuclar ?? []) {
          init[s.madde_id] = { secenek: s.secenek ?? '', not: s.not ?? '' }
          gorselInit[s.madde_id] = { url: s.gorsel_url ?? '', uploading: false }
        }
        setCevaplar(init)
        setGorselState(gorselInit)
      })
      .catch(e => setHata(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [taskId, taskType])

  async function handleKaydet() {
    if (!data) return

    // Validasyon
    const yeniEksik = new Set<string>()
    for (const s of data.sonuclar) {
      const cv  = cevaplar[s.madde_id]
      const url = gorselState[s.madde_id]?.url || s.gorsel_url
      const dolu = !!(cv?.secenek || cv?.not)
      if (s.zorunlu && !dolu) yeniEksik.add(s.madde_id)
      if (s.gorsel_gerekli && !url) yeniEksik.add(s.madde_id)
    }
    if (yeniEksik.size > 0) {
      setEksikIds(yeniEksik)
      setHata('Zorunlu alanları doldurun')
      return
    }
    setEksikIds(new Set())
    setHata(null)

    setKayit(true)
    try {
      const maddeler = data.sonuclar.map(s => ({
        madde_id:       s.madde_id,
        secenek_degeri: cevaplar[s.madde_id]?.secenek || null,
        aciklama:       cevaplar[s.madde_id]?.not || null,
        gorsel_url:     gorselState[s.madde_id]?.url || s.gorsel_url || null,
      }))
      const res = await fetch('/api/checklist-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, task_type: taskType, maddeler }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Kayıt başarısız')
      onKaydet ? onKaydet() : onKapat()
    } catch (e: any) {
      setHata(e.message)
    } finally {
      setKayit(false)
    }
  }

  return (
    <div onClick={duzenleme ? undefined : onKapat}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Başlık */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: duzenleme ? '#1d4ed8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
              {duzenleme ? '✏️ Çeklist Düzenleme' : 'Çeklist Sonuçları'}
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{data?.gorev.tanim ?? '—'}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', fontSize: 12, color: '#64748b' }}>
              <span>📍 {data?.lokasyon ?? '—'}</span>
              {data?.gorev.atanan && <span>👤 {data.gorev.atanan}</span>}
              <span>📋 {DURUM_LABEL[data?.gorev.durum ?? ''] ?? data?.gorev.durum ?? '—'}</span>
              {data?.gorev.tamamlanma_tarihi && <span>✓ {fmtTarih(data.gorev.tamamlanma_tarihi)}</span>}
            </div>
          </div>
          {!duzenleme && (
            <button onClick={onKapat} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4, flexShrink: 0 }}>
              <X size={20} />
            </button>
          )}
        </div>

        {/* İçerik */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '18px 22px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              <RefreshCw size={24} style={{ animation: 'spin 0.9s linear infinite', margin: '0 auto 10px', display: 'block', color: '#374151' }} />
              Yükleniyor…
            </div>
          )}
          {hata && (
            <div style={{ padding: '12px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <AlertCircle size={16} /> {hata}
            </div>
          )}
          {!loading && !hata && data && !duzenleme && (
            <ChecklistTablo sonuclar={data.sonuclar} mesaj={data.mesaj} sablonBaslik={data.sablon?.baslik} />
          )}
          {!loading && data && duzenleme && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.sablon?.baslik && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>📋 {data.sablon.baslik}</div>
              )}
              {data.sonuclar.map((s, i) => {
                const cv     = cevaplar[s.madde_id] ?? { secenek: '', not: '' }
                const gs     = gorselState[s.madde_id]
                const gorsel = gs?.url || s.gorsel_url || ''
                const dolu   = !!(cv.secenek || cv.not)
                const eksik  = eksikIds.has(s.madde_id)
                const labelS: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }
                const opsStr = <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, color: '#94a3b8' }}> (isteğe bağlı)</span>
                return (
                  <div key={s.madde_id} style={{
                    border: `2px solid ${eksik ? '#dc2626' : dolu || gorsel ? '#bbf7d0' : s.zorunlu ? '#fecaca' : '#e2e8f0'}`,
                    borderRadius: 10, padding: '14px 16px',
                    background: eksik ? '#fff5f5' : dolu || gorsel ? '#f9fafb' : '#fff',
                  }}>
                    {/* Başlık */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      {dolu || gorsel ? <CheckCircle size={15} color="#16a34a" /> : <Minus size={15} color="#94a3b8" />}
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', flex: 1 }}>{s.sira}. {s.madde}</span>
                      {s.zorunlu && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '1px 6px', borderRadius: 4 }}>Zorunlu</span>
                      )}
                      {s.gorsel_gerekli && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>📷{gorsel ? ' ✓' : ' Gerekli'}</span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      {/* Seçenek */}
                      <div>
                        <label style={labelS}>Cevap {s.zorunlu ? <span style={{ color: '#dc2626' }}>*</span> : opsStr}</label>
                        {s.secenekler && s.secenekler.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {s.secenekler.map(sec => (
                              <button key={sec} type="button"
                                onClick={() => { setCevaplar(prev => ({ ...prev, [s.madde_id]: { ...cv, secenek: cv.secenek === sec ? '' : sec } })); setEksikIds(prev => { const n = new Set(prev); n.delete(s.madde_id); return n }) }}
                                style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: `2px solid ${cv.secenek === sec ? '#1d4ed8' : '#e2e8f0'}`, background: cv.secenek === sec ? '#dbeafe' : '#f8fafc', color: cv.secenek === sec ? '#1d4ed8' : '#475569', transition: 'all 0.1s' }}>
                                {sec}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <input type="text" placeholder="Cevap girin…" value={cv.secenek}
                            onChange={e => { setCevaplar(prev => ({ ...prev, [s.madde_id]: { ...cv, secenek: e.target.value } })); setEksikIds(prev => { const n = new Set(prev); n.delete(s.madde_id); return n }) }}
                            style={{ width: '100%', height: 36, padding: '0 10px', borderRadius: 7, border: `1px solid ${eksik && s.zorunlu && !cv.secenek ? '#dc2626' : '#e2e8f0'}`, fontSize: 13, boxSizing: 'border-box' }}
                          />
                        )}
                      </div>

                      {/* Not */}
                      <div>
                        <label style={labelS}>Açıklama / Not {opsStr}</label>
                        <textarea placeholder="Not ekleyin…" value={cv.not} rows={2}
                          onChange={e => setCevaplar(prev => ({ ...prev, [s.madde_id]: { ...cv, not: e.target.value } }))}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #e2e8f0', fontSize: 12.5, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', color: '#475569' }}
                        />
                      </div>

                      {/* Fotoğraf */}
                      <div>
                        <label style={labelS}>Fotoğraf {s.gorsel_gerekli ? <span style={{ color: '#dc2626' }}>*</span> : opsStr}</label>
                        {gs?.uploading ? (
                          <div style={{ padding: '14px', background: '#f9fafb', border: '2px dashed #e5e7eb', borderRadius: 8, textAlign: 'center', fontSize: 13, color: '#64748b' }}>
                            <RefreshCw size={16} style={{ animation: 'spin 0.9s linear infinite', marginBottom: 4, display: 'block', margin: '0 auto 4px' }} />
                            Yükleniyor…
                          </div>
                        ) : gorsel ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f9fafb', border: '2px solid #bbf7d0', borderRadius: 8 }}>
                            <img src={gorsel} alt="görsel" onClick={() => {}} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #bbf7d0', flexShrink: 0, cursor: 'zoom-in' }} />
                            <div>
                              <div style={{ fontSize: 12, color: '#1f2937', fontWeight: 700 }}>✓ Fotoğraf mevcut</div>
                              <button type="button" onClick={() => updateGorsel(s.madde_id, { url: '' })}
                                style={{ marginTop: 4, fontSize: 11, color: '#dc2626', background: 'none', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', padding: '1px 8px', fontWeight: 600 }}>
                                Kaldır
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label style={{
                            display: 'block', border: `2px dashed ${eksik && s.gorsel_gerekli ? '#dc2626' : '#e5e7eb'}`,
                            borderRadius: 8, padding: '16px', textAlign: 'center', cursor: 'pointer',
                            background: eksik && s.gorsel_gerekli ? '#fff5f5' : '#f9fcf9',
                          }}>
                            <div style={{ fontSize: 26, marginBottom: 4 }}>📷</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>Fotoğraf Ekle</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Dosya seçmek için tıkla</div>
                            <input type="file" accept="image/*" style={{ display: 'none' }}
                              onChange={e => void uploadGorselWeb(s.madde_id, e.target.files?.[0] ?? null)} />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: duzenleme ? 'space-between' : 'flex-end', alignItems: 'center', gap: 10 }}>
          {duzenleme ? (
            <>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {Object.values(cevaplar).filter(c => c.secenek || c.not).length} / {data?.sonuclar.length ?? 0} madde dolduruldu
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onKapat} disabled={kayit}
                  style={{ height: 36, padding: '0 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                  Vazgeç
                </button>
                <button onClick={handleKaydet} disabled={kayit || loading}
                  style={{ height: 36, padding: '0 20px', borderRadius: 8, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, opacity: (kayit || loading) ? 0.7 : 1 }}>
                  {kayit ? 'Kaydediliyor…' : '💾 Kaydet'}
                </button>
              </div>
            </>
          ) : (
            <button onClick={onKapat}
              style={{ height: 34, padding: '0 18px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              Kapat
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}
