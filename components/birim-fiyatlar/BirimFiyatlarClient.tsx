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
  const [aktifTab, setAktifTab] = useState<'gruplar' | 'lokasyonlar'>('gruplar')
  const [gruplar, setGruplar] = useState<Grup[]>([])
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>([])
  const [grupUyeleri, setGrupUyeleri] = useState<GrupUye[]>([])
  const [fiyatlar, setFiyatlar] = useState<Fiyat[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  // Anlık düzenleme değerleri: key = `grup:{id}` veya `lok:{id}`
  const [drafts, setDrafts] = useState<Record<string, { fiyat: string; para_birimi: string }>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/birim-fiyatlar?proje_id=${projeId}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setGruplar(json.gruplar ?? [])
      setLokasyonlar(json.lokasyonlar ?? [])
      setGrupUyeleri(json.grup_uyeleri ?? [])
      setFiyatlar(json.fiyatlar ?? [])
      // Mevcut fiyatları draft'a yükle
      const d: Record<string, { fiyat: string; para_birimi: string }> = {}
      for (const f of json.fiyatlar ?? []) {
        if (f.grup_id) d[`grup:${f.grup_id}`] = { fiyat: fmt(f.fiyat), para_birimi: f.para_birimi }
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

  // Kayıtlı fiyat: map
  const grupFiyatMap = new Map<string, Fiyat>()
  const lokFiyatMap = new Map<string, Fiyat>()
  for (const f of fiyatlar) {
    if (f.grup_id) grupFiyatMap.set(f.grup_id, f)
    if (f.lokasyon_id) lokFiyatMap.set(f.lokasyon_id, f)
  }

  // Grup → lokasyon id listesi
  const grupLokMap = new Map<string, string[]>()
  for (const u of grupUyeleri) {
    const arr = grupLokMap.get(u.grup_id) ?? []
    arr.push(u.lokasyon_id)
    grupLokMap.set(u.grup_id, arr)
  }

  // Lokasyon → hangi gruplarda üye?
  const lokGrupMap = new Map<string, string[]>()
  for (const u of grupUyeleri) {
    const arr = lokGrupMap.get(u.lokasyon_id) ?? []
    arr.push(u.grup_id)
    lokGrupMap.set(u.lokasyon_id, arr)
  }

  async function kaydet(type: 'grup' | 'lok', id: string) {
    const key = `${type}:${id}`
    const draft = getDraft(key)
    const fiyatNum = parseFloat(draft.fiyat.replace(',', '.')) || 0
    setSaving(key)
    try {
      const body: any = { proje_id: projeId, fiyat: fiyatNum, para_birimi: draft.para_birimi }
      if (type === 'grup') body.grup_id = id
      else body.lokasyon_id = id
      const res = await fetch('/api/birim-fiyatlar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // Fiyatlar listesini güncelle
      if (json.deleted) {
        setFiyatlar(prev => prev.filter(f => type === 'grup' ? f.grup_id !== id : f.lokasyon_id !== id))
        setDrafts(prev => { const n = { ...prev }; delete n[key]; return n })
      } else {
        setFiyatlar(prev => {
          const filtered = prev.filter(f => type === 'grup' ? f.grup_id !== id : f.lokasyon_id !== id)
          return [...filtered, json.data]
        })
      }
      toast({ type: 'success', title: 'Kaydedildi', message: fiyatNum === 0 ? 'Fiyat silindi.' : 'Fiyat kaydedildi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message ?? 'Kaydedilemedi' })
    } finally {
      setSaving(null)
    }
  }

  // Lokasyon ağaç yapısı
  function buildTree(items: Lokasyon[], parentId: string | null = null): Lokasyon[] {
    return items.filter(l => l.parent_id === parentId)
  }

  function renderLokasyonRow(lok: Lokasyon, depth = 0): React.ReactNode {
    const key = `lok:${lok.id}`
    const draft = getDraft(key)
    // Bu lokasyonun bağlı olduğu gruplarda grup fiyatı var mı?
    const grupIds = lokGrupMap.get(lok.id) ?? []
    const grupFiyatliMi = grupIds.some(gid => grupFiyatMap.has(gid))
    const disabled = readonly || grupFiyatliMi

    const children = buildTree(lokasyonlar, lok.id)

    return (
      <div key={lok.id}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
          paddingLeft: 12 + depth * 20,
          borderBottom: '1px solid #f0f7f0',
          background: depth === 0 ? '#fafcfa' : '#fff',
        }}>
          <div style={{ flex: 1, fontSize: 13, fontWeight: depth === 0 ? 600 : 400, color: '#1a3a1a' }}>
            {depth > 0 && <span style={{ color: '#b0c8b0', marginRight: 4 }}>└─</span>}
            {lok.tanim}
            {grupFiyatliMi && <span style={{ fontSize: 11, color: '#92400e', marginLeft: 6, background: '#fef9c3', borderRadius: 4, padding: '1px 6px' }}>Grup fiyatı geçerli</span>}
          </div>
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            value={draft.fiyat}
            onChange={e => setDraft(key, { fiyat: e.target.value })}
            placeholder="0.00"
            style={{
              width: 100, padding: '4px 8px', borderRadius: 6, fontSize: 13,
              border: '1px solid #d6e4d6', background: disabled ? '#f5f5f5' : '#fff',
              color: disabled ? '#aaa' : '#1a3a1a',
            }}
          />
          <select
            disabled={disabled}
            value={draft.para_birimi}
            onChange={e => setDraft(key, { para_birimi: e.target.value })}
            style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #d6e4d6', fontSize: 12, background: disabled ? '#f5f5f5' : '#fff' }}
          >
            {PARA_BIRIMLERI.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {!readonly && (
            <button
              disabled={disabled || saving === key}
              onClick={() => kaydet('lok', lok.id)}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: '1px solid #86efac', background: disabled ? '#f5f5f5' : '#dcfce7',
                color: disabled ? '#aaa' : '#15803d', cursor: disabled ? 'default' : 'pointer',
              }}
            >
              {saving === key ? '…' : 'Kaydet'}
            </button>
          )}
        </div>
        {children.map(c => renderLokasyonRow(c, depth + 1))}
      </div>
    )
  }

  function renderGrupRow(grup: Grup) {
    const key = `grup:${grup.id}`
    const draft = getDraft(key)
    const lokIds = grupLokMap.get(grup.id) ?? []
    // Bu gruptaki herhangi bir lokasyona fiyat girilmiş mi?
    const lokFiyatliMi = lokIds.some(lid => lokFiyatMap.has(lid))
    const disabled = readonly || lokFiyatliMi
    const kayitliLokasyonlar = lokasyonlar.filter(l => lokIds.includes(l.id))

    return (
      <div key={grup.id} style={{ border: '1px solid #e8f0e8', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
        {/* Grup başlığı + fiyat */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: '#f0f7f0', borderBottom: kayitliLokasyonlar.length > 0 ? '1px solid #e8f0e8' : 'none',
        }}>
          <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: '#1a3a1a' }}>
            🗺️ {grup.ad}
            {lokFiyatliMi && <span style={{ fontSize: 11, color: '#0369a1', marginLeft: 6, background: '#e0f2fe', borderRadius: 4, padding: '1px 6px' }}>Lokasyon fiyatları geçerli</span>}
          </div>
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={disabled}
            value={draft.fiyat}
            onChange={e => setDraft(key, { fiyat: e.target.value })}
            placeholder="0.00"
            style={{
              width: 100, padding: '4px 8px', borderRadius: 6, fontSize: 13,
              border: '1px solid #d6e4d6', background: disabled ? '#f5f5f5' : '#fff',
              color: disabled ? '#aaa' : '#1a3a1a',
            }}
          />
          <select
            disabled={disabled}
            value={draft.para_birimi}
            onChange={e => setDraft(key, { para_birimi: e.target.value })}
            style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #d6e4d6', fontSize: 12, background: disabled ? '#f5f5f5' : '#fff' }}
          >
            {PARA_BIRIMLERI.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {!readonly && (
            <button
              disabled={disabled || saving === key}
              onClick={() => kaydet('grup', grup.id)}
              style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: '1px solid #86efac', background: disabled ? '#f5f5f5' : '#dcfce7',
                color: disabled ? '#aaa' : '#15803d', cursor: disabled ? 'default' : 'pointer',
              }}
            >
              {saving === key ? '…' : 'Kaydet'}
            </button>
          )}
        </div>
        {/* Lokasyon üyeleri */}
        {kayitliLokasyonlar.map(lok => {
          const lokKey = `lok:${lok.id}`
          const lokDraft = getDraft(lokKey)
          const lokDisabled = readonly || grupFiyatMap.has(grup.id)
          return (
            <div key={lok.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px 7px 30px',
              borderBottom: '1px solid #f4faf4',
              background: '#fff',
            }}>
              <div style={{ flex: 1, fontSize: 12, color: '#506050' }}>
                <span style={{ color: '#b0c8b0', marginRight: 4 }}>└─</span>
                {lok.tanim}
                {grupFiyatMap.has(grup.id) && <span style={{ fontSize: 11, color: '#92400e', marginLeft: 6, background: '#fef9c3', borderRadius: 4, padding: '1px 5px' }}>Grup fiyatı geçerli</span>}
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
                  onClick={() => kaydet('lok', lok.id)}
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
    )
  }

  const rootLokasyonlar = buildTree(lokasyonlar, null)

  if (loading) {
    return <div className="verde-card" style={{ padding: 20, color: '#7a907a', fontSize: 14 }}>Yükleniyor…</div>
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Açıklama kartı */}
      <div className="verde-card" style={{ padding: '12px 16px', background: '#fef9c3', border: '1px solid #fbbf24', borderRadius: 8 }}>
        <div style={{ fontSize: 13, color: '#78350f' }}>
          <strong>Birim Fiyat Kuralları:</strong> Grup fiyatı girilirse o grubun lokasyon fiyat alanları devre dışı kalır. Lokasyon fiyatı girilirse o lokasyonun bağlı olduğu grubun fiyat alanı devre dışı kalır. Fiyatı silmek için 0 girip kaydedin.
        </div>
      </div>

      {/* Sekmeler */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #e8f0e8' }}>
        {(['gruplar', 'lokasyonlar'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setAktifTab(tab)}
            style={{
              padding: '8px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: aktifTab === tab ? 700 : 400,
              color: aktifTab === tab ? '#1a5c1a' : '#7a907a',
              borderBottom: aktifTab === tab ? '2px solid #1a5c1a' : '2px solid transparent',
              marginBottom: -2, fontSize: 14,
            }}
          >
            {tab === 'gruplar' ? '🗺️ Lokasyon Grupları' : '📍 Lokasyonlar'}
          </button>
        ))}
      </div>

      {/* Sekme içeriği */}
      {aktifTab === 'gruplar' && (
        <div>
          {gruplar.length === 0 ? (
            <div className="verde-card" style={{ padding: 20, color: '#7a907a', fontSize: 14 }}>Bu projede lokasyon grubu bulunamadı.</div>
          ) : (
            gruplar.map(g => renderGrupRow(g))
          )}
        </div>
      )}

      {aktifTab === 'lokasyonlar' && (
        <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
          {lokasyonlar.length === 0 ? (
            <div style={{ padding: 20, color: '#7a907a', fontSize: 14 }}>Bu projede lokasyon bulunamadı.</div>
          ) : (
            rootLokasyonlar.map(l => renderLokasyonRow(l, 0))
          )}
        </div>
      )}
    </div>
  )
}
