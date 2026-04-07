'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { REPORT_DEFINITIONS, type ReportKey } from '@/lib/reports/config'
import { useToast } from '@/components/ui/ToastProvider'
import { useFirma } from '@/components/layout/FirmaContext'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Database,
  Grip,
  LayoutGrid,
  LineChart,
  Move,
  PieChart,
  Plus,
  RefreshCcw,
  Save,
  Sheet,
  Sparkles,
  Table2,
  Trash2,
} from 'lucide-react'

type WidgetType = 'kpi' | 'table' | 'bar' | 'line' | 'pie' | 'text'
type StarterMode = 'blank' | 'general'

type WidgetLayout = {
  x: number
  y: number
  w: number
  h: number
}

type TableBinding = {
  reportKey: ReportKey
  columns: string[]
  dateFrom: string
  dateTo: string
}

type CanvasWidget = {
  id: string
  type: WidgetType
  title: string
  accent: string
  layout: WidgetLayout
  binding?: TableBinding
}

type InteractionState = {
  kind: 'move' | 'resize'
  id: string
  startX: number
  startY: number
  origin: WidgetLayout
} | null

type TablePreview = {
  title: string
  columns: Array<{ key: string; label: string }>
  rows: Record<string, string>[]
  rowCount: number
  truncated: boolean
}

const GRID_COLS = 24
const CELL_W = 54
const ROW_H = 30
const GAP = 12
const CANVAS_PADDING = 20
const MIN_H = 4
const PAGE_ROWS = 22
const PAGE_WIDTH = GRID_COLS * CELL_W + (GRID_COLS - 1) * GAP + CANVAS_PADDING * 2
const PAGE_HEIGHT = CANVAS_PADDING * 2 + PAGE_ROWS * ROW_H + (PAGE_ROWS - 1) * GAP
const MIN_WIDGET_WIDTH: Record<WidgetType, number> = {
  kpi: 4,
  text: 7,
  table: 7,
  bar: 6,
  line: 6,
  pie: 6,
}

const palette = [
  {
    type: 'kpi' as const,
    title: 'KPI Kartı',
    accent: 'linear-gradient(135deg, #4caf68 0%, #e67e22 100%)',
    icon: <Sparkles size={18} />,
    defaultLayout: { x: 0, y: 0, w: 5, h: 5 },
  },
  {
    type: 'table' as const,
    title: 'Veri Tablosu',
    accent: 'linear-gradient(135deg, #3f7de8 0%, #2f5fd4 100%)',
    icon: <Table2 size={18} />,
    defaultLayout: { x: 0, y: 0, w: 12, h: 9 },
  },
  {
    type: 'bar' as const,
    title: 'Sütun Grafik',
    accent: 'linear-gradient(135deg, #7f67ff 0%, #5c49db 100%)',
    icon: <BarChart3 size={18} />,
    defaultLayout: { x: 0, y: 0, w: 8, h: 8 },
  },
  {
    type: 'line' as const,
    title: 'Çizgi Grafik',
    accent: 'linear-gradient(135deg, #28a6a1 0%, #177c84 100%)',
    icon: <LineChart size={18} />,
    defaultLayout: { x: 0, y: 0, w: 8, h: 8 },
  },
  {
    type: 'pie' as const,
    title: 'Pasta Grafik',
    accent: 'linear-gradient(135deg, #f0ba54 0%, #d58d1d 100%)',
    icon: <PieChart size={18} />,
    defaultLayout: { x: 0, y: 0, w: 7, h: 8 },
  },
  {
    type: 'text' as const,
    title: 'Metin / Başlık',
    accent: 'linear-gradient(135deg, #85939a 0%, #5e6a72 100%)',
    icon: <Sheet size={18} />,
    defaultLayout: { x: 0, y: 0, w: 10, h: 4 },
  },
]

const defaultTableBinding = (): TableBinding => {
  const def = REPORT_DEFINITIONS[0]
  return {
    reportKey: def.key,
    columns: def.columns.slice(0, 5).map((item) => item.key),
    dateFrom: '',
    dateTo: '',
  }
}

