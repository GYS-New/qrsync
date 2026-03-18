'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DASHBOARD_BLOK_LABEL, DEFAULT_DASHBOARD_BLOKLARI, type DashboardBlokTuru } from '@/lib/dashboard/blocks'

type LayoutSize = 'big' | 'small'

type BlockItem = {
  id?: string
  blok_turu: DashboardBlokTuru
  sira?: number | null
  aktif?: boolean | null
  ayarlar?: any
}

function defaultLayoutForType(t: DashboardBlokTuru): LayoutSize {
  const d = DEFAULT_DASHBOARD_BLOKLARI.find((b) => b.blok_turu === t)
  const lay = (d?.ayarlar as any)?.layout as LayoutSize | undefined
  if (lay) return lay
  return t === 'aktif_kullanicilar' || t === 'gunluk_performans' || t === 'personel_basari_analizi' || t === 'lokasyon_gorev_analizi' ? 'small' : 'big'
}

export default function DashboardSettingsClient({ meId, initialBloklar }: { meId: string; initialBloklar: any[] }) {
  const supabase = createClient()
  const router = useRouter()
  const allTypes = useMemo(() => Object.keys(DASHBOARD_BLOK_LABEL) as DashboardBlokTuru[], [])

  const seeded = useMemo(() => {
    const cleaned: BlockItem[] = (initialBloklar ?? [])
      .filter((b) => b.blok_turu !== 'canli_islemler') // KPI fixed
      .map((b) => ({
        id: b.id,
        blok_turu: b.blok_turu as DashboardBlokTuru,
        sira: b.sira,
        aktif: b.aktif,
        ayarlar: b.ayarlar ?? {},
      }))

    const big: BlockItem[] = []
    const small: BlockItem[] = []
    cleaned
      .filter((b) => b.aktif !== false)
      .sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0))
      .forEach((b) => {
        const layout = ((b.ayarlar ?? {}).layout as LayoutSize) ?? defaultLayoutForType(b.blok_turu)
        ;(layout === 'small' ? small : big).push({ ...b, ayarlar: { ...(b.ayarlar ?? {}), layout } })
      })
    return { big, small }
  }, [initialBloklar])

  const [big, setBig] = useState<BlockItem[]>(seeded.big)
  const [small, setSmall] = useState<BlockItem[]>(seeded.small)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const present = useMemo(() => new Set([...big, ...small].map((b) => b.blok_turu)), [big, small])
  const addable = useMemo(
    () => allTypes.filter((t) => t !== 'canli_islemler' && !present.has(t)),
    [allTypes, present]
  )

  function setColumn(col: LayoutSize, next: BlockItem[]) {
    if (col === 'big') setBig(next)
    else setSmall(next)
  }

  function onDragStart(e: React.DragEvent, col: LayoutSize, index: number) {
    e.dataTransfer.setData('text/plain', JSON.stringify({ col, index }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function moveItem(fromCol: LayoutSize, fromIdx: number, toCol: LayoutSize, toIdx: number) {
    // Avoid duplication when moving within the same column
    if (fromCol === toCol) {
      const arr = fromCol === 'big' ? [...big] : [...small]
      const [item] = arr.splice(fromIdx, 1)
      const fixed: BlockItem = { ...item, ayarlar: { ...(item.ayarlar ?? {}), layout: toCol } }
      const safeIdx = Math.max(0, Math.min(toIdx, arr.length))
      arr.splice(safeIdx, 0, fixed)
      setColumn(toCol, arr)
      return
    }

    const fromArr = fromCol === 'big' ? [...big] : [...small]
    const toArr = toCol === 'big' ? [...big] : [...small]
    const [item] = fromArr.splice(fromIdx, 1)
    const fixed: BlockItem = { ...item, ayarlar: { ...(item.ayarlar ?? {}), layout: toCol } }
    const safeIdx = Math.max(0, Math.min(toIdx, toArr.length))
    toArr.splice(safeIdx, 0, fixed)
    setColumn(fromCol, fromArr)
    setColumn(toCol, toArr)
  }


  function onDropOnColumn(e: React.DragEvent, toCol: LayoutSize) {
    e.preventDefault()
    const raw = e.dataTransfer.getData('text/plain')
    if (!raw) return
    const { col: fromCol, index: fromIdx } = JSON.parse(raw)
    const toArr = toCol === 'big' ? big : small
    moveItem(fromCol, fromIdx, toCol, toArr.length)
  }

  function onDropOnItem(e: React.DragEvent, toCol: LayoutSize, toIdx: number) {
    e.preventDefault()
    const raw = e.dataTransfer.getData('text/plain')
    if (!raw) return
    const { col: fromCol, index: fromIdx } = JSON.parse(raw)
    moveItem(fromCol, fromIdx, toCol, toIdx)
  }

  function removeItem(col: LayoutSize, idx: number) {
    const arr = col === 'big' ? [...big] : [...small]
    arr.splice(idx, 1)
    setColumn(col, arr)
  }

  function addBlock(t: DashboardBlokTuru) {
    const layout = defaultLayoutForType(t)
    const defaults = DEFAULT_DASHBOARD_BLOKLARI.find((b) => b.blok_turu === t)
    const item: BlockItem = {
      blok_turu: t,
      aktif: true,
      ayarlar: { ...(defaults?.ayarlar ?? {}), layout },
    }
    if (layout === 'small') setSmall((s) => [...s, item])
    else setBig((b) => [...b, item])
  }

  async function save() {
    setSaving(true)
    setMsg('')

    const ordered: Array<{ blok_turu: DashboardBlokTuru; sira: number; ayarlar: any }> = []
    let sira = 1
    for (const b of big) ordered.push({ blok_turu: b.blok_turu, sira: sira++, ayarlar: { ...(b.ayarlar ?? {}), layout: 'big' } })
    for (const b of small) ordered.push({ blok_turu: b.blok_turu, sira: sira++, ayarlar: { ...(b.ayarlar ?? {}), layout: 'small' } })

    const removed = allTypes
      .filter((t) => t !== 'canli_islemler')
      .filter((t) => !ordered.some((o) => o.blok_turu === t))

    // Upsert visible blocks
    if (ordered.length) {
      const { error: upErr } = await supabase
        .from('dashboard_bloklar')
        .upsert(
          ordered.map((o) => ({
            user_id: meId,
            blok_turu: o.blok_turu,
            aktif: true,
            sira: o.sira,
            ayarlar: o.ayarlar,
          })),
          { onConflict: 'user_id,blok_turu' }
        )
      if (upErr) {
        setSaving(false)
        setMsg(`Kaydetme hatası: ${upErr.message}`)
        return
      }
    }

    // Mark removed blocks as inactive (do not DELETE to avoid RLS issues)
    if (removed.length) {
      const { error: remErr } = await supabase
        .from('dashboard_bloklar')
        .upsert(
          removed.map((t, i) => ({
            user_id: meId,
            blok_turu: t,
            aktif: false,
            sira: 10_000 + i,
            ayarlar: { layout: defaultLayoutForType(t) },
          })),
          { onConflict: 'user_id,blok_turu' }
        )
      if (remErr) {
        setSaving(false)
        setMsg(`Kaydetme hatası: ${remErr.message}`)
        return
      }
    }

    setSaving(false)
    setMsg('Dashboard düzeni kaydedildi.')
    router.refresh()
    setTimeout(() => setMsg(''), 2000)
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="verde-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f1a0f' }}>Dashboard Yapılandırması</div>
            <div style={{ fontSize: 12, color: '#7a907a' }}>Blokları tut-çek-bırak ile düzenleyin. KPI satırı sabittir.</div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="verde-input"
              style={{ height: 34, paddingTop: 0, paddingBottom: 0 }}
              defaultValue=""
              onChange={(e) => {
                const t = e.target.value as DashboardBlokTuru
                if (!t) return
                e.currentTarget.value = ''
                addBlock(t)
              }}
            >
              <option value="">+ Blok ekle</option>
              {addable.map((t) => (
                <option key={t} value={t}>
                  {DASHBOARD_BLOK_LABEL[t]}
                </option>
              ))}
            </select>

            <button className="verde-btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>

        {msg && <div style={{ marginTop: 10, fontSize: 12, color: '#1f6b1f' }}>{msg}</div>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Column
          title="Büyük Bloklar"
          hint="Ortadaki ana alan"
          col="big"
          items={big}
          onDragStart={onDragStart}
          onDropOnColumn={onDropOnColumn}
          onDropOnItem={onDropOnItem}
          onRemove={removeItem}
        />
        <Column
          title="Küçük Bloklar"
          hint="Sağ kenar"
          col="small"
          items={small}
          onDragStart={onDragStart}
          onDropOnColumn={onDropOnColumn}
          onDropOnItem={onDropOnItem}
          onRemove={removeItem}
        />
      </div>
    </div>
  )
}

function Column({
  title,
  hint,
  col,
  items,
  onDragStart,
  onDropOnColumn,
  onDropOnItem,
  onRemove,
}: {
  title: string
  hint: string
  col: LayoutSize
  items: BlockItem[]
  onDragStart: (e: React.DragEvent, col: LayoutSize, index: number) => void
  onDropOnColumn: (e: React.DragEvent, col: LayoutSize) => void
  onDropOnItem: (e: React.DragEvent, col: LayoutSize, index: number) => void
  onRemove: (col: LayoutSize, idx: number) => void
}) {
  return (
    <div
      className="verde-card"
      style={{ padding: 14, minHeight: 260 }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDropOnColumn(e, col)}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '6px 6px 10px' }}>
        <div>
          <div style={{ fontWeight: 800, color: '#0f1a0f' }}>{title}</div>
          <div style={{ fontSize: 12, color: '#7a907a', marginTop: 2 }}>{hint}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((b, idx) => (
          <div
            key={`${b.blok_turu}-${idx}`}
            draggable
            onDragStart={(e) => onDragStart(e, col, idx)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => onDropOnItem(e, col, idx)}
            style={{
              border: '1px solid #e8f0e8',
              borderRadius: 12,
              padding: 12,
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 12,
              alignItems: 'center',
              background: '#fff',
              cursor: 'grab',
            }}
            title="Tut-çek-bırak"
          >
            <div style={{ fontWeight: 700, color: '#0f1a0f', fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {DASHBOARD_BLOK_LABEL[b.blok_turu] ?? b.blok_turu}
            </div>
            <button className="verde-btn-ghost" type="button" onClick={() => onRemove(col, idx)}>
              Kaldır
            </button>
          </div>
        ))}

        {!items.length && (
          <div style={{ padding: '22px 10px', color: '#7a907a', textAlign: 'center' }}>
            Buraya blok bırakın
          </div>
        )}
      </div>
    </div>
  )
}
