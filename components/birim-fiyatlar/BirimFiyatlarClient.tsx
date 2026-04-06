'use client'

import { useEffect, useState, useCallback } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

type Grup = { id: string; ad: string; ust_lokasyon_id: string | null; aktif: boolean }
type Lokasyon = { id: string; tanim: string; parent_id: string | null; aktif: boolean }
type GrupUye = { grup_id: string; lokasyon_id: string }
type Fiyat = { id: string; grup_id: string | null; lokasyon_id: string | null; fiyat: number; para_birimi: string }
type Draft = { fiyat: string; para_birimi: string }

interface Props {
  projeId: string
  readonly?: boolean
}

const PARA_BIRIMLERI = ['TRY', 'USD', 'EUR', 'GBP']

export default function BirimFiyatlarClient({ projeId, readonly = false }: Props) {
  const { toast } = useToast()
  const [gruplar, setGruplar]       = useState<Grup[]>([])
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>([])
  const [grupUyeleri, setGrupUyeleri] = useState<GrupUye[]>([])
  const [fiyatlar, setFiyatlar]     = useState<Fiyat[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState<string | null>(null)
  const [acikLoklar, setAcikLoklar] = useState<Set<string>>(new Set())
  const [acikGruplar, setAcikGruplar] = useState<Set<string>>(new Set())
  const [drafts, setDrafts]         = useState<Record<string, Draft>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/birim-fiyatlar?proje_id=${projeId}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setGruplar(json.gruplar ?? [])
      setLokasyonlar(json.lokasyonlar ?? [])
      setGrupUyeleri(json.grup_uyeleri ?? [])
      const fiyatList: Fiyat[] = json.fiyatlar ?? []
      setFiyatlar(fiyatList)

      const d: Record<string, Draft> = {}
      for (const f of fiyatList) {
        const val = f.fiyat === 0 ? '' : String(f.fiyat)
        if (f.grup_id)      d[`grup:${f.grup_id}`]      = { fiyat: val, para_birimi: f.para_birimi }
        if (f.lokasyon_id)  d[`lok:${f.lokasyon_id}`]   = { fiyat: val, para_birimi: f.para_birimi }
      }
      setDrafts(d)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }, [projeId, toast])

  useEffect(() => { load() }, [load])

  function getDraft(key: string): Draft {
    return drafts[key] ?? { fiyat: '', para_birimi: 'TRY' }
  }

  // Grup fiyatı değişince altındaki lokasyonları da otomatik doldur
  function onGrupFiyatChange(grupId: string, val: string) {
    const memberLokIds = grupLokMap.get(grupId) ?? []
    setDrafts(prev => {
      const n = { ...prev }
      const pb = (n[`grup:${grupId}`] ?? { para_birimi: 'TRY' }).para_birimi
      n[`grup:${grupId}`] = { fiyat: val, para_birimi: pb }
      for (const lokId of memberLokIds) {
        n[`lok:${lokId}`] = { fiyat: val, para_birimi: pb }
      }
      return n
    })
  }

  function onGrupPbChange(grupId: string, pb: string) {
    const memberLokIds = grupLokMap.get(grupId) ?? []
    setDrafts(prev => {
      const n = { ...prev }
      const fiyat = (n[`grup:${grupId}`] ?? { fiyat: '' }).fiyat
      n[`grup:${grupId}`] = { fiyat, para_birimi: pb }
      for (const lokId of memberLokIds) {
        n[`lok:${lokId}`] = { ...(n[`lok:${lokId}`] ?? { fiyat: '' }), para_birimi: pb }
      }
      return n
    })
  }

  // Tümünü Kaydet — grup + tüm üye lokasyonlar tek request
  async function kaydetGrup(grupId: string) {
    const key = `grup:${grupId}`
    const grupDraft = getDraft(key)
    const memberLokIds = grupLokMap.get(grupId) ?? []
    setSaving(key)
    try {
      const items: any[] = [
        { grup_id: grupId, fiyat: parseFloat(grupDraft.fiyat.replace(',', '.')) || 0, para_birimi: grupDraft.para_birimi },
        ...memberLokIds.map(lokId => {
          const d = getDraft(`lok:${lokId}`)
          return { lokasyon_id: lokId, fiyat: parseFloat(d.fiyat.replace(',', '.')) || 0, para_birimi: d.para_birimi }
        }),
      ]
      const res = await fetch('/api/birim-fiyatlar/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proje_id: projeId, items }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      await load()
      toast({ type: 'success', title: 'Kaydedildi', message: `Grup ve ${memberLokIds.length} lokasyon güncellendi.` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Kaydedilemedi' })
    } finally {
      setSaving(null)
    }
  }

  // Lokasyon tek kaydet
  async function kaydetLok(lokId: string) {
    const key = `lok:${lokId}`
    const draft = getDraft(key)
    const fiyatNum = parseFloat(draft.fiyat.replace(',', '.')) || 0
    setSaving(key)
    try {
      const res = await fetch('/api/birim-fiyatlar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proje_id: projeId, fiyat: fiyatNum, para_birimi: draft.para_birimi, lokasyon_id: lokId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (json.deleted) {
        setFiyatlar(prev => prev.filter(f => f.lokasyon_id !== lokId))
      } else {
        setFiyatlar(prev => [...prev.filter(f => f.lokasyon_id !== lokId), json.data])
      }
      toast({ type: 'success', title: 'Kaydedildi', message: fiyatNum === 0 ? 'Fiyat silindi.' : 'Lokasyon fiyatı kaydedildi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Kaydedilemedi' })
    } finally {
      setSaving(null)
    }
  }

  function toggleLok(id: string) {
    setAcikLoklar(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleGrup(id: string) {
    setAcikGruplar(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── Computed maps ─────────────────────────────────────────────────────────
  const grupLokMap = new Map<string, string[]>()
  for (const u of grupUyeleri) {
    const arr = grupLokMap.get(u.grup_id) ?? []; arr.push(u.lokasyon_id); grupLokMap.set(u.grup_id, arr)
  }
  const lokMap = new Map<string, Lokasyon>()
  for (const l of lokasyonlar) lokMap.set(l.id, l)

  const ustLokasyonlar = lokasyonlar
    .filter(l => l.parent_id === null)
    .sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))

  // Gruplara ait üst lokasyon olmayan / bilinmeyenler için fallback
  const gruplarSizUst = gruplar.filter(g => !g.ust_lokasyon_id)

  if (loading) {
    return <div className="verde-card" style={{ padding: 20, color: '#9a7b6a', fontSize: 14 }}>Yükleniyor…</div>
  }

  const renderGrup = (grup: Grup) => {
    const grupKey  = `grup:${grup.id}`
    const grupDraft = getDraft(grupKey)
    const isAcik   = acikGruplar.has(grup.id)
    const memberLokIds = grupLokMap.get(grup.id) ?? []
    const memberLoks = memberLokIds.map(id => lokMap.get(id)).filter(Boolean) as Lokasyon[]
    const isSaving = saving === grupKey

    return (
      <div key={grup.id} style={{ background: '#fff', borderTop: '1px solid #eaf3ea' }}>
        {/* Grup satırı */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px 9px 32px' }}>
          {memberLoks.length > 0 ? (
            <button
              onClick={() => toggleGrup(grup.id)}
              style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #c8dcc8', background: '#f0f7f0', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#2e6b2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              {isAcik ? '▲' : '▼'}
            </button>
          ) : (
            <div style={{ width: 20 }} />
          )}

          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1a3a1a' }}>
            🗂 {grup.ad}
            <span style={{ fontSize: 11, color: '#9a7b6a', fontWeight: 400, marginLeft: 6 }}>
              ({memberLoks.length} lokasyon)
            </span>
          </span>

          <input
            type="number" min="0" step="0.01"
            disabled={readonly}
            value={grupDraft.fiyat}
            onChange={e => onGrupFiyatChange(grup.id, e.target.value)}
            placeholder="0.00"
            style={{ width: 100, padding: '4px 8px', borderRadius: 6, fontSize: 13, border: '1px solid #ffd9a0', background: readonly ? '#f5f5f5' : '#fff', color: '#1a3a1a' }}
          />
          <select
            disabled={readonly}
            value={grupDraft.para_birimi}
            onChange={e => onGrupPbChange(grup.id, e.target.value)}
            style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #ffd9a0', fontSize: 12, background: readonly ? '#f5f5f5' : '#fff' }}
          >
            {PARA_BIRIMLERI.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {!readonly && (
            <button
              disabled={isSaving}
              onClick={() => kaydetGrup(grup.id)}
              style={{ padding: '4px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700, border: '1px solid #86efac', background: isSaving ? '#fff7ed' : '#dcfce7', color: '#15803d', cursor: isSaving ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
            >
              {isSaving ? '…' : 'Tümünü Kaydet'}
            </button>
          )}
        </div>

        {/* Lokasyon listesi */}
        {isAcik && memberLoks.length > 0 && (
          <div>
            {memberLoks.map((lok, idx) => {
              const lokKey  = `lok:${lok.id}`
              const lokDraft = getDraft(lokKey)
              const isLokSaving = saving === lokKey
              return (
                <div key={lok.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px 7px 56px',
                  borderTop: '1px solid #f0f7f0',
                  background: idx % 2 === 0 ? '#fafcfa' : '#fff',
                }}>
                  <span style={{ flex: 1, fontSize: 12, color: '#6b4423', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ color: '#d4b896' }}>└─</span>
                    {lok.tanim}
                  </span>
                  <input
                    type="number" min="0" step="0.01"
                    disabled={readonly}
                    value={lokDraft.fiyat}
                    onChange={e => setDrafts(prev => ({ ...prev, [lokKey]: { ...getDraft(lokKey), fiyat: e.target.value } }))}
                    placeholder="0.00"
                    style={{ width: 90, padding: '3px 7px', borderRadius: 6, fontSize: 12, border: '1px solid #ffd9a0', background: readonly ? '#f5f5f5' : '#fff', color: '#1a3a1a' }}
                  />
                  <select
                    disabled={readonly}
                    value={lokDraft.para_birimi}
                    onChange={e => setDrafts(prev => ({ ...prev, [lokKey]: { ...getDraft(lokKey), para_birimi: e.target.value } }))}
                    style={{ padding: '3px 5px', borderRadius: 6, border: '1px solid #ffd9a0', fontSize: 11, background: readonly ? '#f5f5f5' : '#fff' }}
                  >
                    {PARA_BIRIMLERI.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {!readonly && (
                    <button
                      disabled={isLokSaving}
                      onClick={() => kaydetLok(lok.id)}
                      style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: '1px solid #86efac', background: isLokSaving ? '#fff7ed' : '#dcfce7', color: '#15803d', cursor: isLokSaving ? 'default' : 'pointer' }}
                    >
                      {isLokSaving ? '…' : 'Kaydet'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ padding: '10px 14px', background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 8, fontSize: 13, color: '#78350f' }}>
        <strong>Birim Fiyat Kuralları:</strong> Grup fiyatı girildiğinde alt lokasyonlara otomatik uygulanır; lokasyon fiyatları bireysel olarak değiştirilebilir.
        "Tümünü Kaydet" grup ve tüm lokasyonları kaydeder. Fiyatı silmek için 0 girip kaydedin.
      </div>

      {ustLokasyonlar.length === 0 && gruplarSizUst.length === 0 && (
        <div className="verde-card" style={{ padding: 20, color: '#9a7b6a', fontSize: 14 }}>Bu projede lokasyon grubu bulunamadı.</div>
      )}

      {/* Üst lokasyon bazlı gruplar */}
      {ustLokasyonlar.map(ustLok => {
        const altGruplar = gruplar.filter(g => g.ust_lokasyon_id === ustLok.id)
        if (altGruplar.length === 0) return null
        const isAcik = acikLoklar.has(ustLok.id)

        return (
          <div key={ustLok.id} style={{ border: '1px solid #c8dcc8', borderRadius: 10, overflow: 'hidden' }}>
            <div
              onClick={() => toggleLok(ustLok.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#e8f5e8', cursor: 'pointer', userSelect: 'none' }}
            >
              <span style={{ fontSize: 14, fontWeight: 800, color: '#1a3a1a', flex: 1 }}>
                📍 {ustLok.tanim}
                <span style={{ fontSize: 11, color: '#9a7b6a', fontWeight: 400, marginLeft: 8 }}>
                  ({altGruplar.length} grup)
                </span>
              </span>
              <span style={{ fontSize: 12, color: '#2e6b2e' }}>{isAcik ? '▲' : '▼'}</span>
            </div>

            {isAcik && (
              <div style={{ background: '#f5faf5' }}>
                {altGruplar.map(renderGrup)}
              </div>
            )}
          </div>
        )
      })}

      {/* Üst lokasyonu olmayan gruplar */}
      {gruplarSizUst.length > 0 && (
        <div style={{ border: '1px solid #e2d6f0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#f3eeff', fontSize: 13, fontWeight: 700, color: '#4a3070' }}>
            🗂 Üst Lokasyon Atanmamış Gruplar
          </div>
          <div style={{ background: '#fafcfa' }}>
            {gruplarSizUst.map(renderGrup)}
          </div>
        </div>
      )}
    </div>
  )
}
