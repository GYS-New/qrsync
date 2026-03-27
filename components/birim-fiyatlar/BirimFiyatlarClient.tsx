'use client'

import { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

type Grup = { id: string; ad: string; ust_lokasyon_id: string | null; aktif: boolean }
type Lokasyon = { id: string; tanim: string; parent_id: string | null; aktif: boolean }
type GrupUye = { grup_id: string; lokasyon_id: string }
type Fiyat = { id: string; grup_id: string | null; lokasyon_id: string | null; fiyat: number; para_birimi: string }

interface Props {
  projeId: string
  readonly?: boolean
}

const PARA_BIRIMLERI = ['TRY', 'USD', 'EUR', 'GBP']

function fmt(n: number) {
  return n === 0 ? '' : String(n)
}

export default function BirimFiyatlarClient({ projeId, readonly = false }: Props) {
  const { toast } = useToast()
  const [gruplar, setGruplar] = useState<Grup[]>([])
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>([])
  const [grupUyeleri, setGrupUyeleri] = useState<GrupUye[]>([])
  const [fiyatlar, setFiyatlar] = useState<Fiyat[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [acik, setAcik] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, { fiyat: string; para_birimi: string }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/birim-fiyatlar?proje_id=${projeId}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      const grps: Grup[] = json.gruplar ?? []
      const fiyatList: Fiyat[] = json.fiyatlar ?? []
      setGruplar(grps)
      setLokasyonlar(json.lokasyonlar ?? [])
      setGrupUyeleri(json.grup_uyeleri ?? [])
      setFiyatlar(fiyatList)

      // Draft: grup fiyatları grup adına göre merge edilir
      const d: Record<string, { fiyat: string; para_birimi: string }> = {}
      // Grup adı → grup id'leri map
      const adMap = new Map<string, string[]>()
      for (const g of grps) {
        const arr = adMap.get(g.ad) ?? []
        arr.push(g.id)
        adMap.set(g.ad, arr)
      }
      for (const f of fiyatList) {
        if (f.grup_id) {
          const g = grps.find(gr => gr.id === f.grup_id)
          if (g) {
            const key = `grupAd:${g.ad}`
            if (!d[key]) d[key] = { fiyat: fmt(f.fiyat), para_birimi: f.para_birimi }
          }
        }
        if (f.lokasyon_id) d[`lok:${f.lokasyon_id}`] = { fiyat: fmt(f.fiyat), para_birimi: f.para_birimi }
      }
      setDrafts(d)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }, [projeId, toast])

  useEffect(() => { load() }, [load])

  function getDraft(key: string) {
    return drafts[key] ?? { fiyat: '', para_birimi: 'TRY' }
  }

  function setDraft(key: string, partial: Partial<{ fiyat: string; para_birimi: string }>) {
    setDrafts(prev => ({ ...prev, [key]: { ...getDraft(key), ...partial } }))
  }

  // Maps
  const grupFiyatMap = new Map<string, Fiyat>()
  const lokFiyatMap = new Map<string, Fiyat>()
  for (const f of fiyatlar) {
    if (f.grup_id) grupFiyatMap.set(f.grup_id, f)
    if (f.lokasyon_id) lokFiyatMap.set(f.lokasyon_id, f)
  }

  const grupLokMap = new Map<string, string[]>()
  for (const u of grupUyeleri) {
    const arr = grupLokMap.get(u.grup_id) ?? []
    arr.push(u.lokasyon_id)
    grupLokMap.set(u.grup_id, arr)
  }

  // Aynı isimli grupları birleştir
  const grupAdMap = new Map<string, Grup[]>()
  for (const g of gruplar) {
    const arr = grupAdMap.get(g.ad) ?? []
    arr.push(g)
    grupAdMap.set(g.ad, arr)
  }
  const mergedGruplar = Array.from(grupAdMap.entries())

  async function kaydetGrupAdi(grupAdi: string, grupIds: string[]) {
    const key = `grupAd:${grupAdi}`
    const draft = getDraft(key)
    const fiyatNum = parseFloat(draft.fiyat.replace(',', '.')) || 0
    setSaving(key)
    try {
      // 1) Grup fiyatlarını kaydet
      for (const id of grupIds) {
        const body = { proje_id: projeId, fiyat: fiyatNum, para_birimi: draft.para_birimi, grup_id: id }
        const res = await fetch('/api/birim-fiyatlar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        if (json.deleted) {
          setFiyatlar(prev => prev.filter(f => f.grup_id !== id))
        } else {
          setFiyatlar(prev => [...prev.filter(f => f.grup_id !== id), json.data])
        }
      }

      // 2) Gruba ait tüm lokasyonları da aynı fiyatla kaydet
      const allLokIds = [...new Set(grupIds.flatMap(gid => grupLokMap.get(gid) ?? []))]
      for (const lokId of allLokIds) {
        const body = { proje_id: projeId, fiyat: fiyatNum, para_birimi: draft.para_birimi, lokasyon_id: lokId }
        const res = await fetch('/api/birim-fiyatlar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        if (json.deleted) {
          setFiyatlar(prev => prev.filter(f => f.lokasyon_id !== lokId))
        } else {
          setFiyatlar(prev => [...prev.filter(f => f.lokasyon_id !== lokId), json.data])
        }
      }

      if (fiyatNum === 0) {
        setDrafts(prev => { const n = { ...prev }; delete n[key]; return n })
      }
      toast({ type: 'success', title: 'Kaydedildi', message: fiyatNum === 0 ? 'Fiyat silindi.' : `Grup ve ${allLokIds.length} lokasyon fiyatı kaydedildi.` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Kaydedilemedi' })
    } finally {
      setSaving(null)
    }
  }

  async function kaydetLok(lokId: string) {
    const key = `lok:${lokId}`
    const draft = getDraft(key)
    const fiyatNum = parseFloat(draft.fiyat.replace(',', '.')) || 0
    setSaving(key)
    try {
      const body = { proje_id: projeId, fiyat: fiyatNum, para_birimi: draft.para_birimi, lokasyon_id: lokId }
      const res = await fetch('/api/birim-fiyatlar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.deleted) {
        setFiyatlar(prev => prev.filter(f => f.lokasyon_id !== lokId))
        setDrafts(prev => { const n = { ...prev }; delete n[key]; return n })
      } else {
        setFiyatlar(prev => [...prev.filter(f => f.lokasyon_id !== lokId), json.data])
      }
      toast({ type: 'success', title: 'Kaydedildi', message: fiyatNum === 0 ? 'Fiyat silindi.' : 'Fiyat kaydedildi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Kaydedilemedi' })
    } finally {
      setSaving(null)
    }
  }

  function toggleAcik(grupAdi: string) {
    setAcik(prev => {
      const n = new Set(prev)
      if (n.has(grupAdi)) n.delete(grupAdi)
      else n.add(grupAdi)
      return n
    })
  }

  if (loading) {
    return <div className="verde-card" style={{ padding: 20, color: '#7a907a', fontSize: 14 }}>Yükleniyor…</div>
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Açıklama */}
      <div style={{ padding: '10px 14px', background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 8, fontSize: 13, color: '#78350f' }}>
        <strong>Birim Fiyat Kuralları:</strong> Grup fiyatı girilirse grubun lokasyon fiyat alanları devre dışı kalır. Fiyatı silmek için 0 girip kaydedin.
      </div>

      {/* Gruplar */}
      {mergedGruplar.length === 0 ? (
        <div className="verde-card" style={{ padding: 20, color: '#7a907a', fontSize: 14 }}>Bu projede lokasyon grubu bulunamadı.</div>
      ) : (
        mergedGruplar.map(([grupAdi, grups]) => {
          const grupIds = grups.map(g => g.id)
          const key = `grupAd:${grupAdi}`
          const draft = getDraft(key)
          const isExpanded = acik.has(grupAdi)

          const allLokIds = [...new Set(grupIds.flatMap(gid => grupLokMap.get(gid) ?? []))]
          const kayitliLokasyonlar = lokasyonlar.filter(l => allLokIds.includes(l.id))

          // Grup fiyatı var mı? (DB'deki kayıt VEYA henüz kaydedilmemiş draft)
          const grupFiyatliMi = grupIds.some(gid => grupFiyatMap.has(gid))
            || (parseFloat(getDraft(key).fiyat.replace(',', '.')) || 0) > 0
          // Herhangi bir lokasyonda kayıtlı fiyat var mı? (grup fiyatı yoksa anlamlı)
          const lokFiyatliMi = !grupFiyatliMi && allLokIds.some(lid => lokFiyatMap.has(lid))

          const grupDisabled = readonly || lokFiyatliMi

          return (
            <div key={grupAdi} style={{ border: '1px solid #e8f0e8', borderRadius: 8, overflow: 'hidden' }}>
              {/* Grup başlık satırı */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: '#f0f7f0',
              }}>
                {/* Expand toggle */}
                {kayitliLokasyonlar.length > 0 && (
                  <button
                    onClick={() => toggleAcik(grupAdi)}
                    style={{
                      width: 22, height: 22, borderRadius: 4, border: '1px solid #c8dcc8',
                      background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                      color: '#2e6b2e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                )}
                {kayitliLokasyonlar.length === 0 && <div style={{ width: 22 }} />}

                <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: '#1a3a1a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  🗺️ {grupAdi}
                  <span style={{ fontSize: 11, color: '#7a907a', fontWeight: 400 }}>({kayitliLokasyonlar.length} lokasyon)</span>
                  {lokFiyatliMi && <span style={{ fontSize: 11, color: '#0369a1', background: '#e0f2fe', borderRadius: 4, padding: '1px 6px' }}>Lokasyon fiyatları geçerli</span>}
                </div>

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={grupDisabled}
                  value={draft.fiyat}
                  onChange={e => setDraft(key, { fiyat: e.target.value })}
                  placeholder="0.00"
                  style={{
                    width: 100, padding: '4px 8px', borderRadius: 6, fontSize: 13,
                    border: '1px solid #d6e4d6', background: grupDisabled ? '#f5f5f5' : '#fff',
                    color: grupDisabled ? '#aaa' : '#1a3a1a',
                  }}
                />
                <select
                  disabled={grupDisabled}
                  value={draft.para_birimi}
                  onChange={e => setDraft(key, { para_birimi: e.target.value })}
                  style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #d6e4d6', fontSize: 12, background: grupDisabled ? '#f5f5f5' : '#fff' }}
                >
                  {PARA_BIRIMLERI.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {!readonly && (
                  <button
                    disabled={grupDisabled || saving === key}
                    onClick={() => kaydetGrupAdi(grupAdi, grupIds)}
                    style={{
                      padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: '1px solid #86efac', background: grupDisabled ? '#f5f5f5' : '#dcfce7',
                      color: grupDisabled ? '#aaa' : '#15803d', cursor: grupDisabled ? 'default' : 'pointer',
                    }}
                  >
                    {saving === key ? '…' : 'Kaydet'}
                  </button>
                )}
              </div>

              {/* Lokasyonlar — sadece açıkken göster */}
              {isExpanded && kayitliLokasyonlar.length > 0 && (
                <div>
                  {kayitliLokasyonlar.map((lok, idx) => {
                    const lokKey = `lok:${lok.id}`
                    const lokDraft = getDraft(lokKey)
                    const lokDisabled = readonly || grupFiyatliMi

                    return (
                      <div key={lok.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '7px 14px 7px 46px',
                        borderTop: '1px solid #f0f7f0',
                        background: idx % 2 === 0 ? '#fff' : '#fafcfa',
                      }}>
                        <div style={{ flex: 1, fontSize: 12, color: '#506050', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#b0c8b0' }}>└─</span>
                          {lok.tanim}
                          {grupFiyatliMi && (
                            <span style={{ fontSize: 11, color: '#92400e', background: '#fef9c3', borderRadius: 4, padding: '1px 5px' }}>
                              Grup fiyatı geçerli
                            </span>
                          )}
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          disabled={lokDisabled}
                          value={lokDraft.fiyat}
                          onChange={e => setDraft(lokKey, { fiyat: e.target.value })}
                          placeholder="0.00"
                          style={{
                            width: 90, padding: '3px 7px', borderRadius: 6, fontSize: 12,
                            border: '1px solid #d6e4d6', background: lokDisabled ? '#f5f5f5' : '#fff',
                            color: lokDisabled ? '#aaa' : '#1a3a1a',
                          }}
                        />
                        <select
                          disabled={lokDisabled}
                          value={lokDraft.para_birimi}
                          onChange={e => setDraft(lokKey, { para_birimi: e.target.value })}
                          style={{ padding: '3px 5px', borderRadius: 6, border: '1px solid #d6e4d6', fontSize: 11, background: lokDisabled ? '#f5f5f5' : '#fff' }}
                        >
                          {PARA_BIRIMLERI.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        {!readonly && (
                          <button
                            disabled={lokDisabled || saving === lokKey}
                            onClick={() => kaydetLok(lok.id)}
                            style={{
                              padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                              border: '1px solid #86efac', background: lokDisabled ? '#f5f5f5' : '#dcfce7',
                              color: lokDisabled ? '#aaa' : '#15803d', cursor: lokDisabled ? 'default' : 'pointer',
                            }}
                          >
                            {saving === lokKey ? '…' : 'Kaydet'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
