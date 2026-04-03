'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'

interface LokasyonRow {
  id: string
  tanim: string
  parent_id?: string | null
  min_sure_dakika?: number | null
  max_sure_dakika?: number | null
  aktif: boolean
}

interface Props {
  lokasyonlar: LokasyonRow[]
}

interface DraftValues {
  min: string
  max: string
}

function buildTree(rows: LokasyonRow[]): { roots: LokasyonRow[]; childrenOf: Record<string, LokasyonRow[]> } {
  const childrenOf: Record<string, LokasyonRow[]> = {}
  const roots: LokasyonRow[] = []
  for (const row of rows) {
    if (!row.parent_id) {
      roots.push(row)
    } else {
      if (!childrenOf[row.parent_id]) childrenOf[row.parent_id] = []
      childrenOf[row.parent_id].push(row)
    }
  }
  return { roots, childrenOf }
}

/** Bir lokasyonun tüm torun ID'lerini (çocuk, torun, ...) döndürür */
function getAllDescendantIds(id: string, childrenOf: Record<string, LokasyonRow[]>): string[] {
  const result: string[] = []
  const queue = [...(childrenOf[id] ?? [])]
  while (queue.length) {
    const node = queue.shift()!
    result.push(node.id)
    queue.push(...(childrenOf[node.id] ?? []))
  }
  return result
}

/** Tek lokasyon için API çağrısı */
async function saveSingle(id: string, d: DraftValues): Promise<void> {
  const res = await fetch('/api/lokasyonlar/sure', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      min_sure_dakika: d.min === '' ? null : Number(d.min),
      max_sure_dakika: d.max === '' ? null : Number(d.max),
    }),
  })
  const json = await res.json()
  if (!res.ok || !json.ok) throw new Error(json.error ?? 'Kaydetme hatası')
}

