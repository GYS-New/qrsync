'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'

type ChecklistItem = { id: string; sira: number; madde: string; zorunlu: boolean; secenekler: string[] }
type Task = { id: string; taskType: 'gorevler' | 'canli_gorevler'; tanim: string; durum: string }
type ScanResponse = {
  ok: boolean
  error?: string
  firma?: { ad: string }
  lokasyon?: { tanim: string }
  checklistTemplate?: { id: string; isim: string; items: ChecklistItem[] } | null
  tasks?: Task[]
}

export default function TokenTaskClient({ kanal, token }: { kanal: 'QR' | 'NFC'; token: string }) {
  const [data, setData] = useState<ScanResponse | null>(null)
  const [selectedTaskKey, setSelectedTaskKey] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const autoSubmitted = useRef(false)
  const [checks, setChecks] = useState<Record<string, { secenek: string | null; not: string }>>({})

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

  async function submit(taskOverride?: Task | null) {
    const task = taskOverride ?? selectedTask
    if (!task) {
      setMessage('Önce görev seçin.')
      return
    }

    if (hasChecklist) {
      const missingRequired = (data?.checklistTemplate?.items ?? []).filter(
        (item) => item.zorunlu && !checks[item.id]?.secenek
      )
      if (missingRequired.length) {
        setMessage('Zorunlu checklist maddelerini doldurun.')
        return
      }
    }

    setSubmitting(true)
    setMessage('')
    const payload = {
      taskId: task.id,
      taskType: task.taskType,
      checklistResults: (data?.checklistTemplate?.items ?? []).map((item) => ({
        itemId: item.id,
        secenek: checks[item.id]?.secenek ?? null,
        not: checks[item.id]?.not ?? '',
      })),
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
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f1a0f' }}>{kanal} İşlemi</div>
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
        <div style={{ fontSize: 18, fontWeight: 800, color: '#0f1a0f' }}>{kanal} Görev Tamamlama</div>
        <div style={{ fontSize: 13, color: '#506050' }}>Firma: {data.firma?.ad}</div>
        <div style={{ fontSize: 13, color: '#506050' }}>Lokasyon: {data.lokasyon?.tanim}</div>
      </div>

      {message ? (
        <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 8, background: '#f7faf7', border: '1px solid #d6e4d6', color: message.includes('başarısız') || message.includes('değil') ? '#b91c1c' : '#1f6b1f' }}>
          {message}
        </div>
      ) : null}

      {!data.tasks?.length ? (
        <div style={{ marginTop: 18, color: '#7a907a' }}>Bu lokasyonda tamamlanabilir görev bulunamadı.</div>
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
                    <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, border: `1px solid ${active ? '#2e8b2e' : '#d6e4d6'}`, borderRadius: 10, background: active ? '#f5fbf5' : '#fff', cursor: 'pointer' }}>
                      <input type="radio" checked={active} onChange={() => setSelectedTaskKey(key)} />
                      <div>
                        <div style={{ fontWeight: 700, color: '#0f1a0f' }}>{task.tanim}</div>
                        <div style={{ fontSize: 12, color: '#7a907a' }}>{task.taskType === 'gorevler' ? 'Manuel görev' : 'Frekansiyel görev'}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 18, padding: 12, borderRadius: 10, background: '#f5fbf5', border: '1px solid #d6e4d6' }}>
              <div style={{ fontSize: 12, color: '#7a907a' }}>Seçilen görev</div>
              <div style={{ fontWeight: 700, color: '#0f1a0f', marginTop: 4 }}>{singleTask?.tanim}</div>
            </div>
          )}

          {hasChecklist ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Checklist: {data.checklistTemplate?.isim}</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {data.checklistTemplate?.items.map((item) => {
                  const entry = checks[item.id] ?? { secenek: null, not: '' }
                  const secenekler = item.secenekler?.length ? item.secenekler : ['EVET', 'HAYIR']
                  return (
                    <div key={item.id} style={{ border: `1px solid ${entry.secenek ? '#2e8b2e' : '#d6e4d6'}`, borderRadius: 10, padding: 12, background: entry.secenek ? '#f5fbf5' : '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                        <span style={{ fontWeight: 600, color: '#0f1a0f', flex: 1, minWidth: 120 }}>{item.sira}. {item.madde}</span>
                        {item.zorunlu ? <span className="verde-badge status-acik">Zorunlu</span> : null}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {secenekler.map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setChecks((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { not: '' }), secenek: prev[item.id]?.secenek === sec ? null : sec } }))}
                            style={{
                              padding: '6px 16px', borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                              border: `2px solid ${entry.secenek === sec ? '#2e8b2e' : '#d6e4d6'}`,
                              background: entry.secenek === sec ? '#2e8b2e' : '#fff',
                              color: entry.secenek === sec ? '#fff' : '#506050',
                            }}
                          >
                            {sec}
                          </button>
                        ))}
                      </div>
                      <input
                        className="verde-input"
                        style={{ marginTop: 10 }}
                        placeholder="Not (opsiyonel)"
                        value={entry.not}
                        onChange={(e) => setChecks((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { secenek: null }), not: e.target.value } }))}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            <Button variant="primary" onClick={() => submit()} disabled={submitting || !selectedTask && !singleTask}>
              {submitting ? 'Gönderiliyor...' : hasChecklist ? 'Checklist ile Tamamla' : 'Görevi Tamamla'}
            </Button>
            <Button variant="ghost" onClick={load} disabled={submitting}>Yenile</Button>
          </div>
        </>
      )}
    </div>
  )
}
