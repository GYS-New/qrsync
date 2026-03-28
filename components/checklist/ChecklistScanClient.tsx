'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'

type Kanal = 'QR' | 'NFC'

type Kullanici = { id: string; isim_soyisim?: string | null; firma_id?: string | null }
type Lokasyon = {
  id: string
  firma_id: string
  tanim: string
  sureli_gorev_aktif: boolean
  aciklama?: string | null
}

type GorevOzet = {
  id: string
  kaynak: 'gorevler' | 'canli_gorevler'
  tanim: string
  durum: string
  atanan_kullanici_id?: string | null
  olusma?: string | null
  baslatilma_tarihi?: string | null
  tamamlanma_tarihi?: string | null
  tamamlanma_suresi_saniye?: number | null
}

type Secenek = { id: string; deger: string; sira_no: number; aciklama_gerekli: boolean }

type Madde = {
  id: string
  sira_no: number
  baslik: string
  zorunlu_cevap: boolean
  gorsel_gerekli: boolean
  secenekler: Secenek[]
}

type Sablon = {
  id: string
  baslik: string
  tanim: string
  versiyon: number
  maddeler: Madde[]
}

type CevapState = {
  secenek: string
  aciklama: string
  gorselUrl: string
  uploading: boolean
}

const BOSH_CEVAP: CevapState = { secenek: '', aciklama: '', gorselUrl: '', uploading: false }

