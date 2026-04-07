'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'

type ChecklistItem = {
  id: string
  sira: number
  madde: string
  zorunlu: boolean
  gorsel_gerekli: boolean
  secenekler: { deger: string; aciklama_gerekli: boolean }[]
}
type Task = { id: string; taskType: 'gorevler' | 'canli_gorevler'; tanim: string; durum: string }
type ScanResponse = {
  ok: boolean
  error?: string
  firma?: { ad: string }
  lokasyon?: { id: string; tanim: string }
  checklistTemplate?: { id: string; isim: string; items: ChecklistItem[] } | null
  tasks?: Task[]
}
type CheckEntry = { secenek: string | null; not: string; gorsel_url: string | null; gorsel_uploading: boolean }

export default function TokenTaskClient({ kanal, token }: { kanal: 'QR' | 'NFC'; token: string }) {
  const [data, setData] = useState<ScanResponse | null>(null)
  const [selectedTaskKey, setSelectedTaskKey] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const autoSubmitted = useRef(false)
  const [checks, setChecks] = useState<Record<string, CheckEntry>>({})

  async function load() {
    setLoading(true)
    setMessage('')
    const res = await fetch(`/api/${kanal.toLowerCase()}/${token}`, { cache: 'no-store' })
    const json = await res.json()
    setData(json)
    if (json?.tasks?.length === 1) {
      setSelectedTaskKey(`${json.tasks[0].taskType}:${json.tasks[0].id}`)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kanal, token])

  const selectedTask = useMemo(() => {
    const [taskType, id] = selectedTaskKey.split(':')
    return data?.tasks?.find((t) => t.id === id && t.taskType === taskType) ?? null
  }, [data?.tasks, selectedTaskKey])

  const hasChecklist = !!data?.checklistTemplate?.items?.length
  const singleTask = (data?.tasks?.length ?? 0) === 1 ? data?.tasks?.[0] : null

  useEffect(() => {
    if (loading || !data?.ok || hasChecklist || !singleTask || autoSubmitted.current) return
    autoSubmitted.current = true
    void submit(singleTask)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data?.ok, hasChecklist, singleTask?.id])

  function getEntry(id: string): CheckEntry {
    return checks[id] ?? { secenek: null, not: '', gorsel_url: null, gorsel_uploading: false }
  }

  function setEntry(id: string, patch: Partial<CheckEntry>) {
    setChecks(prev => ({ ...prev, [id]: { ...getEntry(id), ...patch } }))
  }

  async function uploadGorsel(item: ChecklistItem, file: File, taskId: string) {
    setEntry(item.id, { gorsel_uploading: true })
    const form = new FormData()
    form.append('file', file)
    form.append('taskId', taskId)
    form.append('maddeId', item.id)
    form.append('lokasyonId', data?.lokasyon?.id ?? '')
    form.append('kanal', kanal)
    try {
      const res = await fetch('/api/upload/checklist', { method: 'POST', body: form })
      const json = await res.json()
      if (json.ok) setEntry(item.id, { gorsel_url: json.publicUrl, gorsel_uploading: false })
      else setEntry(item.id, { gorsel_uploading: false })
    } catch {
      setEntry(item.id, { gorsel_uploading: false })
    }
  }

  async function submit(taskOverride?: Task | null) {
    const task = taskOverride ?? selectedTask
    if (!task) { setMessage('Önce görev seçin.'); return }

    if (hasChecklist) {
      for (const item of data?.checklistTemplate?.items ?? []) {
        const entry = getEntry(item.id)
        if (item.zorunlu && !entry.secenek) {
          setMessage(`"${item.madde}" zorunlu madde için seçenek seçin.`)
          return
        }
        const secilenOpt = item.secenekler.find(s => s.deger === entry.secenek)
        if (secilenOpt?.aciklama_gerekli && !entry.not.trim()) {
          setMessage(`"${item.madde}" için açıklama zorunlu.`)
          return
        }
        if (item.gorsel_gerekli && entry.secenek && !entry.gorsel_url) {
          setMessage(`"${item.madde}" için fotoğraf zorunlu.`)
          return
        }
      }
    }

    setSubmitting(true)
    setMessage('')
    const payload = {
      taskId: task.id,
      taskType: task.taskType,
      checklistResults: (data?.checklistTemplate?.items ?? []).map((item) => {
        const entry = getEntry(item.id)
        return {
          itemId:    item.id,
          secenek:   entry.secenek ?? null,
          not:       entry.not ?? '',
          gorsel_url: entry.gorsel_url ?? null,
        }
      }),
    }

    const res = await fetch(`/api/${kanal.toLowerCase()}/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json()

    if (!res.ok || !json?.ok) {
      setMessage(json?.error || 'İşlem başarısız')
      setSubmitting(false)
      return
    }

    setMessage(json?.message || 'Görev tamamlandı')
    await load()
    setSubmitting(false)
  }

  if (loading) {
    return <div className="verde-card" style={{ padding: 22 }}>Yükleniyor...</div>
  }

  if (!data?.ok) {
    const authRequired = data?.error === 'auth_required'
    return (
      <div className="verde-card" style={{ padding: 22, maxWidth: 720 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{kanal} İşlemi</div>
        <div style={{ marginTop: 12, color: '#b91c1c' }}>{data?.error || 'İşlem başarısız'}</div>
        {authRequired ? (
          <div style={{ marginTop: 16 }}>
            <a href="/login" className="verde-btn-primary" style={{ textDecoration: 'none' }}>Giriş Yap</a>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="verde-card" style={{ padding: 22, maxWidth: 820 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#111827' }}>{kanal} Görev Tamamlama</div>
        <div style={{ fontSize: 13, color: '#4b5563' }}>Firma: {data.firma?.ad}</div>
        <div style={{ fontSize: 13, color: '#4b5563' }}>Lokasyon: {data.lokasyon?.tanim}</div>
      </div>

      {message ? (
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: '#f7faf7', border: '1px solid #e5e7eb', color: message.includes('başarısız') || message.includes('değil') || message.includes('zorunlu') ? '#b91c1c' : '#1f2937' }}>
          {message}
        </div>
      ) : null}

      {!data.tasks?.length ? (
        <div style={{ marginTop: 18, color: '#6b7280' }}>Bu lokasyonda tamamlanabilir görev bulunamadı.</div>
      ) : (
        <>
          {(data.tasks?.length ?? 0) > 1 ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Görev seçin</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {data.tasks?.map((task) => {
                  const key = `${task.taskType}:${task.id}`
                  const active = key === selectedTaskKey
                  return (
                    <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, border: `1px solid ${active ? '#374151' : '#e5e7eb'}`, borderRadius: 10, background: active ? '#f5fbf5' : '#fff', cursor: 'pointer' }}>
                      <input type="radio" checked={active} onChange={() => setSelectedTaskKey(key)} />
                      <div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{task.tanim}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{task.taskType === 'gorevler' ? 'Manuel görev' : 'Frekansiyel görev'}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 18, padding: 12, borderRadius: 10, background: '#f5fbf5', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Seçilen görev</div>
              <div style={{ fontWeight: 700, color: '#111827', marginTop: 4 }}>{singleTask?.tanim}</div>
            </div>
          )}

          {hasChecklist ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Checklist: {data.checklistTemplate?.isim}</div>
              <div style={{ display: 'grid', gap: 12 }}>
                {data.checklistTemplate?.items.map((item) => {
                  const entry = getEntry(item.id)
                  const secenekler = item.secenekler?.length ? item.secenekler : [{ deger: 'EVET', aciklama_gerekli: false }, { deger: 'HAYIR', aciklama_gerekli: false }]
                  const task = selectedTask ?? singleTask
                  return (
                    <div key={item.id} style={{ border: `1px solid ${entry.secenek ? '#374151' : '#e5e7eb'}`, borderRadius: 10, padding: 14, background: entry.secenek ? '#f5fbf5' : '#fff' }}>
                      {/* Madde başlığı + etiketler */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        <span style={{ fontWeight: 600, color: '#111827', flex: 1, minWidth: 120, lineHeight: 1.4 }}>{item.sira}. {item.madde}</span>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {item.zorunlu && <span className="verde-badge status-acik">Zorunlu</span>}
                          {item.gorsel_gerekli && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>📷 Fotoğraf Zorunlu</span>}
                        </div>
                      </div>

                      {/* Seçenek butonları */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                        {secenekler.map((sec) => (
                          <button
                            key={sec.deger}
                            type="button"
                            onClick={() => setEntry(item.id, { secenek: entry.secenek === sec.deger ? null : sec.deger })}
                            style={{
                              padding: '7px 18px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                              border: `2px solid ${entry.secenek === sec.deger ? '#374151' : '#e5e7eb'}`,
                              background: entry.secenek === sec.deger ? '#374151' : '#fff',
                              color: entry.secenek === sec.deger ? '#fff' : '#4b5563',
                              transition: 'all 0.15s',
                            }}
                          >
                            {sec.deger}
                          </button>
                        ))}
                      </div>

                      {/* Not alanı */}
                      <input
                        className="verde-input"
                        style={{ marginBottom: item.gorsel_gerekli ? 10 : 0 }}
                        placeholder={item.secenekler.find(s => s.deger === entry.secenek)?.aciklama_gerekli ? 'Açıklama (zorunlu)' : 'Not (opsiyonel)'}
                        value={entry.not}
                        onChange={(e) => setEntry(item.id, { not: e.target.value })}
                      />

                      {/* Fotoğraf alanı */}
                      {item.gorsel_gerekli && (
                        <div style={{ marginTop: 4 }}>
                          {entry.gorsel_url ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <img src={entry.gorsel_url} alt="gorsel" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb' }} />
                              <button type="button" onClick={() => setEntry(item.id, { gorsel_url: null })} style={{ fontSize: 12, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Kaldır</button>
                            </div>
                          ) : (
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: '1px dashed #93c5fd', background: '#eff6ff', cursor: 'pointer', fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                              {entry.gorsel_uploading ? 'Yükleniyor…' : '📷 Fotoğraf Ekle'}
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                style={{ display: 'none' }}
                                disabled={entry.gorsel_uploading}
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file && task) uploadGorsel(item, file, task.id)
                                }}
                              />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <Button variant="primary" onClick={() => submit()} disabled={submitting || (!selectedTask && !singleTask)}>
              {submitting ? 'Gönderiliyor...' : hasChecklist ? 'Checklist ile Tamamla' : 'Görevi Tamamla'}
            </Button>
            <Button variant="ghost" onClick={load} disabled={submitting}>Yenile</Button>
          </div>
        </>
      )}
    </div>
  )
}
