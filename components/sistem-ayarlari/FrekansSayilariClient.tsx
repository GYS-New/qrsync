'use client'

import React, { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

interface Lok {
  id: string
  tanim: string
  parent_id?: string | null
  gunluk_frekans_sayisi?: number | null
}

interface Props {
  lokasyonlar: Lok[]
  firmaId: string
  projeId?: string | null
}

export default function FrekansSayilariClient({ lokasyonlar, firmaId, projeId }: Props) {
  const { toast } = useToast()

  const [values, setValues] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const l of lokasyonlar) m[l.id] = l.gunluk_frekans_sayisi ?? 1
    return m
  })
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [acikUstLoklar, setAcikUstLoklar] = useState<Set<string>>(new Set())
  const [acikGruplar, setAcikGruplar] = useState<Set<string>>(new Set())

  // Grupları çek
  const [gruplar, setGruplar] = useState<any[]>([])
  useEffect(() => {
    if (!firmaId) return
    const p = new URLSearchParams({ firmaId })
    if (projeId) p.set('projeId', projeId)
    fetch(`/api/location-groups?${p}`)
      .then(r => r.json())
      .then(j => { if (j.ok !== false) setGruplar(j.groups ?? []) })
      .catch(() => {})
  }, [firmaId, projeId])

  const ustLokasyonlar = lokasyonlar.filter(l => !l.parent_id).sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))

  // Grup → lokasyon mapping
  const grupLokMap = new Map<string, string[]>()
  for (const g of gruplar) {
    grupLokMap.set(g.id, g.lokasyonIds ?? [])
  }

  async function kaydetCoklu(ids: string[]) {
    setSavingIds(new Set(ids))
    try {
      const updates = ids.map(id => ({ id, gunluk_frekans_sayisi: values[id] ?? 1 }))
      const res = await fetch('/api/sistem-ayarlari/frekans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ type: 'success', title: 'Kaydedildi', message: `${ids.length} lokasyon güncellendi.` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSavingIds(new Set())
  }

  function setGrupFrekans(lokIds: string[], val: number) {
    setValues(prev => {
      const n = { ...prev }
      for (const id of lokIds) n[id] = val
      return n
    })
  }

  if (!lokasyonlar.length) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Bu projede lokasyon bulunamadı.</div>
  }

  const toplamFrekans = Object.values(values).reduce((s, v) => s + v, 0)

  return (
    <div>
      {/* Bilgi bandı */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ padding: '8px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#111827' }}>
          {lokasyonlar.length} lokasyon
        </div>
        <div style={{ padding: '8px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
          Toplam günlük frekans: {toplamFrekans}
        </div>
        <div style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>
          Gruba girilen frekans tüm alt lokasyonlarına uygulanır. Lokasyonlar bireysel düzenlenebilir.
        </div>
      </div>

      {/* Hiyerarşik liste */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ustLokasyonlar.map(ustLok => {
          const ustAcik = acikUstLoklar.has(ustLok.id)
          const altGruplar = gruplar.filter((g: any) => g.ust_lokasyon_id === ustLok.id && g.aktif)
          const altGrupLokIds = altGruplar.flatMap((g: any) => g.lokasyonIds ?? [])

          // Bu üst lokasyonun altındaki tüm lokasyonları bul
          const altLokIds: string[] = []
          const queue = [ustLok.id]
          while (queue.length) {
            const cur = queue.shift()!
            lokasyonlar.filter(l => l.parent_id === cur).forEach(l => { altLokIds.push(l.id); queue.push(l.id) })
          }

          // Grupsuz lokasyonlar
          const grupsuzLokIds = altLokIds.filter(id => !altGrupLokIds.includes(id))

          if (altGruplar.length === 0 && altLokIds.length === 0) return null

          return (
            <div key={ustLok.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
              {/* Üst Lokasyon Başlığı */}
              <div
                onClick={() => setAcikUstLoklar(prev => { const n = new Set(prev); n.has(ustLok.id) ? n.delete(ustLok.id) : n.add(ustLok.id); return n })}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#f9fafb', cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ fontSize: 12, color: '#374151' }}>{ustAcik ? '▼' : '▶'}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#111827', flex: 1 }}>
                  📍 {ustLok.tanim}
                  <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>
                    {altGruplar.length} grup · {altLokIds.length} lokasyon
                  </span>
                </span>
                {/* Üst lokasyon frekans girişi — tüm altlara uygular */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                  <input type="number" min={1} max={99} value={values[ustLok.id] ?? 1}
                    onChange={e => {
                      const v = Math.max(1, Math.min(99, Number(e.target.value) || 1))
                      setGrupFrekans([ustLok.id, ...altLokIds], v)
                    }}
                    style={{ width: 50, height: 30, textAlign: 'center', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 14, fontWeight: 700, color: '#111827' }} />
                  <button onClick={() => kaydetCoklu([ustLok.id, ...altLokIds])} disabled={savingIds.size > 0}
                    style={{ height: 30, padding: '0 12px', borderRadius: 6, border: 'none', background: '#111827', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    {savingIds.size > 0 ? '...' : 'Tümünü Kaydet'}
                  </button>
                </div>
              </div>

              {ustAcik && (
                <div>
                  {/* Gruplar */}
                  {altGruplar.map((g: any) => {
                    const gLokIds: string[] = g.lokasyonIds ?? []
                    const gLoklar = gLokIds.map((id: string) => lokasyonlar.find(l => l.id === id)).filter(Boolean) as Lok[]
                    const gAcik = acikGruplar.has(g.id)

                    return (
                      <div key={g.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                        {/* Grup Başlığı */}
                        <div
                          onClick={() => setAcikGruplar(prev => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n })}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 10px 36px', background: '#fff', cursor: 'pointer', userSelect: 'none' }}
                        >
                          <span style={{ fontSize: 11, color: '#6b7280' }}>{gAcik ? '▼' : '▶'}</span>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1f2937', flex: 1 }}>
                            🗂 {g.ad}
                            <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 6 }}>({gLokIds.length} lokasyon)</span>
                          </span>
                          {/* Grup frekans girişi — değeri tüm lokasyonlara uygula + kaydet */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={e => e.stopPropagation()}>
                            <input type="number" min={1} max={99} value={gLoklar.length > 0 ? (values[gLoklar[0].id] ?? 1) : 1}
                              onChange={e => {
                                const v = Math.max(1, Math.min(99, Number(e.target.value) || 1))
                                setGrupFrekans(gLokIds, v)
                              }}
                              style={{ width: 50, height: 28, textAlign: 'center', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 13, fontWeight: 700, color: '#374151' }} />
                            <button onClick={() => kaydetCoklu(gLokIds)} disabled={savingIds.size > 0}
                              style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #111827', background: '#fff', color: '#111827', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              Gruba Uygula
                            </button>
                          </div>
                        </div>
                        {/* Lokasyonlar */}
                        {gAcik && gLoklar.map(l => (
                          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px 7px 60px', borderTop: '1px solid #f9fafb', background: '#fafcfa' }}>
                            <span style={{ color: '#d1d5db', flexShrink: 0, fontSize: 12 }}>└─</span>
                            <span style={{ flex: 1, fontSize: 12.5, color: '#374151' }}>{l.tanim}</span>
                            <input type="number" min={1} max={99} value={values[l.id] ?? 1}
                              onChange={e => setValues(p => ({ ...p, [l.id]: Math.max(1, Math.min(99, Number(e.target.value) || 1)) }))}
                              style={{ width: 46, height: 26, textAlign: 'center', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700, color: '#374151' }} />
                            <button onClick={() => kaydetCoklu([l.id])} disabled={savingIds.size > 0}
                              style={{ height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                              Kaydet
                            </button>
                          </div>
                        ))}
                      </div>
                    )
                  })}

                  {/* Grupsuz lokasyonlar */}
                  {grupsuzLokIds.length > 0 && (
                    <div style={{ borderTop: '1px solid #f3f4f6' }}>
                      <div style={{ padding: '8px 16px 8px 36px', fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Grupsuz Lokasyonlar</div>
                      {grupsuzLokIds.map(id => {
                        const l = lokasyonlar.find(ll => ll.id === id)
                        if (!l) return null
                        return (
                          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px 7px 48px', borderTop: '1px solid #f9fafb' }}>
                            <span style={{ color: '#d1d5db', flexShrink: 0, fontSize: 12 }}>└─</span>
                            <span style={{ flex: 1, fontSize: 12.5, color: '#374151' }}>{l.tanim}</span>
                            <input type="number" min={1} max={99} value={values[l.id] ?? 1}
                              onChange={e => setValues(p => ({ ...p, [l.id]: Math.max(1, Math.min(99, Number(e.target.value) || 1)) }))}
                              style={{ width: 46, height: 26, textAlign: 'center', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 700, color: '#374151' }} />
                            <button onClick={() => kaydetCoklu([l.id])} disabled={savingIds.size > 0}
                              style={{ height: 26, padding: '0 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                              Kaydet
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
