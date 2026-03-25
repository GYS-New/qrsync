'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useFirma } from '@/components/layout/FirmaContext'
import { Pencil, Trash2, RefreshCw, Plus, ChevronDown, ChevronRight, Search, Layers } from 'lucide-react'

type GroupRow = {
  id: string
  firma_id: string
  ad: string
  aciklama?: string | null
  aktif?: boolean
  kayit_tarihi?: string
  guncelleme_tarihi?: string
  kayit_yapan_id?: string | null
  ust_lokasyon_id?: string | null
  lokasyonIds: string[]
}

type LocationRow = {
  id: string
  firma_id: string
  parent_id?: string | null
  tanim: string
  aktif?: boolean
  kayit_tarihi?: string
}

function makePath(id: string, map: Map<string, LocationRow>) {
  const parts: string[] = []
  const seen = new Set<string>()
  let cur = map.get(id)
  while (cur && !seen.has(cur.id)) {
    parts.unshift(cur.tanim || '-')
    seen.add(cur.id)
    cur = cur.parent_id ? map.get(cur.parent_id) : undefined
  }
  return parts.join(' / ')
}

function collectDescendantIds(rootId: string, locations: LocationRow[]) {
  const childrenMap = new Map<string, string[]>()
  for (const loc of locations) {
    if (!loc.parent_id) continue
    const arr = childrenMap.get(loc.parent_id) ?? []
    arr.push(loc.id)
    childrenMap.set(loc.parent_id, arr)
  }
  const result: string[] = []
  const stack = [...(childrenMap.get(rootId) ?? [])]
  const seen = new Set<string>()
  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    result.push(id)
    for (const child of childrenMap.get(id) ?? []) stack.push(child)
  }
  return result
}