export default function ChecklistScanClient({ token, kanal }: { token: string; kanal: Kanal }) {
  const { toast } = useToast()

  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [me, setMe]                 = useState<Kullanici | null>(null)
  const [lokasyon, setLokasyon]     = useState<Lokasyon | null>(null)
  const [gorevler, setGorevler]     = useState<GorevOzet[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string>('')
  const [sablon, setSablon]         = useState<Sablon | null>(null)
  const [cevaplar, setCevaplar]     = useState<Record<string, CevapState>>({})
  const [message, setMessage]       = useState('Yükleniyor…')
  const [error, setError]           = useState('')
  const [completed, setCompleted]   = useState(false)
  const [eksikMaddeler, setEksikMaddeler] = useState<Set<string>>(new Set())
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const autoCompleteStarted = useRef(false)

  function showError(msg: string) {
    setError(msg)
    toast({ type: 'error', title: 'İşlem başarısız', message: msg })
  }

  function showSuccess(msg: string) {
    toast({ type: 'success', title: 'Başarılı', message: msg })
  }

  const selectedTask  = useMemo(() => gorevler.find(x => x.id === selectedTaskId) ?? null, [gorevler, selectedTaskId])
  const timedTaskEnabled = !!lokasyon?.sureli_gorev_aktif
  const canAutoComplete  = !timedTaskEnabled && !sablon && gorevler.length === 1 && !!selectedTask

  async function init() {
    setLoading(true)
    setError('')
    setCompleted(false)
    autoCompleteStarted.current = false
    setMessage('Bağlanıyor…')

    try {
      const res  = await fetch(`/api/scan/context?token=${encodeURIComponent(token)}&kanal=${kanal}`, { cache: 'no-store' })
      const json = await res.json()

      if (!json.ok) {
        setError(json.error ?? 'Yüklenemedi')
        setLoading(false)
        return
      }

      const { lokasyon: loc, kullanici, gorevler: tasks, sablon: loadedSablon } = json

      setMe(kullanici)
      setLokasyon(loc)
      setGorevler(prev => {
        const prevMap = Object.fromEntries(prev.map(t => [t.id, t]))
        return (tasks as GorevOzet[]).map(t => {
          const existing = prevMap[t.id]
          if (existing && !t.baslatilma_tarihi && existing.baslatilma_tarihi) {
            return { ...t, baslatilma_tarihi: existing.baslatilma_tarihi }
          }
          return t
        })
      })

      if (tasks.length === 0) {
        setError('Tamamlanabilir görev bulunamadı')
        setLoading(false)
        return
      }

      setSelectedTaskId(tasks[0].id)

      if (loadedSablon) {
        const maddeler: Madde[] = (loadedSablon.maddeler ?? []).map((m: any) => ({
          id:            m.id,
          sira_no:       m.sira_no ?? 0,
          baslik:        m.baslik ?? '',
          zorunlu_cevap: m.zorunlu_cevap !== false,
          gorsel_gerekli: !!m.gorsel_gerekli,
          secenekler: Array.isArray(m.secenekler) && m.secenekler.length > 0
            ? m.secenekler
            : [{ id: '', deger: 'EVET', sira_no: 1, aciklama_gerekli: false }, { id: '', deger: 'HAYIR', sira_no: 2, aciklama_gerekli: false }],
        }))
        const safeSablon: Sablon = {
          id:       loadedSablon.id,
          baslik:   loadedSablon.baslik ?? '',
          tanim:    loadedSablon.tanim ?? '',
          versiyon: loadedSablon.versiyon ?? 1,
          maddeler,
        }
        setSablon(safeSablon)
        const initialAnswers: Record<string, CevapState> = {}
        for (const madde of maddeler) {
          initialAnswers[madde.id] = { ...BOSH_CEVAP }
        }
        setCevaplar(initialAnswers)
      } else {
        setSablon(null)
        setCevaplar({})
      }

      setLoading(false)
    } catch (err: any) {
      setError(err?.message ?? 'Bağlantı hatası')
      setLoading(false)
    }
  }

  useEffect(() => {
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, kanal])

  // Auto-complete: only when there is no checklist and a single task
  useEffect(() => {
    if (loading || !canAutoComplete || completed || submitting) return
    if (autoCompleteStarted.current) return
    autoCompleteStarted.current = true
    void (async () => {
      if (!me || !lokasyon || !selectedTask) return
      setSubmitting(true)
      setError('')
      try {
        const res = await fetch('/api/scan/tamamla', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gorev_id:    selectedTask.id,
            kaynak:      selectedTask.kaynak,
            sablon_id:   null,
            kanal,
            lokasyon_id: lokasyon.id,
            maddeler:    [],
          }),
        })
        const json = await res.json()
        if (!json.ok) throw new Error(json.error ?? 'Görev tamamlanamadı')
        showSuccess(json.mesaj ?? 'Görev tamamlandı')
        setGorevler([])
        setCompleted(true)
      } catch (err: any) {
        showError(err?.message ?? 'Görev tamamlanamadı')
        autoCompleteStarted.current = false
      } finally {
        setSubmitting(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, canAutoComplete, completed, submitting])

  function updateCevap(maddeId: string, patch: Partial<CevapState>) {
    setCevaplar(prev => ({
      ...prev,
      [maddeId]: { ...(prev[maddeId] ?? BOSH_CEVAP), ...patch },
    }))
  }

  async function uploadGorsel(maddeId: string, file: File | null) {
    if (!file || !selectedTask || !lokasyon) return
    updateCevap(maddeId, { uploading: true })
    try {
      const formData = new FormData()
      formData.set('file', file)
      formData.set('taskId', selectedTask.id)
      formData.set('maddeId', maddeId)
      formData.set('lokasyonId', lokasyon.id)
      formData.set('kanal', kanal)
      const res  = await fetch('/api/upload/checklist', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Görsel yükleme başarısız')
      updateCevap(maddeId, { uploading: false, gorselUrl: json.publicUrl || '' })
      showSuccess('Görsel yüklendi')
    } catch (err: any) {
      updateCevap(maddeId, { uploading: false })
      showError(err?.message ?? 'Görsel yükleme başarısız')
    }
  }

  function validateChecklist(): string | null {
    if (!sablon) return null
    const eksik = new Set<string>()
    let ilkHata: string | null = null
    for (const madde of sablon.maddeler) {
      const cevap = cevaplar[madde.id] ?? BOSH_CEVAP
      let maddeEksik = false
      if (madde.zorunlu_cevap && !cevap.secenek) {
        if (!ilkHata) ilkHata = `${madde.sira_no}. madde için cevap seçmelisiniz`
        maddeEksik = true
      }
      const secilenOpt = madde.secenekler.find(s => s.deger === cevap.secenek)
      if (cevap.secenek && secilenOpt?.aciklama_gerekli && !cevap.aciklama?.trim()) {
        if (!ilkHata) ilkHata = `${madde.sira_no}. madde için açıklama zorunlu`
        maddeEksik = true
      }
      if (madde.gorsel_gerekli && !cevap.gorselUrl) {
        if (!ilkHata) ilkHata = `${madde.sira_no}. madde için fotoğraf zorunlu`
        maddeEksik = true
      }
      if (maddeEksik) eksik.add(madde.id)
    }
    setEksikMaddeler(eksik)
    return ilkHata
  }

  function temizleEksik(maddeId: string) {
    setEksikMaddeler(prev => { const s = new Set(prev); s.delete(maddeId); return s })
  }

  function formatDuration(seconds?: number | null) {
    if (!seconds || seconds <= 0) return '—'
    const total = Math.floor(seconds)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    if (h > 0) return `${h} sa ${m} dk`
    if (m > 0) return `${m} dk ${s} sn`
    return `${s} sn`
  }

  async function startSelectedTask() {
    if (!me || !selectedTask || !timedTaskEnabled) return
    if (selectedTask.baslatilma_tarihi) return
    setSubmitting(true)
    setError('')
    try {
      const res  = await fetch('/api/scan/baslat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gorev_id: selectedTask.id, kaynak: selectedTask.kaynak }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Görev başlatılamadı')
      const nowIso = json.baslatilma_tarihi
      setGorevler(prev => prev.map(task => task.id === selectedTask.id
        ? { ...task, durum: task.kaynak === 'gorevler' ? 'ISLEMDE' : task.durum, baslatilma_tarihi: nowIso }
        : task))
      showSuccess('Görev başlatıldı')
    } catch (err: any) {
      showError(err?.message ?? 'Görev başlatılamadı')
    } finally {
      setSubmitting(false)
    }
  }

  async function completeSelectedTask() {
    if (!me || !lokasyon || !selectedTask) return showError('Görev seçilmedi')
    const checklistError = validateChecklist()
    if (checklistError) return showError(checklistError)
    if (timedTaskEnabled && !selectedTask.baslatilma_tarihi) return showError('Bu lokasyonda görev önce başlatılmalıdır')

    setSubmitting(true)
    setError('')

    try {
      const maddelerPayload = sablon ? sablon.maddeler.map(madde => ({
        madde_id:       madde.id,
        secenek_degeri: (cevaplar[madde.id] ?? BOSH_CEVAP).secenek || null,
        aciklama:       (cevaplar[madde.id] ?? BOSH_CEVAP).aciklama?.trim() || null,
        gorsel_url:     (cevaplar[madde.id] ?? BOSH_CEVAP).gorselUrl || null,
      })) : []

      const res = await fetch('/api/scan/tamamla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gorev_id:         selectedTask.id,
          kaynak:           selectedTask.kaynak,
          sablon_id:        sablon?.id ?? null,
          template_version: sablon?.versiyon ?? null,
          kanal,
          lokasyon_id:      lokasyon.id,
          maddeler:         maddelerPayload,
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Görev tamamlanamadı')

      showSuccess(json.mesaj ?? 'Görev tamamlandı')

      const remaining = gorevler.filter(x => x.id !== selectedTask.id)
      setGorevler(remaining)
      if (remaining.length > 0) {
        setSelectedTaskId(remaining[0].id)
        setCompleted(false)
        if (sablon) {
          const fresh: Record<string, CevapState> = {}
          for (const m of sablon.maddeler) fresh[m.id] = { ...BOSH_CEVAP }
          setCevaplar(fresh)
        }
      } else {
        setCompleted(true)
      }
    } catch (err: any) {
      showError(err?.message ?? 'Görev tamamlanamadı')
    } finally {
      setSubmitting(false)
    }
  }

  /* ─────────────────────────── RENDER ─────────────────────────────── */

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 16px 40px' }}>
      <div className="verde-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #e8f0e8', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6f846f', letterSpacing: 0.3 }}>{kanal} GÖREV AKIŞI</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f1a0f' }}>{lokasyon?.tanim ?? 'Lokasyon yükleniyor…'}</div>
            {!loading && !error ? <div style={{ marginTop: 6, fontSize: 12, color: '#2e6b2e', fontWeight: 700 }}>{timedTaskEnabled ? 'Süreli görev aktif' : 'Tek adımda tamamlama aktif'}</div> : null}
            {lokasyon?.aciklama ? <div style={{ marginTop: 6, fontSize: 13, color: '#6f846f' }}>{lokasyon.aciklama}</div> : null}
          </div>
          <div style={{ fontSize: 12, color: '#6f846f', textAlign: 'right' }}>
            <div>Kullanıcı: {me?.isim_soyisim || '-'}</div>
            <div>Token: {token}</div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 28, color: '#6f846f' }}>{message}</div>
        ) : error ? (
          <div style={{ padding: 28 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>İşlem başarısız</div>
            <div style={{ color: '#7f1d1d' }}>{error}</div>
          </div>
        ) : completed && gorevler.length === 0 ? (
          <div style={{ padding: 28 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#166534', marginBottom: 8 }}>Görev tamamlandı</div>
            <div style={{ color: '#3f5e3f' }}>Bu lokasyon için uygun görev işlemi başarıyla kaydedildi.</div>
          </div>
        ) : (
          <div style={{ padding: 20, display: 'grid', gap: 20 }}>
            {gorevler.length > 1 ? (
              /* ── Çoklu görev: seçim listesi ── */
              <div style={{ background: '#fff', border: '1px solid #d6e4d6', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e8f0e8', background: '#f0f9f0' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f1a0f' }}>Hangi görevi yapacaksınız?</div>
                  <div style={{ fontSize: 12, color: '#6f846f', marginTop: 2 }}>Bu lokasyonda {gorevler.length} görev bulundu — birini seçin</div>
                </div>
                <div style={{ padding: '10px 12px', display: 'grid', gap: 8 }}>
                  {gorevler.map(task => {
                    const selected = task.id === selectedTaskId
                    const tipRenk  = task.kaynak === 'gorevler'
                      ? { bg: '#eff6ff', color: '#1d4ed8', label: 'Spesifik' }
                      : { bg: '#f0fdf4', color: '#15803d', label: 'Frekansiyel' }
                    return (
                      <button key={task.id} type="button" onClick={() => setSelectedTaskId(task.id)}
                        style={{ textAlign: 'left', border: selected ? '2px solid #2e8b2e' : '1px solid #d6e4d6', background: selected ? '#f0f9f0' : '#fff', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'all .12s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <strong style={{ fontSize: 14, color: '#0f1a0f', lineHeight: 1.3 }}>{task.tanim}</strong>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: tipRenk.bg, color: tipRenk.color }}>{tipRenk.label}</span>
                            {selected && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#dcfce7', color: '#15803d' }}>✓ Seçili</span>}
                          </div>
                        </div>
                        {timedTaskEnabled && (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#6f846f' }}>
                            {task.baslatilma_tarihi ? `▶ ${new Date(task.baslatilma_tarihi).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : '○ Henüz başlatılmadı'}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* ── Tek görev: bilgi bandı ── */
              <div style={{ padding: '12px 16px', background: '#f0f9f0', border: '1px solid #d6e4d6', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#0f1a0f' }}>{gorevler[0]?.tanim}</div>
                  <div style={{ fontSize: 12, color: '#6f846f', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: gorevler[0]?.kaynak === 'gorevler' ? '#1d4ed8' : '#15803d' }}>
                      {gorevler[0]?.kaynak === 'gorevler' ? 'Spesifik' : 'Frekansiyel'}
                    </span>
                    {timedTaskEnabled && gorevler[0]?.baslatilma_tarihi && (
                      <span>▶ {new Date(gorevler[0].baslatilma_tarihi).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                    )}
                  </div>
                </div>
                {!timedTaskEnabled && !sablon && (
                  <span style={{ fontSize: 11, color: '#6f846f', fontStyle: 'italic' }}>otomatik işlenecek…</span>
                )}
              </div>
            )}

            {sablon ? (
              <div className="verde-card" style={{ padding: 16 }}>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{sablon.baslik}</div>
                  <div style={{ marginTop: 4, color: '#6f846f', fontSize: 13 }}>{sablon.tanim}</div>
                  <div style={{ marginTop: 6, color: '#6f846f', fontSize: 12 }}>Şablon versiyonu: v{sablon.versiyon}</div>
                </div>

                <div style={{ display: 'grid', gap: 14 }}>
                  {sablon.maddeler.map(madde => {
                    const cevap = cevaplar[madde.id] ?? BOSH_CEVAP
                    const secilenOpt = madde.secenekler.find(s => s.deger === cevap.secenek)
                    const aciklamaZorunlu = !!(cevap.secenek && secilenOpt?.aciklama_gerekli)
                    const eksik = eksikMaddeler.has(madde.id)

                    const labelStyle: React.CSSProperties = {
                      fontSize: 11, fontWeight: 700, color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6,
                    }
                    const opsStr = <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, color: '#94a3b8', fontSize: 11 }}> (isteğe bağlı)</span>

                    return (
                      <div key={madde.id} style={{
                        border: `2px solid ${eksik ? '#dc2626' : cevap.secenek ? '#bbf7d0' : '#e2e8f0'}`,
                        borderRadius: 12, padding: 16,
                        background: eksik ? '#fff5f5' : '#fff',
                        transition: 'border-color 0.2s',
                      }}>
                        {/* Başlık + rozetler */}
                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f1a0f', lineHeight: 1.4, flex: 1 }}>
                            {madde.sira_no}. {madde.baslik}
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {madde.zorunlu_cevap && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 7px', borderRadius: 4 }}>Zorunlu</span>
                            )}
                            {madde.gorsel_gerekli && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: '2px 7px', borderRadius: 4 }}>📷 Fotoğraf</span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gap: 14 }}>
                          {/* Cevap seçimi */}
                          <div>
                            <label style={labelStyle}>
                              Cevap {madde.zorunlu_cevap ? <span style={{ color: '#dc2626' }}>*</span> : opsStr}
                            </label>
                            <select
                              value={cevap.secenek}
                              onChange={e => { updateCevap(madde.id, { secenek: e.target.value }); temizleEksik(madde.id) }}
                              style={{
                                width: '100%', height: 46, padding: '0 12px', borderRadius: 10,
                                border: `2px solid ${eksik && madde.zorunlu_cevap && !cevap.secenek ? '#dc2626' : '#e2e8f0'}`,
                                fontSize: 15, background: '#fff', color: cevap.secenek ? '#0f1a0f' : '#9ca3af',
                                boxSizing: 'border-box',
                              }}
                            >
                              <option value="">Seçiniz…</option>
                              {madde.secenekler.map((opt, idx) => (
                                <option key={opt.id || `${madde.id}-${idx}`} value={opt.deger}>{opt.deger}</option>
                              ))}
                            </select>
                          </div>

                          {/* Açıklama */}
                          <div>
                            <label style={labelStyle}>
                              Açıklama {aciklamaZorunlu ? <span style={{ color: '#dc2626' }}>*</span> : opsStr}
                            </label>
                            <textarea
                              rows={2}
                              value={cevap.aciklama}
                              onChange={e => { updateCevap(madde.id, { aciklama: e.target.value }); temizleEksik(madde.id) }}
                              placeholder={aciklamaZorunlu ? 'Neden yapılamadığını yazın…' : 'Not ekleyin (isteğe bağlı)…'}
                              style={{
                                width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14,
                                border: `2px solid ${eksik && aciklamaZorunlu && !cevap.aciklama?.trim() ? '#dc2626' : '#e2e8f0'}`,
                                resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5,
                              }}
                            />
                          </div>

                          {/* Fotoğraf */}
                          <div>
                            <div style={labelStyle}>
                              Fotoğraf {madde.gorsel_gerekli ? <span style={{ color: '#dc2626' }}>*</span> : opsStr}
                            </div>
                            <input
                              ref={el => { fileInputRefs.current[madde.id] = el }}
                              type="file"
                              accept="image/*"
                              style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
                              onChange={e => { void uploadGorsel(madde.id, e.target.files?.[0] ?? null); temizleEksik(madde.id) }}
                            />
                            {cevap.uploading ? (
                              <div style={{ padding: '18px', background: '#f0f9f0', border: '2px dashed #d6e4d6', borderRadius: 10, textAlign: 'center', color: '#6f846f', fontSize: 13 }}>
                                <div style={{ fontSize: 20, marginBottom: 4 }}>⏳</div>
                                Yükleniyor…
                              </div>
                            ) : cevap.gorselUrl ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#f0fdf4', border: '2px solid #bbf7d0', borderRadius: 10 }}>
                                <img src={cevap.gorselUrl} alt="çekildi"
                                  style={{ width: 68, height: 68, objectFit: 'cover', borderRadius: 8, border: '2px solid #bbf7d0', flexShrink: 0 }} />
                                <div>
                                  <div style={{ fontSize: 13, color: '#1f6b1f', fontWeight: 700 }}>✓ Fotoğraf yüklendi</div>
                                  <button type="button" onClick={() => { updateCevap(madde.id, { gorselUrl: '' }); temizleEksik(madde.id) }}
                                    style={{ marginTop: 6, fontSize: 12, color: '#dc2626', background: 'none', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', padding: '2px 10px', fontWeight: 600 }}>
                                    Kaldır
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => fileInputRefs.current[madde.id]?.click()}
                                style={{
                                  display: 'block', width: '100%', border: `2px dashed ${eksik && madde.gorsel_gerekli ? '#dc2626' : '#d6e4d6'}`,
                                  borderRadius: 12, padding: '22px 16px', textAlign: 'center', cursor: 'pointer',
                                  background: eksik && madde.gorsel_gerekli ? '#fff5f5' : '#f9fcf9',
                                  WebkitTapHighlightColor: 'rgba(0,0,0,0.05)',
                                }}
                              >
                                <div style={{ fontSize: 34, marginBottom: 6 }}>📷</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#1f6b1f' }}>Fotoğraf Çek / Seç</div>
                                <div style={{ fontSize: 12, color: '#6f846f', marginTop: 3 }}>Kameradan çek veya galeriden seç</div>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="verde-card" style={{ padding: 16, background: '#f9fcf9', color: '#6f846f' }}>
                Bu lokasyona bağlı checklist şablonu yok.{' '}
                {timedTaskEnabled
                  ? 'Süreli görev aktif olduğu için önce başlatıp sonra tamamlamalısınız.'
                  : 'Tek görev varsa otomatik tamamlanır, birden fazla görev varsa seçim yaptıktan sonra tamamlayabilirsiniz.'}
              </div>
            )}

            {!completed && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: '#6f846f' }}>
                  Mod: {timedTaskEnabled ? 'Süreli görev (Başlat → Tamamla)' : 'Tek adımda tamamlama'}
                  {timedTaskEnabled && selectedTask?.baslatilma_tarihi
                    ? ` · Geçen süre: ${formatDuration(Math.max(0, Math.floor((Date.now() - new Date(selectedTask.baslatilma_tarihi).getTime()) / 1000)))}`
                    : ''}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <Button variant="ghost" onClick={() => void init()} disabled={loading || submitting}>↻ Yenile</Button>
                  {timedTaskEnabled ? (
                    <Button variant="ghost" onClick={() => void startSelectedTask()} disabled={submitting || !selectedTask || !!selectedTask?.baslatilma_tarihi}>
                      {selectedTask?.baslatilma_tarihi ? 'Başlatıldı' : 'Görevi Başlat'}
                    </Button>
                  ) : null}
                  <Button variant="primary" onClick={() => void completeSelectedTask()} disabled={submitting || !selectedTask || (timedTaskEnabled && !selectedTask?.baslatilma_tarihi)}>
                    {submitting ? 'Kaydediliyor…' : 'Görevi Tamamla'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