export default function GorevSureleriClient({ lokasyonlar }: Props) {
  const router = useRouter()
  const { roots, childrenOf } = useMemo(() => buildTree(lokasyonlar), [lokasyonlar])

  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, DraftValues>>(() => {
    const init: Record<string, DraftValues> = {}
    for (const lok of lokasyonlar) {
      init[lok.id] = {
        min: lok.min_sure_dakika != null ? String(lok.min_sure_dakika) : '',
        max: lok.max_sure_dakika != null ? String(lok.max_sure_dakika) : '',
      }
    }
    return init
  })
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const toggleOpen = (id: string) => {
    setOpenIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /** Alt lokasyonu olmayan normal draft değişimi */
  const setDraft = (id: string, field: 'min' | 'max', val: string) => {
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }))
    setSaved(prev => ({ ...prev, [id]: false }))
  }

  /**
   * Üst lokasyon draft değişimi:
   * Üst lokasyonun değerini günceller VE tüm torunlarına propagate eder.
   */
  const setParentDraft = (id: string, field: 'min' | 'max', val: string) => {
    const descendantIds = getAllDescendantIds(id, childrenOf)
    setDrafts(prev => {
      const next = { ...prev, [id]: { ...prev[id], [field]: val } }
      for (const childId of descendantIds) {
        next[childId] = { ...next[childId], [field]: val }
        setSaved(s => ({ ...s, [childId]: false }))
      }
      return next
    })
    setSaved(prev => ({ ...prev, [id]: false }))
  }

  /** Tek lokasyonu kaydet */
  const saveSingleLok = useCallback(async (id: string) => {
    setSaving(prev => ({ ...prev, [id]: true }))
    setErrors(prev => ({ ...prev, [id]: '' }))
    try {
      await saveSingle(id, drafts[id] ?? { min: '', max: '' })
      setSaved(prev => ({ ...prev, [id]: true }))
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [id]: err.message }))
    } finally {
      setSaving(prev => ({ ...prev, [id]: false }))
    }
  }, [drafts])

  /**
   * Üst lokasyon + tüm torunları kaydet.
   * Saving durumunu sadece parent ID üzerinden göster.
   */
  const saveAll = useCallback(async (parentId: string) => {
    const allIds = [parentId, ...getAllDescendantIds(parentId, childrenOf)]
    setSaving(prev => ({ ...prev, [parentId]: true }))
    setErrors(prev => ({ ...prev, [parentId]: '' }))
    try {
      await Promise.all(allIds.map(id => saveSingle(id, drafts[id] ?? { min: '', max: '' })))
      setSaved(prev => {
        const next = { ...prev }
        for (const id of allIds) next[id] = true
        return next
      })
      router.refresh()
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [parentId]: err.message }))
    } finally {
      setSaving(prev => ({ ...prev, [parentId]: false }))
    }
  }, [drafts, childrenOf])

  const inputStyle: React.CSSProperties = {
    width: 90,
    padding: '5px 8px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 13,
    outline: 'none',
    textAlign: 'center',
  }

  const renderRow = (lok: LokasyonRow, indent = 0) => {
    const isParent = indent === 0
    const hasChildren = !!(childrenOf[lok.id]?.length)
    const d = drafts[lok.id] ?? { min: '', max: '' }
    const isSaving = saving[lok.id]
    const isSaved = saved[lok.id]
    const err = errors[lok.id]
    const isOpen = openIds.has(lok.id)

    const onChangeMin = (val: string) =>
      isParent && hasChildren ? setParentDraft(lok.id, 'min', val) : setDraft(lok.id, 'min', val)
    const onChangeMax = (val: string) =>
      isParent && hasChildren ? setParentDraft(lok.id, 'max', val) : setDraft(lok.id, 'max', val)

    const saveLabel = isParent && hasChildren
      ? (isSaved ? '✓ Tümü Kaydedildi' : 'Tümünü Kaydet')
      : (isSaved ? '✓ Kaydedildi' : 'Kaydet')

    const onSave = () =>
      isParent && hasChildren ? saveAll(lok.id) : saveSingleLok(lok.id)

    return (
      <div key={lok.id}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            paddingLeft: 14 + indent * 20,
            borderBottom: '1px solid #f0f4f0',
            background: indent === 0 ? '#f0f7f0' : '#fff',
            minHeight: 50,
          }}
        >
          {/* Accordion toggle */}
          {hasChildren ? (
            <button
              onClick={() => toggleOpen(lok.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                width: 22,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2e8b2e',
                fontSize: 14,
                fontWeight: 700,
                flexShrink: 0,
              }}
              title={isOpen ? 'Daralt' : 'Genişlet'}
            >
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <span style={{ width: 22, flexShrink: 0 }} />
          )}

          {/* Lokasyon adı */}
          <span
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: indent === 0 ? 700 : 500,
              color: lok.aktif ? '#1a2e1a' : '#9ca3af',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {indent > 0 && <span style={{ color: '#d1d5db', marginRight: 6 }}>└</span>}
            {lok.tanim}
            {!lok.aktif && <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>(Pasif)</span>}
            {isParent && hasChildren && (
              <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8, fontWeight: 400 }}>
                — süre girişi tüm alt lokasyonlara uygulanır
              </span>
            )}
          </span>

          {/* Min süre */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Min. (dk)</span>
            <input
              type="number"
              min={0}
              value={d.min}
              onChange={e => onChangeMin(e.target.value)}
              placeholder="—"
              style={{
                ...inputStyle,
                borderColor: isParent && hasChildren ? '#86efac' : '#d1d5db',
              }}
            />
          </div>

          {/* Max süre */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Max. (dk)</span>
            <input
              type="number"
              min={0}
              value={d.max}
              onChange={e => onChangeMax(e.target.value)}
              placeholder="—"
              style={{
                ...inputStyle,
                borderColor: isParent && hasChildren ? '#86efac' : '#d1d5db',
              }}
            />
          </div>

          {/* Kaydet / Tümünü Kaydet */}
          <button
            onClick={onSave}
            disabled={isSaving}
            style={{
              padding: '6px 14px',
              background: isSaved ? '#dcf0dc' : '#1a5c2a',
              color: isSaved ? '#1a5c2a' : '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 600,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.7 : 1,
              minWidth: isParent && hasChildren ? 130 : 80,
              transition: 'all 0.15s',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {isSaving ? '...' : saveLabel}
          </button>
        </div>

        {/* Hata */}
        {err && (
          <div style={{ paddingLeft: 14 + indent * 20 + 32, paddingBottom: 6, fontSize: 12, color: '#dc2626' }}>
            {err}
          </div>
        )}

        {/* Alt lokasyonlar */}
        {hasChildren && isOpen && (
          <div>
            {childrenOf[lok.id].map(child => renderRow(child, indent + 1))}
          </div>
        )}
      </div>
    )
  }

  if (lokasyonlar.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: '#9ca3af' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📍</div>
        <div style={{ fontSize: 15 }}>Bu proje için lokasyon bulunamadı.</div>
      </div>
    )
  }

  return (
    <div>
      {/* Açıklama */}
      <div style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 20,
        fontSize: 13,
        color: '#1e40af',
        lineHeight: 1.6,
      }}>
        <strong>Min. Süre:</strong> SG (Süreli Görev)'lerde görev başlatma ile tamamlama arasındaki zorunlu bekleme süresi. Süre dolmadan görev tamamlanamaz.
        <br />
        <strong>Max. Süre:</strong> Bu süre sonunda görev hâlâ tamamlanmamış ise durum otomatik olarak <strong>İPTAL</strong> edilir.
        <br />
        <span style={{ color: '#6b7280' }}>Üst lokasyona girilen süre tüm alt lokasyonlara uygulanır. Alt lokasyonlar ayrıca düzenlenebilir. Boş bırakılırsa kural uygulanmaz.</span>
      </div>

      {/* Tablo başlığı */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        background: '#1a5c2a',
        borderRadius: '8px 8px 0 0',
        color: '#fff',
        fontSize: 12,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
      }}>
        <span style={{ width: 22, flexShrink: 0 }} />
        <span style={{ flex: 1 }}>Lokasyon</span>
        <span style={{ width: 90, textAlign: 'center' }}>Min. (dk)</span>
        <span style={{ width: 90, textAlign: 'center' }}>Max. (dk)</span>
        <span style={{ width: 130 }} />
      </div>

      {/* Satırlar */}
      <div style={{ border: '1px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
        {roots.map(lok => renderRow(lok, 0))}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: '#9ca3af' }}>
        Toplam {lokasyonlar.length} lokasyon
      </div>
    </div>
  )
}