const createBlankWidgets = (): CanvasWidget[] => [
  {
    id: 'welcome-text',
    type: 'text',
    title: 'Rapor Başlığı',
    accent: 'linear-gradient(135deg, #7f67ff 0%, #5c49db 100%)',
    layout: { x: 0, y: 0, w: 10, h: 4 },
  },
  {
    id: 'table-main',
    type: 'table',
    title: 'Detay Veri Tablosu',
    accent: 'linear-gradient(135deg, #3f7de8 0%, #2f5fd4 100%)',
    layout: { x: 0, y: 5, w: 14, h: 10 },
    binding: defaultTableBinding(),
  },
]

const createGeneralTemplate = (): CanvasWidget[] => [
  {
    id: 'kpi-total',
    type: 'kpi',
    title: 'Toplam Görev',
    accent: 'linear-gradient(135deg, #4caf68 0%, #e67e22 100%)',
    layout: { x: 0, y: 0, w: 4, h: 5 },
  },
  {
    id: 'kpi-success',
    type: 'kpi',
    title: 'Başarı Oranı',
    accent: 'linear-gradient(135deg, #28a6a1 0%, #177c84 100%)',
    layout: { x: 4, y: 0, w: 4, h: 5 },
  },
  {
    id: 'chart-status',
    type: 'pie',
    title: 'Görev Durumu',
    accent: 'linear-gradient(135deg, #f0ba54 0%, #d58d1d 100%)',
    layout: { x: 8, y: 0, w: 7, h: 8 },
  },
  {
    id: 'chart-location',
    type: 'bar',
    title: 'Lokasyon Performansı',
    accent: 'linear-gradient(135deg, #7f67ff 0%, #5c49db 100%)',
    layout: { x: 15, y: 0, w: 9, h: 8 },
  },
  {
    id: 'table-main',
    type: 'table',
    title: 'Detay Veri Tablosu',
    accent: 'linear-gradient(135deg, #3f7de8 0%, #2f5fd4 100%)',
    layout: { x: 0, y: 9, w: 15, h: 10 },
    binding: {
      reportKey: 'live_tasks',
      columns: ['tanim', 'lokasyon', 'atanan_kullanici', 'durum', 'olusturma_tarihi'],
      dateFrom: '',
      dateTo: '',
    },
  },
]

function widgetIcon(type: WidgetType) {
  switch (type) {
    case 'kpi':
      return <Sparkles size={18} />
    case 'table':
      return <Table2 size={18} />
    case 'bar':
      return <BarChart3 size={18} />
    case 'line':
      return <LineChart size={18} />
    case 'pie':
      return <PieChart size={18} />
    default:
      return <Sheet size={18} />
  }
}

