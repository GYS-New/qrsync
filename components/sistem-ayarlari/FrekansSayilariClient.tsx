'use client'

import React, { useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

const T = {
  green: '#111827', greenMid: '#374151', border: '#e2e8f0', text: '#0f172a',
  textSoft: '#64748b', grayLight: '#f8fafc',
}

interface Lok {
  id: string
  tanim: string
  parent_id?: string | null
  gunluk_frekans_sayisi?: number | null
}

interface Props {
  lokasyonlar: Lok[]
}

type TreeNode = Lok & { children: TreeNode[] }

function buildTree(loks: Lok[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const l of loks) map.set(l.id, { ...l, children: [] })
  const roots: TreeNode[] = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  // Sort alphabetically
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))
    for (const n of nodes) sortNodes(n.children)
  }
  sortNodes(roots)
  return roots
}

function getAllDescendantIds(node: TreeNode): string[] {
  const ids: string[] = []
  for (const c of node.children) {
    ids.push(c.id)
    ids.push(...getAllDescendantIds(c))
  }
  return ids
}

export default function FrekansSayilariClient({ lokasyonlar }: Props) {
  const { toast } = useToast()

  // Frekans değerleri state
  const [values, setValues] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const l of lokasyonlar) m[l.id] = l.gunluk_frekans_sayisi ?? 1
    return m
  })

  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [openIds, setOpenIds]     = useState<Set<string>>(new Set())

  const tree = React.useMemo(() => buildTree(lokasyonlar), [lokasyonlar])

  const toggle = (id: string) => setOpenIds(prev => {
    const s = new Set(prev)
    s.has(id) ? s.delete(id) : s.add(id)
    return s
  })

  const saveSingle = async (id: string) => {
    setSavingIds(prev => new Set(prev).add(id))
    try {
      const res = await fetch('/api/sistem-ayarlari/frekans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: [{ id, gunluk_frekans_sayisi: values[id] }] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ type: 'success', title: 'Kaydedildi', message: `Frekans sayısı güncellendi.` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSavingIds(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  const saveAll = async (node: TreeNode) => {
    const allIds = [node.id, ...getAllDescendantIds(node)]
    setSavingIds(new Set(allIds))
    try {
      const updates = allIds.map(id => ({ id, gunluk_frekans_sayisi: values[id] }))
      const res = await fetch('/api/sistem-ayarlari/frekans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ type: 'success', title: 'Kaydedildi', message: `${allIds.length} lokasyon güncellendi.` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSavingIds(new Set())
  }

  // Üst lokasyona yazınca tüm altlarına da yaz
  const setWithChildren = (node: TreeNode, val: number) => {
    const ids = [node.id, ...getAllDescendantIds(node)]
    setValues(prev => {
      const next = { ...prev }
      for (const id of ids) next[id] = val
      return next
    })
  }

  function LokRow({ node, depth }: { node: TreeNode; depth: number }) {
    const hasChildren = node.children.length > 0
    const isOpen = openIds.has(node.id)
    const isSaving = savingIds.has(node.id)
    const isRoot = depth === 0

    return (
      <>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          paddingLeft: 12 + depth * 24,
          background: isRoot ? '#f9fafb' : depth % 2 === 0 ? '#fff' : T.grayLight,
          borderBottom: `1px solid ${T.border}`,
          borderLeft: isRoot ? `3px solid ${T.greenMid}` : `3px solid transparent`,
        }}>
          {/* Açılır/kapanır */}
          {hasChildren ? (
            <button onClick={() => toggle(node.id)} style={{
              width: 24, height: 24, borderRadius: 4, border: `1px solid ${T.border}`,
              background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              color: T.textSoft, display: 'grid', placeItems: 'center', flexShrink: 0,
            }}>
              {isOpen ? '▾' : '▸'}
            </button>
          ) : (
            <div style={{ width: 24, flexShrink: 0 }} />
          )}

          {/* Lokasyon adı */}
          <span style={{
            flex: 1, fontSize: isRoot ? 14 : 13, fontWeight: isRoot ? 700 : 500,
            color: T.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {node.tanim}
          </span>

          {/* Frekans input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <button
              onClick={() => {
                const v = Math.max(1, (values[node.id] ?? 1) - 1)
                hasChildren ? setWithChildren(node, v) : setValues(p => ({ ...p, [node.id]: v }))
              }}
              style={{
                width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`,
                background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700,
                color: T.greenMid, display: 'grid', placeItems: 'center',
              }}
            >−</button>
            <input
              type="number" min={1} max={99}
              value={values[node.id] ?? 1}
              onChange={e => {
                const v = Math.max(1, Math.min(99, Number(e.target.value) || 1))
                hasChildren ? setWithChildren(node, v) : setValues(p => ({ ...p, [node.id]: v }))
              }}
              style={{
                width: 44, height: 28, textAlign: 'center', borderRadius: 6,
                border: `1px solid ${T.border}`, fontSize: 15, fontWeight: 700,
                color: T.greenMid,
              }}
            />
            <button
              onClick={() => {
                const v = Math.min(99, (values[node.id] ?? 1) + 1)
                hasChildren ? setWithChildren(node, v) : setValues(p => ({ ...p, [node.id]: v }))
              }}
              style={{
                width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`,
                background: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700,
                color: T.greenMid, display: 'grid', placeItems: 'center',
              }}
            >+</button>
          </div>

          {/* Kaydet butonu */}
          <button onClick={() => saveSingle(node.id)} disabled={isSaving}
            style={{
              height: 28, padding: '0 10px', borderRadius: 6, border: 'none',
              background: T.green, color: '#fff', fontSize: 12, fontWeight: 700,
              cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1,
              flexShrink: 0, whiteSpace: 'nowrap',
            }}>
            {isSaving ? '...' : 'Kaydet'}
          </button>

          {/* Tümünü Kaydet (sadece üst lokasyonlarda) */}
          {hasChildren && (
            <button onClick={() => saveAll(node)} disabled={savingIds.size > 0}
              style={{
                height: 28, padding: '0 10px', borderRadius: 6, border: `1px solid ${T.green}`,
                background: '#fff', color: T.green, fontSize: 12, fontWeight: 700,
                cursor: savingIds.size > 0 ? 'not-allowed' : 'pointer',
                flexShrink: 0, whiteSpace: 'nowrap',
              }}>
              Tümünü Kaydet
            </button>
          )}
        </div>

        {/* Alt lokasyonlar */}
        {hasChildren && isOpen && node.children.map(c => (
          <LokRow key={c.id} node={c} depth={depth + 1} />
        ))}
      </>
    )
  }

  if (!lokasyonlar.length) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: T.textSoft, fontSize: 14 }}>Bu projede lokasyon bulunamadı.</div>
  }

  const toplamFrekans = Object.values(values).reduce((s, v) => s + v, 0)

  return (
    <div>
      {/* Bilgi bandı */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ padding: '8px 14px', background: '#f9fafb', border: '1px solid #86efac', borderRadius: 8, fontSize: 13, fontWeight: 700, color: T.green }}>
          {lokasyonlar.length} lokasyon
        </div>
        <div style={{ padding: '8px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#1d4ed8' }}>
          Toplam günlük frekans: {toplamFrekans}
        </div>
        <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
          Üst lokasyona girilen frekans sayısı tüm alt lokasyonlarına da uygulanır. Her lokasyonun kendi kaydet butonu vardır.
        </div>
      </div>

      {/* Ağaç listesi */}
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
        {/* Başlık */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          background: T.green, color: '#fff', fontSize: 13, fontWeight: 700,
        }}>
          <div style={{ width: 24 }} />
          <span style={{ flex: 1 }}>LOKASYON</span>
          <span style={{ width: 120, textAlign: 'center', flexShrink: 0 }}>GÜNLÜK FREKANS</span>
          <span style={{ width: 140, flexShrink: 0 }} />
        </div>

        {tree.map(node => (
          <LokRow key={node.id} node={node} depth={0} />
        ))}
      </div>
    </div>
  )
}