export default function LokasyonGruplariClient({
  base,
  initialFirmaId,
  initialGroups,
  initialLocations,
  projeId,
  readonly = false,
}: {
  base: '/sa' | '/ta' | '/u'
  initialFirmaId?: string | null
  initialGroups: GroupRow[]
  initialLocations: LocationRow[]
  projeId?: string | null
  readonly?: boolean
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { firmaId: saFirmaId } = useFirma()
  const [taFirmaId] = useState<string | null>(initialFirmaId ?? null)
  const firmaId = base === '/sa' ? saFirmaId : taFirmaId
  const isFirstRender = useRef(true)
  const [groups, setGroups] = useState<GroupRow[]>(initialGroups)
  const [locations, setLocations] = useState<LocationRow[]>(initialLocations)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [topLocationId, setTopLocationId] = useState<string>('')
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [expandedGroups,   setExpandedGroups]   = useState<Set<string>>(new Set())
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const locMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations])

  const topLocations = useMemo(
    () => locations.filter((l) => !l.parent_id).sort((a, b) => (a.tanim || '').localeCompare(b.tanim || '', 'tr')),
    [locations]
  )

  const allowedLocationIds = useMemo(() => {
    if (!topLocationId) return []
    return collectDescendantIds(topLocationId, locations)
  }, [topLocationId, locations])

  const allowedLocationIdSet = useMemo(() => new Set(allowedLocationIds), [allowedLocationIds])
  const selectedTopPath = useMemo(() => (topLocationId ? makePath(topLocationId, locMap) : ''), [topLocationId, locMap])

  const locationOptions = useMemo(() => {
    const search = q.trim().toLowerCase()
    return locations
      .filter((l) => allowedLocationIdSet.has(l.id))
      .map((l) => ({ ...l, path: makePath(l.id, locMap) || l.tanim || '-' }))
      .filter((l) => !search || l.path.toLowerCase().includes(search))
      .sort((a, b) => a.path.localeCompare(b.path, 'tr'))
  }, [locations, allowedLocationIdSet, locMap, q])

  function showError(message: string) { toast({ type: 'error', title: 'İşlem başarısız', message }) }
  function showSuccess(message: string) { toast({ type: 'success', title: 'Başarılı', message }) }

  async function refresh(nextFirmaId = firmaId) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (nextFirmaId) params.set('firmaId', nextFirmaId)
      if (projeId) params.set('projeId', projeId)
      const query = params.toString() ? `?${params.toString()}` : ''
      const res = await fetch(`/api/location-groups${query}`, { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? 'Veriler alınamadı')
      setGroups(json.groups ?? [])
      setLocations(json.locations ?? [])
    } catch (e: any) { showError(e.message) }
    setLoading(false)
  }

  useEffect(() => { setGroups(initialGroups); setLocations(initialLocations) }, [initialGroups, initialLocations])

  useEffect(() => {
    if (base === '/sa') {
      if (isFirstRender.current) { isFirstRender.current = false; return }
      refresh(firmaId ?? null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId, projeId])

  useEffect(() => {
    setSelectedLocationIds((prev) => prev.filter((id) => allowedLocationIdSet.has(id)))
  }, [allowedLocationIdSet])

  function resetForm() { setEditingId(null); setName(''); setDescription(''); setTopLocationId(''); setSelectedLocationIds([]); setQ('') }

  async function onSubmit() {
    if (!firmaId) return showError('Önce firma seçin')
    if (!name.trim()) return showError('Grup adı zorunludur')
    if (!topLocationId) return showError('Önce en üst lokasyonu seçin')
    setSaving(true)
    try {
      const body = { firmaId, ad: name.trim(), aciklama: description.trim(), ustLokasyonId: topLocationId, lokasyonIds: selectedLocationIds, ...(projeId ? { projeId } : {}) }
      const res = await fetch(editingId ? `/api/location-groups/${editingId}` : '/api/location-groups', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || (!json?.ok && !json?.group)) throw new Error(json?.error ?? 'Kayıt yapılamadı')
      await refresh(firmaId)
      showSuccess(editingId ? 'Lokasyon grubu güncellendi' : 'Lokasyon grubu oluşturuldu')
      resetForm()
    } catch (e: any) { showError(e.message) }
    setSaving(false)
  }

  async function onDelete(id: string) {
    const ok = await confirm({ title: 'Grup silinsin mi?', message: 'Bu grup silinecek. Gruba bağlı lokasyon eşleşmeleri de kaldırılır.', confirmText: 'Sil', cancelText: 'Vazgeç', variant: 'danger' })
    if (!ok) return
    setSaving(true)
    try {
      const res = await fetch(`/api/location-groups/${id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? 'Silme işlemi başarısız')
      await refresh(firmaId)
      if (editingId === id) resetForm()
      showSuccess('Lokasyon grubu silindi')
    } catch (e: any) { showError(e.message) }
    setSaving(false)
  }

  function startEdit(group: GroupRow) {
    setEditingId(group.id); setName(group.ad); setDescription(group.aciklama ?? ''); setTopLocationId(group.ust_lokasyon_id ?? ''); setSelectedLocationIds(group.lokasyonIds ?? []); setQ('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Tüm gruplar düz liste (üst lokasyon path dahil)
  const groupsFlat = useMemo(() => {
    return groups.map((group) => ({
      ...group,
      topPath: group.ust_lokasyon_id ? makePath(group.ust_lokasyon_id, locMap) : '—',
      topTanim: group.ust_lokasyon_id ? (locMap.get(group.ust_lokasyon_id)?.tanim ?? '—') : '—',
      memberPaths: (group.lokasyonIds ?? []).map((id) => makePath(id, locMap)).filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr')),
    }))
  }, [groups, locMap])

  // Üst lokasyon bazında grupla
  const grouped = useMemo(() => {
    const map = new Map<string, { topId: string; topTanim: string; topPath: string; items: typeof groupsFlat }>()
    for (const g of groupsFlat) {
      const key = g.ust_lokasyon_id ?? '__no_top__'
      if (!map.has(key)) {
        map.set(key, { topId: key, topTanim: g.topTanim, topPath: g.topPath, items: [] })
      }
      map.get(key)!.items.push(g)
    }
    // Her gruptaki itemları ada göre sırala
    for (const v of map.values()) {
      v.items.sort((a, b) => a.ad.localeCompare(b.ad, 'tr'))
    }
    // Üst lokasyonları path'e göre sırala
    return Array.from(map.values()).sort((a, b) => a.topPath.localeCompare(b.topPath, 'tr'))
  }, [groupsFlat])

  function toggleSection(id: string) {
    setExpandedSections(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleExpand(id: string) {
    setExpandedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* HEADER */}
      <div className="verde-card" style={{ padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#0f1a0f' }}>LOKASYON GRUPLARI</div>
          <div style={{ fontSize: 13, color: '#7a907a', marginTop: 2 }}>
            {loading ? 'Yükleniyor…' : `${groupsFlat.length} grup, ${grouped.length} üst lokasyon · Lokasyonları gruplandırarak toplu atama ve raporlama yapın`}
          </div>
        </div>
        <button
          onClick={() => refresh(firmaId)}
          disabled={loading || saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1px solid #d6e4d6', background: '#f8fbf8', cursor: 'pointer', fontSize: 13, color: '#506050', fontWeight: 600 }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Yenile
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: readonly ? '1fr' : 'minmax(320px, 380px) 1fr', gap: 20, alignItems: 'start' }}>

        {/* SOL: FORM — sadece readonly olmayanlarda */}
        {!readonly && (
        <div className="verde-card" style={{ padding: '18px 20px', position: 'sticky', top: 88 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: '#dcf0dc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {editingId ? <Pencil size={13} color="#1f6b1f" /> : <Plus size={13} color="#1f6b1f" />}
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f1a0f' }}>{editingId ? 'Grubu Düzenle' : 'Yeni Grup Oluştur'}</span>
            </div>
            {editingId && (
              <button onClick={resetForm} style={{ fontSize: 12, color: '#7a907a', border: 'none', background: 'none', cursor: 'pointer', padding: '4px 8px' }}>İptal</button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* En üst lokasyon */}
            <div>
              <label className="verde-label">En Üst Lokasyon</label>
              <select value={topLocationId} onChange={(e) => setTopLocationId(e.target.value)} className="verde-input">
                <option value="">En üst lokasyon seçin</option>
                {topLocations.map((loc) => <option key={loc.id} value={loc.id}>{loc.tanim}</option>)}
              </select>
              <div style={{ fontSize: 11.5, color: '#7a907a', marginTop: 4 }}>Grup üyeleri sadece seçilen üst lokasyonun altından seçilebilir.</div>
            </div>

            {/* Grup adı */}
            <div>
              <label className="verde-label">Grup Adı *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. WC'ler" className="verde-input" autoComplete="off" />
            </div>

            {/* Açıklama */}
            <div>
              <label className="verde-label">Açıklama</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Grup açıklaması" className="verde-input" style={{ resize: 'vertical', minHeight: 64 }} />
            </div>

            {/* Kapsam özeti */}
            <div style={{ padding: '10px 12px', borderRadius: 8, background: '#f0f9f0', border: '1px solid #d6e4d6', fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: '#1f6b1f', marginBottom: 2 }}>Seçili Kapsam</div>
              <div style={{ color: '#506050' }}>{selectedTopPath || 'En üst lokasyon seçilmedi'}</div>
              <div style={{ color: '#7a907a', marginTop: 2 }}>{selectedLocationIds.length} adet alt lokasyon bu gruba bağlı.</div>
            </div>

            {/* Lokasyon seçici */}
            <div>
              <label className="verde-label">Gruptaki Alt Lokasyonları Seç</label>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7a907a' }} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Yol içinde ara" className="verde-input" style={{ paddingLeft: 30 }} disabled={!topLocationId} autoComplete="off" />
              </div>
              <div style={{ border: '1px solid #e0ece0', borderRadius: 8, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
                {!topLocationId ? (
                  <div style={{ padding: '12px 14px', color: '#7a907a', fontSize: 13 }}>Önce en üst lokasyon seçin.</div>
                ) : locationOptions.length === 0 ? (
                  <div style={{ padding: '12px 14px', color: '#7a907a', fontSize: 13 }}>Bu kapsamda lokasyon bulunamadı.</div>
                ) : locationOptions.map((loc) => {
                  const checked = selectedLocationIds.includes(loc.id)
                  return (
                    <label key={loc.id} style={{ display: 'flex', gap: 10, padding: '9px 12px', borderBottom: '1px solid #f0f4f0', cursor: 'pointer', alignItems: 'flex-start', background: checked ? '#f0f9f0' : '#fff' }}>
                      <input type="checkbox" checked={checked} onChange={() => setSelectedLocationIds((prev) => checked ? prev.filter((x) => x !== loc.id) : [...prev, loc.id])} style={{ marginTop: 2, accentColor: '#2e8b2e' }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#0f1a0f', fontSize: 13 }}>{loc.tanim}</div>
                        <div style={{ color: '#7a907a', fontSize: 12, marginTop: 1, wordBreak: 'break-word' }}>{loc.path}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <button
              onClick={onSubmit}
              disabled={saving || loading || !firmaId}
              style={{ padding: '10px', borderRadius: 8, border: 'none', background: saving ? '#a0b4a0' : '#2e8b2e', color: '#fff', fontWeight: 700, fontSize: 14, cursor: saving || !firmaId ? 'not-allowed' : 'pointer' }}
            >
              {saving ? 'Kaydediliyor…' : editingId ? '✓ Grubu Güncelle' : '+ Grubu Kaydet'}
            </button>
          </div>
        </div>
        )}

        {/* SAĞ: GRUP LİSTESİ */}
        <div style={{ position: 'sticky', top: 88, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f1a0f' }}>Mevcut Gruplar</div>
            <div style={{ fontSize: 12.5, color: '#7a907a' }}>{groupsFlat.length} grup · {grouped.length} üst lokasyon</div>
          </div>
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, flex: 1, paddingRight: 4 }}>

          {grouped.length === 0 ? (
            <div className="verde-card" style={{ padding: 32, textAlign: 'center', color: '#7a907a' }}>
              <Layers size={32} style={{ margin: '0 auto 10px', color: '#b8e0b8' }} />
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Henüz grup yok</div>
              <div style={{ fontSize: 13 }}>Sol formu kullanarak ilk lokasyon grubunu oluşturun.</div>
            </div>
          ) : grouped.map((section) => (
            <div key={section.topId} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Üst Lokasyon başlığı - tıklanabilir */}
              {(() => {
                const sectionExpanded = expandedSections.has(section.topId)
                return (
                  <>
                    <div
                      onClick={() => toggleSection(section.topId)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: sectionExpanded ? '#f0f9f0' : '#f4f8f4', border: `1px solid ${sectionExpanded ? '#b8e0b8' : '#e2ece2'}`, transition: 'all .15s' }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: '#1a5c2a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Layers size={13} color="#fff" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#1a5c2a', letterSpacing: 0.2 }}>
                          {section.topTanim}
                        </div>
                        {section.topPath !== section.topTanim && (
                          <div style={{ fontSize: 11, color: '#7a907a' }}>{section.topPath}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11.5, color: '#7a907a', fontWeight: 600 }}>{section.items.length} grup</span>
                        {sectionExpanded
                          ? <ChevronDown size={15} color="#2e8b2e" />
                          : <ChevronRight size={15} color="#7a907a" />}
                      </div>
                    </div>

                    {/* Bu üst lokasyona ait gruplar - section açıksa göster */}
                    {sectionExpanded && section.items.map((group) => {
                const expanded = expandedGroups.has(group.id)
                const isEditing = editingId === group.id
                return (
                  <div key={group.id} className="verde-card"
                    style={{ overflow: 'hidden', marginLeft: 20, border: isEditing ? '1.5px solid #2e8b2e' : '1px solid #e8f0e8' }}>
                    {/* Grup başlığı */}
                    <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => toggleExpand(group.id)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 7, background: isEditing ? '#dcf0dc' : '#f4f8f4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Layers size={13} color={isEditing ? '#1f6b1f' : '#7a907a'} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: '#0f1a0f', display: 'flex', alignItems: 'center', gap: 7 }}>
                            {group.ad}
                            {isEditing && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#dcf0dc', color: '#1f6b1f' }}>Düzenleniyor</span>}
                          </div>
                          <div style={{ fontSize: 11.5, color: '#7a907a', marginTop: 1 }}>
                            <span style={{ fontWeight: 600, color: '#2e8b2e' }}>{group.memberPaths.length} lokasyon</span>
                            {group.aciklama && <span> · {group.aciklama}</span>}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {!readonly && (
                        <>
                        <button onClick={(e) => { e.stopPropagation(); startEdit(group) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6, border: '1px solid #d6e4d6', background: '#f8fbf8', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#506050' }}>
                          <Pencil size={10} /> Düzenle
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(group.id) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#dc2626' }}>
                          <Trash2 size={10} /> Sil
                        </button>
                        </>
                        )}
                        {expanded ? <ChevronDown size={15} color="#7a907a" /> : <ChevronRight size={15} color="#7a907a" />}
                      </div>
                    </div>

                    {/* Genişletilmiş lokasyon listesi */}
                    {expanded && (
                      <div style={{ borderTop: '1px solid #e8f0e8', padding: '10px 14px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6 }}>
                          {group.memberPaths.length === 0 ? (
                            <div style={{ fontSize: 13, color: '#7a907a' }}>Bu gruba henüz lokasyon eklenmemiş.</div>
                          ) : group.memberPaths.map((path) => (
                            <div key={`${group.id}-${path}`} style={{ padding: '6px 10px', borderRadius: 6, background: '#f8fbf8', border: '1px solid #e1ece1', fontSize: 12, color: '#375137', wordBreak: 'break-word' }}>
                              {path}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
                    })}
                  </>
                )
              })()}
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  )
}