function pxFromGrid(value: number, unit: number) {
  return value * unit + Math.max(0, value - 1) * GAP
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function gridSnap(deltaPx: number, unit: number) {
  return Math.round(deltaPx / (unit + GAP))
}

function nextDropLayout(type: WidgetType, widgets: CanvasWidget[]): WidgetLayout {
  const paletteItem = palette.find((item) => item.type === type)
  const fallback = paletteItem?.defaultLayout ?? { x: 0, y: 0, w: 8, h: 8 }
  const maxY = widgets.reduce((acc, item) => Math.max(acc, item.layout.y + item.layout.h), 0)
  return { ...fallback, y: maxY + 1, x: 0 }
}

function getReportDefinition(key: ReportKey) {
  return REPORT_DEFINITIONS.find((item) => item.key === key) ?? REPORT_DEFINITIONS[0]
}

function estimateTableHeight(rows: number) {
  const usableRows = Math.max(rows, 1)
  const headerPx = 42
  const rowPx = 34
  const bodyPx = headerPx + usableRows * rowPx + 30
  return Math.max(6, Math.ceil((bodyPx + GAP) / (ROW_H + GAP)))
}

function MiniTable({ preview, loading }: { preview?: TablePreview; loading?: boolean }) {
  if (loading) {
    return <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#667666', fontSize: 13 }}>Veri yükleniyor…</div>
  }

  if (!preview) {
    return <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#667666', fontSize: 13 }}>Kaynak seçildiğinde veri burada görünür.</div>
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
      <thead>
        <tr>
          {preview.columns.map((column) => (
            <th key={column.key} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb', color: '#536553', fontWeight: 900, whiteSpace: 'nowrap' }}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {preview.rows.map((row, index) => (
          <tr key={index}>
            {preview.columns.map((column) => (
              <td key={column.key} style={{ padding: '8px 10px', borderBottom: '1px solid #edf3ed', color: '#253525', verticalAlign: 'top' }}>
                {row[column.key] || '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WidgetPreview({ widget, preview, loading }: { widget: CanvasWidget; preview?: TablePreview; loading?: boolean }) {
  if (widget.type === 'kpi') {
    return (
      <div style={{ display: 'grid', alignContent: 'center', height: '100%', gap: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#142214' }}>1.248</div>
        <div style={{ color: '#6d7b6d', fontSize: 13 }}>Örnek KPI görünümü</div>
      </div>
    )
  }

  if (widget.type === 'table') {
    return <MiniTable preview={preview} loading={loading} />
  }

  if (widget.type === 'pie') {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div style={{ position: 'relative', width: 170, height: 170, borderRadius: '50%', background: 'conic-gradient(#5f89ff 0 32%, #ca5751 32% 68%, #9bbc56 68% 100%)' }}>
          <div style={{ position: 'absolute', inset: 44, borderRadius: '50%', background: '#fff' }} />
        </div>
      </div>
    )
  }

  if (widget.type === 'line') {
    return (
      <svg viewBox="0 0 300 170" width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`lineFill-${widget.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(92,73,219,0.24)" />
            <stop offset="100%" stopColor="rgba(92,73,219,0.02)" />
          </linearGradient>
        </defs>
        <path d="M22 130 C62 108, 88 102, 128 72 S202 42, 278 82 L278 158 L22 158 Z" fill={`url(#lineFill-${widget.id})`} />
        <path d="M22 130 C62 108, 88 102, 128 72 S202 42, 278 82" fill="none" stroke="#5c49db" strokeWidth="4" strokeLinecap="round" />
      </svg>
    )
  }

  if (widget.type === 'bar') {
    return (
      <div style={{ display: 'grid', alignItems: 'end', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, height: '100%' }}>
        {[54, 88, 124, 96, 142].map((value, index) => (
          <div key={index} style={{ display: 'grid', gap: 6, alignItems: 'end' }}>
            <div style={{ height: value, borderRadius: '12px 12px 8px 8px', background: index % 2 === 0 ? 'linear-gradient(180deg, #7f67ff 0%, #5c49db 100%)' : 'linear-gradient(180deg, #54d0cf 0%, #219792 100%)' }} />
            <div style={{ textAlign: 'center', fontSize: 11.5, fontWeight: 800, color: '#708070' }}>K{index + 1}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', alignContent: 'center', height: '100%' }}>
      <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.14, color: '#162616' }}>Rapor metni veya bölüm başlığı</div>
    </div>
  )
}

export default function CustomReportsBuilderClient({
  base,
  initialFirmaId,
  isSA,
}: {
  base: '/sa' | '/ta'
  initialFirmaId?: string | null
  isSA: boolean
}) {
  const { firmaId: saFirmaId } = useFirma()
  const firmaId = isSA ? saFirmaId : null
  const [mode, setMode] = useState<StarterMode>('blank')
  const [widgets, setWidgets] = useState<CanvasWidget[]>(createBlankWidgets())
  const [selectedWidgetId, setSelectedWidgetId] = useState<string>('welcome-text')
  const [interaction, setInteraction] = useState<InteractionState>(null)
  const [tablePreviews, setTablePreviews] = useState<Record<string, TablePreview | undefined>>({})
  const [tableLoading, setTableLoading] = useState<Record<string, boolean>>({})
  const [availableWidth, setAvailableWidth] = useState(0)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const previewRequestKeysRef = useRef<Record<string, string>>({})
  const previewAbortControllersRef = useRef<Record<string, AbortController>>({})
  const { toast } = useToast()

  const selected = useMemo(() => widgets.find((item) => item.id === selectedWidgetId) ?? widgets[0] ?? null, [widgets, selectedWidgetId])
  const maxRow = useMemo(() => widgets.reduce((acc, item) => Math.max(acc, item.layout.y + item.layout.h), 0), [widgets])
  const overflowToPage2 = maxRow > PAGE_ROWS
  const canvasHeight = overflowToPage2 ? PAGE_HEIGHT * 2 + 24 : PAGE_HEIGHT
  const canvasScale = availableWidth > 0 ? Math.min(1, availableWidth / PAGE_WIDTH) : 1

  useEffect(() => {
    const node = viewportRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setAvailableWidth(Math.max(0, width - 24))
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!interaction) return
    const handleMove = (event: MouseEvent) => {
      const deltaX = event.clientX - interaction.startX
      const deltaY = event.clientY - interaction.startY
      setWidgets((current) => current.map((widget) => {
        if (widget.id !== interaction.id) return widget
        if (interaction.kind === 'move') {
          const x = clamp(interaction.origin.x + gridSnap(deltaX / Math.max(canvasScale, 0.01), CELL_W), 0, GRID_COLS - widget.layout.w)
          const y = Math.max(0, interaction.origin.y + gridSnap(deltaY / Math.max(canvasScale, 0.01), ROW_H))
          return { ...widget, layout: { ...widget.layout, x, y } }
        }
        const minW = MIN_WIDGET_WIDTH[widget.type]
        const w = clamp(interaction.origin.w + gridSnap(deltaX / Math.max(canvasScale, 0.01), CELL_W), minW, GRID_COLS - interaction.origin.x)
        const h = Math.max(MIN_H, interaction.origin.h + gridSnap(deltaY / Math.max(canvasScale, 0.01), ROW_H))
        return { ...widget, layout: { ...widget.layout, w, h } }
      }))
    }

    const handleUp = () => setInteraction(null)
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [interaction, canvasScale])

  useEffect(() => {
    const activeTableIds = new Set<string>()
    const nextRequestKeys: Record<string, string> = {}

    widgets.forEach((widget) => {
      if (widget.type !== 'table' || !widget.binding) return
      const binding = widget.binding
      if (!binding.columns.length) return
      const def = getReportDefinition(binding.reportKey)
      if (def.supportsDateRange && binding.dateFrom && binding.dateTo && binding.dateFrom > binding.dateTo) return

      activeTableIds.add(widget.id)

      const params = new URLSearchParams()
      params.set('report', binding.reportKey)
      params.set('columns', binding.columns.join(','))
      params.set('limit', '200')
      if (firmaId) params.set('firmaId', firmaId)
      if (binding.dateFrom) params.set('dateFrom', binding.dateFrom)
      if (binding.dateTo) params.set('dateTo', binding.dateTo)

      const requestKey = params.toString()
      nextRequestKeys[widget.id] = requestKey
      if (previewRequestKeysRef.current[widget.id] === requestKey && tablePreviews[widget.id]) return

      previewAbortControllersRef.current[widget.id]?.abort()
      const controller = new AbortController()
      previewAbortControllersRef.current[widget.id] = controller
      previewRequestKeysRef.current[widget.id] = requestKey

      setTableLoading((current) => ({ ...current, [widget.id]: true }))
      fetch(`/api/reports/builder-preview?${requestKey}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok) {
            const payload = await res.json().catch(() => ({}))
            throw new Error(payload.error || 'Veri önizlemesi alınamadı.')
          }
          return res.json()
        })
        .then((payload) => {
          setTablePreviews((current) => ({
            ...current,
            [widget.id]: {
              title: payload.title,
              columns: payload.columns,
              rows: payload.rows,
              rowCount: payload.rowCount,
              truncated: payload.truncated,
            },
          }))
          setWidgets((current) => current.map((item) => {
            if (item.id !== widget.id || item.type !== 'table') return item
            const estimatedH = estimateTableHeight(payload.rows.length)
            if (item.layout.h >= estimatedH) return item
            return { ...item, layout: { ...item.layout, h: estimatedH } }
          }))
        })
        .catch((error: any) => {
          if (error?.name === 'AbortError') return
          previewRequestKeysRef.current[widget.id] = ''
          setTablePreviews((current) => ({ ...current, [widget.id]: undefined }))
          toast({ type: 'error', title: 'Tablo verisi yüklenemedi', message: error?.message ?? 'Önizleme alınamadı.' })
        })
        .finally(() => {
          setTableLoading((current) => ({ ...current, [widget.id]: false }))
          if (previewAbortControllersRef.current[widget.id] === controller) {
            delete previewAbortControllersRef.current[widget.id]
          }
        })
    })

    Object.keys(previewAbortControllersRef.current).forEach((widgetId) => {
      if (activeTableIds.has(widgetId)) return
      previewAbortControllersRef.current[widgetId]?.abort()
      delete previewAbortControllersRef.current[widgetId]
      delete previewRequestKeysRef.current[widgetId]
    })

    Object.keys(previewRequestKeysRef.current).forEach((widgetId) => {
      if (nextRequestKeys[widgetId]) return
      delete previewRequestKeysRef.current[widgetId]
    })
  }, [widgets, firmaId, tablePreviews, toast])

  const loadPreset = (nextMode: StarterMode) => {
    setMode(nextMode)
    const nextWidgets = nextMode === 'general' ? createGeneralTemplate() : createBlankWidgets()
    setWidgets(nextWidgets)
    setSelectedWidgetId(nextWidgets[0]?.id ?? '')
  }

  const addWidget = (type: WidgetType) => {
    const item = palette.find((entry) => entry.type === type)
    if (!item) return
    const next: CanvasWidget = {
      id: `${type}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      title: item.title,
      accent: item.accent,
      layout: nextDropLayout(type, widgets),
      ...(type === 'table' ? { binding: defaultTableBinding() } : {}),
    }
    setWidgets((current) => [...current, next])
    setSelectedWidgetId(next.id)
  }

  const removeWidget = (id: string) => {
    setWidgets((current) => {
      const next = current.filter((item) => item.id !== id)
      if (!next.length) {
        const fallback = createBlankWidgets()
        setSelectedWidgetId(fallback[0].id)
        return fallback
      }
      if (selectedWidgetId === id) setSelectedWidgetId(next[0].id)
      return next
    })
  }

  const updateSelectedTitle = (title: string) => {
    if (!selected) return
    setWidgets((current) => current.map((widget) => (widget.id === selected.id ? { ...widget, title } : widget)))
  }

  const updateSelectedTableBinding = (patch: Partial<TableBinding>) => {
    if (!selected || selected.type !== 'table' || !selected.binding) return
    setWidgets((current) => current.map((widget) => {
      if (widget.id !== selected.id || widget.type !== 'table' || !widget.binding) return widget
      const nextBinding = { ...widget.binding, ...patch }
      const def = getReportDefinition(nextBinding.reportKey)
      const validColumns = nextBinding.columns.filter((key) => def.columns.some((column) => column.key === key))
      return {
        ...widget,
        title: widget.title || def.title,
        binding: {
          ...nextBinding,
          columns: validColumns.length ? validColumns : def.columns.slice(0, 5).map((item) => item.key),
          dateFrom: def.supportsDateRange ? nextBinding.dateFrom : '',
          dateTo: def.supportsDateRange ? nextBinding.dateTo : '',
        },
      }
    }))
  }

  const startMove = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    event.preventDefault()
    const widget = widgets.find((item) => item.id === id)
    if (!widget) return
    setSelectedWidgetId(id)
    setInteraction({ kind: 'move', id, startX: event.clientX, startY: event.clientY, origin: widget.layout })
  }

  const startResize = (event: React.MouseEvent<HTMLSpanElement>, id: string) => {
    event.preventDefault()
    event.stopPropagation()
    const widget = widgets.find((item) => item.id === id)
    if (!widget) return
    setSelectedWidgetId(id)
    setInteraction({ kind: 'resize', id, startX: event.clientX, startY: event.clientY, origin: widget.layout })
  }

  const selectedTableDef = selected?.type === 'table' && selected.binding ? getReportDefinition(selected.binding.reportKey) : null

  return (
    <div>
      <Topbar
        title="Rapor Özelleştir"
        base={base}
        subtitle="Bileşenleri üstten ekle, sayfa üzerinde yerleştir, ayarlarını alttan yönet. Görünen alan 1. sayfa olarak çalışır."
        breadcrumbs={[
          { label: 'Yönetim' },
          { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` },
          { label: 'Rapor Özelleştir' },
        ]}
      />

      <div style={{ padding: 20, display: 'grid', gap: 16 }}>
        <section className="verde-card" style={{ padding: 16, borderRadius: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: '#789078', fontWeight: 900, letterSpacing: 0.4 }}>RAPOR BİLEŞENLERİ</div>
              <h2 style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: '#122012' }}>Blokları yatay şeritten ekle</h2>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => loadPreset('blank')} style={{ padding: '10px 14px', borderRadius: 14, border: mode === 'blank' ? '1px solid #5c49db' : '1px solid #d7e2d7', background: mode === 'blank' ? '#f4f1ff' : '#fff', color: mode === 'blank' ? '#5c49db' : '#374151', fontWeight: 800, cursor: 'pointer' }}>Boş Tuval</button>
              <button type="button" onClick={() => loadPreset('general')} style={{ padding: '10px 14px', borderRadius: 14, border: mode === 'general' ? '1px solid #e67e22' : '1px solid #d7e2d7', background: mode === 'general' ? '#eff8ef' : '#fff', color: mode === 'general' ? '#e67e22' : '#374151', fontWeight: 800, cursor: 'pointer' }}>Genel Şablon</button>
              <button type="button" onClick={() => loadPreset(mode)} style={{ padding: '10px 14px', borderRadius: 14, border: '1px solid #d7e2d7', background: '#fff', color: '#374151', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}><RefreshCcw size={15} />Sıfırla</button>
              <button type="button" style={{ padding: '10px 14px', borderRadius: 14, border: '1px solid #d7e2d7', background: '#fff', color: '#374151', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Save size={15} />Taslağı Kaydet</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 12 }}>
            {palette.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => addWidget(item.type)}
                style={{ borderRadius: 18, border: '1px solid #e5e7eb', background: '#fff', padding: 14, display: 'grid', gap: 10, textAlign: 'left', cursor: 'pointer', minHeight: 94 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ width: 42, height: 42, borderRadius: 14, background: item.accent, color: '#fff', display: 'grid', placeItems: 'center' }}>{item.icon}</div>
                  <Plus size={18} color="#728372" />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1a2a1a' }}>{item.title}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="verde-card" style={{ padding: 16, borderRadius: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#789078', fontWeight: 900, letterSpacing: 0.4 }}>DÜZENLEME SAYFASI</div>
              <h2 style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: '#112011' }}>Görünen alan 1. sayfa</h2>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ padding: '9px 12px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fbfdfb', color: '#425242', fontSize: 12.5, fontWeight: 800 }}>Tut-çek: başlıktan taşı</div>
              <div style={{ padding: '9px 12px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fbfdfb', color: '#425242', fontSize: 12.5, fontWeight: 800 }}>Sağ alttan boyutlandır</div>
            </div>
          </div>

          {overflowToPage2 ? (
            <div style={{ marginBottom: 12, borderRadius: 16, border: '1px solid #f0c36d', background: '#fff9ee', padding: '12px 14px', color: '#7b5715', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={18} />
              Yerleşim 1. sayfayı aştı. Aşağıdaki alan 2. sayfa olarak kullanılacak. Excel çıktısında sayfa kırılımı oluşur.
            </div>
          ) : null}

          <div ref={viewportRef} style={{ width: '100%', minHeight: 'calc(100vh - 360px)', overflow: 'auto', padding: 8, background: '#f6f9f6', borderRadius: 20 }}>
            <div style={{ width: PAGE_WIDTH * canvasScale, height: canvasHeight * canvasScale, position: 'relative', margin: '0 auto' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: PAGE_WIDTH, height: canvasHeight, transform: `scale(${canvasScale})`, transformOrigin: 'top left' }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 28, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 20px 40px rgba(15,26,15,0.08)' }} />
                <div style={{ position: 'absolute', left: 18, top: 14, fontSize: 11.5, fontWeight: 900, color: '#829182' }}>1. SAYFA</div>
                <div style={{ position: 'absolute', inset: CANVAS_PADDING, backgroundImage: `linear-gradient(rgba(127,103,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(127,103,255,0.08) 1px, transparent 1px)`, backgroundSize: `${CELL_W + GAP}px ${ROW_H + GAP}px`, borderRadius: 20 }} />

                {overflowToPage2 ? (
                  <>
                    <div style={{ position: 'absolute', left: 0, top: PAGE_HEIGHT + 24, width: PAGE_WIDTH, height: PAGE_HEIGHT, borderRadius: 28, background: '#fff', border: '1px dashed #e3d18c', boxShadow: '0 16px 34px rgba(15,26,15,0.06)' }} />
                    <div style={{ position: 'absolute', left: 18, top: PAGE_HEIGHT + 38, fontSize: 11.5, fontWeight: 900, color: '#9b7b27' }}>2. SAYFA</div>
                    <div style={{ position: 'absolute', left: CANVAS_PADDING, top: PAGE_HEIGHT + 24 + CANVAS_PADDING, width: PAGE_WIDTH - CANVAS_PADDING * 2, height: PAGE_HEIGHT - CANVAS_PADDING * 2, backgroundImage: `linear-gradient(rgba(240,195,109,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(240,195,109,0.12) 1px, transparent 1px)`, backgroundSize: `${CELL_W + GAP}px ${ROW_H + GAP}px`, borderRadius: 20 }} />
                  </>
                ) : null}

                {widgets.map((widget) => {
                  const left = CANVAS_PADDING + pxFromGrid(widget.layout.x, CELL_W)
                  const top = CANVAS_PADDING + pxFromGrid(widget.layout.y, ROW_H)
                  const width = pxFromGrid(widget.layout.w, CELL_W)
                  const height = pxFromGrid(widget.layout.h, ROW_H)
                  const preview = widget.type === 'table' ? tablePreviews[widget.id] : undefined
                  return (
                    <div
                      key={widget.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedWidgetId(widget.id)}
                      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedWidgetId(widget.id) }}
                      style={{
                        position: 'absolute',
                        left,
                        top,
                        width,
                        height,
                        borderRadius: 18,
                        border: selectedWidgetId === widget.id ? '2px solid #5c49db' : '1px solid #e5e7eb',
                        background: '#fff',
                        padding: 14,
                        boxShadow: selectedWidgetId === widget.id ? '0 18px 30px rgba(92,73,219,0.12)' : '0 10px 20px rgba(15,26,15,0.05)',
                        cursor: interaction?.id === widget.id && interaction.kind === 'move' ? 'grabbing' : 'pointer',
                        display: 'grid',
                        gridTemplateRows: 'auto 1fr',
                        gap: 10,
                        overflow: 'visible',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <button type="button" onMouseDown={(event) => startMove(event, widget.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'grab', border: 0, background: 'transparent', padding: 0, textAlign: 'left' }}>
                          <div style={{ width: 34, height: 34, borderRadius: 12, background: widget.accent, color: '#fff', display: 'grid', placeItems: 'center' }}>{widgetIcon(widget.type)}</div>
                          <div style={{ fontSize: 15, fontWeight: 900, color: '#142214' }}>{widget.title}</div>
                        </button>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {widget.type === 'table' ? <Database size={15} color="#4b5563" /> : <Grip size={15} color="#4b5563" />}
                          {widgets.length > 1 ? (
                            <button onClick={(e) => { e.stopPropagation(); removeWidget(widget.id) }} style={{ border: 0, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', color: '#6a7b6a' }}>
                              <Trash2 size={15} />
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <div style={{ minHeight: 0 }}>
                        <WidgetPreview widget={widget} preview={preview} loading={tableLoading[widget.id]} />
                      </div>
                      <span onMouseDown={(event) => startResize(event, widget.id)} style={{ position: 'absolute', right: 10, bottom: 10, width: 18, height: 18, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', display: 'grid', placeItems: 'center', color: '#6a7b6a', cursor: 'nwse-resize' }}>
                        <LayoutGrid size={10} />
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="verde-card" style={{ padding: 16, borderRadius: 24 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#789078', fontWeight: 900, letterSpacing: 0.4 }}>SEÇİLİ BLOK AYARLARI</div>
            <h2 style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: '#122012' }}>Ayarlar alt yatay şeritte</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: selected?.type === 'table' ? '1.1fr 1fr 1.4fr' : '1fr 1fr', gap: 14 }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 18, background: '#fff', padding: 14 }}>
              <div style={{ fontSize: 12, color: '#789078', fontWeight: 900 }}>SEÇİLİ BLOK</div>
              {selected ? (
                <>
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 14, background: selected.accent, color: '#fff', display: 'grid', placeItems: 'center' }}>{widgetIcon(selected.type)}</div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#152515' }}>{selected.title}</div>
                      <div style={{ fontSize: 12.5, color: '#6f806f', marginTop: 2 }}>Konum: {selected.layout.x},{selected.layout.y} · Boyut: {selected.layout.w}x{selected.layout.h}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <label className="verde-label">Blok Başlığı</label>
                    <input className="verde-input" value={selected.title} onChange={(e) => updateSelectedTitle(e.target.value)} />
                  </div>
                </>
              ) : null}
            </div>

            {selected?.type === 'table' && selected.binding && selectedTableDef ? (
              <>
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 18, background: '#fff', padding: 14 }}>
                  <div style={{ fontSize: 12, color: '#789078', fontWeight: 900, marginBottom: 10 }}>VERİ KAYNAĞI</div>
                  <label className="verde-label">Rapor Kaynağı</label>
                  <select className="verde-input" value={selected.binding.reportKey} onChange={(e) => updateSelectedTableBinding({ reportKey: e.target.value as ReportKey, columns: getReportDefinition(e.target.value as ReportKey).columns.slice(0, 5).map((item) => item.key), dateFrom: '', dateTo: '' })}>
                    {REPORT_DEFINITIONS.map((report) => (
                      <option key={report.key} value={report.key}>{report.title}</option>
                    ))}
                  </select>
                  {selectedTableDef.supportsDateRange ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                      <div>
                        <label className="verde-label">Başlangıç</label>
                        <input type="date" className="verde-input" value={selected.binding.dateFrom} onChange={(e) => updateSelectedTableBinding({ dateFrom: e.target.value })} />
                      </div>
                      <div>
                        <label className="verde-label">Bitiş</label>
                        <input type="date" className="verde-input" value={selected.binding.dateTo} onChange={(e) => updateSelectedTableBinding({ dateTo: e.target.value })} />
                      </div>
                    </div>
                  ) : null}
                </div>

                <div style={{ border: '1px solid #e5e7eb', borderRadius: 18, background: '#fff', padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: '#789078', fontWeight: 900 }}>SÜTUNLAR</div>
                    <div style={{ fontSize: 12, color: '#6d7d6d', fontWeight: 800 }}>{selected.binding.columns.length}/{selectedTableDef.columns.length}</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    {selectedTableDef.columns.map((column) => {
                      const checked = selected.binding?.columns.includes(column.key)
                      return (
                        <label key={column.key} style={{ display: 'flex', alignItems: 'center', gap: 8, border: checked ? '1px solid #e67e22' : '1px solid #e5e7eb', borderRadius: 12, background: checked ? '#eff8ef' : '#fff', padding: '8px 10px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={!!checked}
                            onChange={(e) => {
                              const current = selected.binding?.columns ?? []
                              const next = e.target.checked ? [...current, column.key] : current.filter((item) => item !== column.key)
                              updateSelectedTableBinding({ columns: next })
                            }}
                          />
                          <span style={{ fontSize: 13.5, color: '#2a3a2a', fontWeight: 700 }}>{column.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 18, background: '#fff', padding: 14 }}>
                <div style={{ fontSize: 12, color: '#789078', fontWeight: 900, marginBottom: 10 }}>BLOK DAVRANIŞI</div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {[
                    'Bloklar sayfa üstünde serbest yerleşir.',
                    'İçerik içinde scroll yok; veri uzarsa tablo boyu büyür.',
                    'Görünen sınırı aşarsan 2. sayfa uyarısı çıkar.',
                  ].map((text) => (
                    <div key={text} style={{ padding: '10px 12px', borderRadius: 12, background: '#f7faf7', color: '#516151', fontSize: 13.5 }}>{text}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="verde-card" style={{ padding: 20, borderRadius: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, color: '#789078', fontWeight: 900, letterSpacing: 0.4 }}>SONRAKİ ADIM</div>
              <h2 style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: '#122012' }}>Grafik bloklarını da aynı veri modeline bağlayalım</h2>
            </div>
            <a href={`${base}/dashboard/raporlar/grafiksel`} style={{ padding: '12px 16px', borderRadius: 16, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
              Grafiksel raporlara dön
              <ArrowRight size={16} />
            </a>
          </div>
        </section>
      </div>

      <style jsx>{`
        @media (max-width: 1300px) {
          div[style*='grid-template-columns: repeat(6, minmax(0, 1fr))'] {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
          div[style*='grid-template-columns: 1.1fr 1fr 1.4fr'] {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 860px) {
          div[style*='grid-template-columns: repeat(3, minmax(0, 1fr))'] {
            grid-template-columns: 1fr 1fr !important;
          }
          div[style*='grid-template-columns: 1fr 1fr'] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
