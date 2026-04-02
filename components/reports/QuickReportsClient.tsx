'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, BarChart3, ChevronLeft, ChevronRight, Download, FileCode2, FileSpreadsheet, Image as ImageIcon, LineChart as LineChartIcon, Loader2, PieChart as PieChartIcon, Table2, Wand2 } from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type QuickType = 'locations' | 'users' | 'live_tasks' | 'manual_tasks' | 'location_groups'

type QuickPayload = {
  type: QuickType
  summary: { title: string; value: string | number; hint?: string }[]
  options: {
    locations: { id: string; label: string; parentId?: string | null }[]
    parentLocations?: { id: string; label: string }[]
    users: { id: string; label: string }[]
    statuses: string[]
  }
  charts: {
    key: string
    title: string
    subtitle?: string
    chart: 'bar' | 'line' | 'pie' | 'grouped_bar'
    data: Record<string, string | number>[]
    xKey?: string
    dataKey?: string
    nameKey?: string
    emptyMessage?: string
  }[]
}

type ChartFilters = {
  dateFrom: string
  dateTo: string
  locationId: string
  userId: string
  status: string
  groupId: string
  parentLocationId: string
}

const TYPE_OPTIONS: { key: QuickType; title: string; desc: string; accent: string }[] = [
  { key: 'locations', title: 'Lokasyonlar raporu', desc: 'Ana/alt lokasyon hareketliliği ve başarı oranları', accent: '#2563eb' },
  { key: 'users', title: 'Kullanıcılar raporu', desc: 'Personel aktivitesi, başarı ve görev dağılımı', accent: '#7c3aed' },
  { key: 'live_tasks', title: 'Frekansiyel görevler raporu', desc: 'Canlı görevlerin durum ve tarih bazlı analizi', accent: '#16a34a' },
  { key: 'manual_tasks', title: 'Spesifik görevler raporu', desc: 'Manuel görevlerin durum ve başarısızlık görünümü', accent: '#ea580c' },
  { key: 'location_groups', title: 'Lokasyon grupları raporu', desc: 'Grup bazlı görev sayısı, başarı oranı ve trend analizi', accent: '#0891b2' },
]

const BAR_PALETTE = ['#2e8b57', '#357f60', '#3d7369', '#456772', '#4c5b7a', '#5a5c88', '#686096', '#7664a3', '#8568b1', '#946dbf']

function todayMinus(days: number) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function truncateLabel(value: unknown, max = 20) {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function sanitizeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'grafik'
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function exportChartAsSvg(container: HTMLElement, filename: string) {
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('Grafik SVG çıktısı bulunamadı.')

  const clone = svg.cloneNode(true) as SVGSVGElement
  const rect = container.getBoundingClientRect()
  const width = Math.max(Math.round(rect.width || svg.clientWidth || 800), 320)
  const height = Math.max(Math.round(rect.height || svg.clientHeight || 480), 240)

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const serialized = new XMLSerializer().serializeToString(clone)
  triggerDownload(new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' }), `${filename}.svg`)
}

async function chartPngBlob(container: HTMLElement) {
  const svg = container.querySelector('svg')
  if (!svg) throw new Error('Grafik PNG çıktısı bulunamadı.')

  const rect = container.getBoundingClientRect()
  const width = Math.max(Math.round(rect.width || svg.clientWidth || 800), 320)
  const height = Math.max(Math.round(rect.height || svg.clientHeight || 480), 240)

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', `0 0 ${width} ${height}`)
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const serialized = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Grafik görseli oluşturulamadı.'))
      img.src = url
    })

    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = width * scale
    canvas.height = height * scale
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas başlatılamadı.')
    ctx.scale(scale, scale)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)

    const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!pngBlob) throw new Error('PNG dosyası oluşturulamadı.')
    return pngBlob
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function exportChartAsPng(container: HTMLElement, filename: string) {
  const pngBlob = await chartPngBlob(container)
  triggerDownload(pngBlob, `${filename}.png`)
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Grafik verisi dönüştürülemedi.'))
    reader.onerror = () => reject(new Error('Grafik verisi dönüştürülemedi.'))
    reader.readAsDataURL(blob)
  })
}

function exportChartAsCsv(chart: QuickPayload['charts'][number], filename: string) {
  const rows = chart.data ?? []
  if (!rows.length) throw new Error('İndirilecek veri bulunamadı.')

  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach((key) => set.add(key))
    return set
  }, new Set<string>()))

  const escapeCell = (value: unknown) => {
    const cell = String(value ?? '')
    return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
  }

  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
  ].join('\n')

  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${filename}.csv`)
}



function downloadFromResponseBlob(blob: Blob, fallbackFilename: string, contentDisposition: string | null) {
  const match = contentDisposition?.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/)
  const encoded = match?.[1] || match?.[2]
  const filename = encoded ? decodeURIComponent(encoded) : fallbackFilename
  triggerDownload(blob, filename)
}

function formatHeaderLabel(key: string) {
  const map: Record<string, string> = {
    lokasyon: 'Lokasyon',
    altLokasyon: 'Alt Lokasyon',
    gorev: 'Görev',
    oran: 'Oran (%)',
    basari: 'Başarı (%)',
    tamamlanan: 'Tamamlanan',
    diger: 'Diğer',
    personel: 'Personel',
    aktivite: 'Aktivite',
    basarisizlik: 'Başarısızlık',
    tarih: 'Tarih',
    toplam: 'Toplam',
    durum: 'Durum',
  }
  return map[key] ?? key
}

function splitLabelLines(value: unknown, maxLineLength = 14, maxLines = 2) {
  const text = String(value ?? '').trim()
  if (!text) return ['']
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxLineLength) {
      current = candidate
      continue
    }

    if (current) {
      lines.push(current)
      current = word
    } else {
      lines.push(word.slice(0, maxLineLength - 1) + '…')
      current = ''
    }

    if (lines.length >= maxLines) break
  }

  if (lines.length < maxLines && current) lines.push(current)

  if (lines.length > maxLines) return lines.slice(0, maxLines)
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1]
    lines[maxLines - 1] = last.length >= maxLineLength ? `${last.slice(0, maxLineLength - 1)}…` : `${last.slice(0, Math.max(0, maxLineLength - 1))}…`
  }
  if (lines.length === 1 && lines[0].length > maxLineLength) {
    return [lines[0].slice(0, maxLineLength - 1) + '…']
  }
  return lines
}

function XAxisTick(props: any) {
  const { x, y, payload } = props
  const lines = splitLabelLines(payload?.value, 16, 2)
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={14}
        textAnchor="middle"
        fill="#5f715f"
        style={{ fontSize: 12, fontWeight: 600 }}
      >
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x={0} dy={index === 0 ? 0 : 14}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}


function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized
  const int = Number.parseInt(value, 16)
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`
}

function shiftHex(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex)
  return rgbToHex(r + amount, g + amount, b + amount)
}

function FloatingBarLabel(props: any) {
  const { x, y, width, value } = props
  const label = String(value ?? 0)
  const bubbleWidth = Math.max(26, label.length * 8 + 12)
  const bubbleHeight = 22
  const bx = Number(x) + Number(width) / 2 - bubbleWidth / 2
  const by = Number(y) - 30

  return (
    <g>
      <rect x={bx} y={by} width={bubbleWidth} height={bubbleHeight} rx={11} fill="#ffffff" stroke="#dfe9df" />
      <text x={Number(x) + Number(width) / 2} y={by + 15} textAnchor="middle" fill="#223322" style={{ fontSize: 12, fontWeight: 800 }}>
        {label}
      </text>
    </g>
  )
}

function chartColor(type: QuickType, index = 0) {
  const palette = ({
    locations: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'],
    users: ['#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd'],
    live_tasks: ['#16a34a', '#22c55e', '#4ade80', '#86efac'],
    manual_tasks: ['#ea580c', '#f97316', '#fb923c', '#fdba74'],
    location_groups: ['#0891b2', '#06b6d4', '#22d3ee', '#67e8f9'],
  } as Record<QuickType, string[]>)[type] ?? ['#2e8b2e', '#4caf50', '#81c784', '#c8e6c9']
  return palette[index % palette.length]
}


function toNumber(value: unknown) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function chartStats(chart: QuickPayload['charts'][number] | null) {
  if (!chart?.data?.length) {
    return { total: 0, max: 0, count: 0 }
  }
  const key = chart.dataKey ?? 'value'
  const values = chart.data.map((item) => toNumber(item[key]))
  return {
    total: values.reduce((sum, value) => sum + value, 0),
    max: Math.max(...values, 0),
    count: values.length,
  }
}

function getDefaultChartFilters(): ChartFilters {
  return {
    dateFrom: todayMinus(30),
    dateTo: todayMinus(0),
    locationId: '',
    userId: '',
    status: '',
    groupId: '',
    parentLocationId: '',
  }
}

function getChartFilterMeta(type: QuickType, key: string) {
  if (type === 'locations') {
    if (key === 'g1') return { date: false, location: false, user: false, status: false }
    if (key === 'g2') return { date: true, location: false, user: false, status: false }
    if (key === 'g3') return { date: true, location: true, user: false, status: false }
    if (key === 'g4') return { date: true, location: true, user: false, status: false }
    return { date: true, location: false, user: false, status: false }
  }
  if (type === 'users') {
    if (key === 'g4') return { date: true, location: false, user: true, status: true }
    return { date: true, location: false, user: false, status: false }
  }
  if (type === 'location_groups') {
    return { date: true, location: false, user: false, status: false, group: true, parentLocation: true }
  }
  if (key === 'g1') return { date: true, location: false, user: false, status: false }
  if (key === 'g2') return { date: true, location: false, user: false, status: true }
  if (key === 'g3') return { date: true, location: true, user: false, status: true }
  return { date: true, location: false, user: false, status: false }
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#fff', border: '1px solid #dfe9df', borderRadius: 12, padding: 12, boxShadow: '0 14px 28px rgba(15, 40, 15, 0.08)' }}>
      {label ? <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1f2d1f', marginBottom: 8 }}>{String(label)}</div> : null}
      <div style={{ display: 'grid', gap: 6 }}>
        {payload.map((entry: any, index: number) => (
          <div key={`${entry?.name}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#425242' }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: entry?.color || entry?.fill || '#2e8b57' }} />
            <span style={{ fontWeight: 700 }}>{entry?.name || 'Değer'}:</span>
            <span>{entry?.value ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}




function getDisplayChartType(chart: QuickPayload['charts'][number]) {
  if (chart.chart === 'pie') return 'pie' as const
  if (chart.chart === 'line') return 'area' as const
  if (chart.chart === 'grouped_bar') return 'grouped_bar' as const
  return 'bar' as const
}


function PointValueLabel(props: any) {
  const { x, y, value } = props
  if (value == null) return null
  return (
    <g>
      <rect x={Number(x) - 14} y={Number(y) - 26} width={28} height={18} rx={9} fill="#ffffff" stroke="#dfe9df" />
      <text x={x} y={Number(y) - 13} textAnchor="middle" fill="#223322" style={{ fontSize: 11, fontWeight: 800 }}>
        {String(value)}
      </text>
    </g>
  )
}

function ChartRenderer({ chart, type }: { chart: QuickPayload['charts'][number]; type: QuickType }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [startIndex, setStartIndex] = useState(0)

  useEffect(() => {
    setStartIndex(0)
  }, [chart.key, chart.data])

  const displayType = getDisplayChartType(chart)
  const pageSize = 5
  const canSlide = chart.data.length > pageSize && displayType !== 'pie'
  const maxStart = Math.max(0, chart.data.length - pageSize)
  const visibleData = canSlide ? chart.data.slice(startIndex, startIndex + pageSize) : chart.data

  const categoryKey: string = chart.chart === 'pie' ? (chart.nameKey ?? chart.xKey ?? 'name') : (chart.xKey ?? chart.nameKey ?? 'name')
  const valueKey: string = chart.dataKey ?? 'value'
  const accent = chartColor(type)
  const pointCount = Math.max(visibleData.length, 1)
  const minColumnWidth = displayType === 'grouped_bar' ? 124 : 104
  const fiveColumnWidth = displayType === 'grouped_bar' ? 620 : 540
  const chartMinWidth = displayType === 'pie'
    ? 0
    : canSlide
      ? Math.max(fiveColumnWidth, pointCount * minColumnWidth)
      : 0
  const numericSeriesKeys = displayType === 'grouped_bar'
    ? ['tamamlanan', 'diger']
    : [valueKey]
  const visibleMaxValue = Math.max(
    1,
    ...visibleData.flatMap((item) => numericSeriesKeys.map((key) => toNumber(item[key])))
  )
  const yAxisUpperBound = Math.max(1, visibleMaxValue)
  const baseChartHeight = displayType === 'pie' ? 0 : 540
  const chartMargins = { top: 44, right: 18, left: 6, bottom: 18 }

  const navButtonStyle = (disabled: boolean) => ({
    width: 38,
    height: 38,
    borderRadius: 10,
    border: '1px solid #dfe9df',
    background: disabled ? '#f3f6f3' : '#ffffff',
    color: disabled ? '#9aac9a' : '#1f3a1f',
    display: 'grid',
    placeItems: 'center',
    boxShadow: disabled ? 'none' : '0 8px 18px rgba(15,40,15,0.10)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  })

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 100, display: 'flex', flexDirection: 'column' }}>
      {!chart.data?.length ? (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#7a907a', fontSize: 13.5, textAlign: 'center', padding: 24 }}>
          {chart.emptyMessage ?? 'Veri bulunamadı.'}
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', width: '100%', height: '100%', flex: 1, minHeight: 0 }}>
            {canSlide ? (
              <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 8, zIndex: 4 }}>
                <button
                  type="button"
                  aria-label="Önceki sütunlar"
                  onClick={() => setStartIndex((prev) => Math.max(0, prev - 1))}
                  disabled={startIndex === 0}
                  style={navButtonStyle(startIndex === 0)}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Sonraki sütunlar"
                  onClick={() => setStartIndex((prev) => Math.min(maxStart, prev + 1))}
                  disabled={startIndex >= maxStart}
                  style={navButtonStyle(startIndex >= maxStart)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            ) : null}
            <div style={{ width: '100%', height: '100%', minHeight: 0, overflowX: displayType === 'pie' ? 'visible' : (canSlide ? 'auto' : 'hidden'), overflowY: 'hidden', paddingTop: canSlide ? 54 : 0 }}>
            {displayType === 'pie' ? (() => {
              const total = visibleData.reduce((sum, entry) => sum + toNumber(entry[valueKey]), 0)
              return (
                <div style={{ display: 'grid', gridTemplateRows: 'minmax(400px, 1fr) auto', gap: 16, alignItems: 'stretch', minHeight: 100, height: '100%', padding: '0 4px 6px' }}>
                  <div style={{ minHeight: 400, height: '100%', display: 'grid', placeItems: 'center' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                        <Tooltip content={<ChartTooltip />} />
                        <Pie
                          data={visibleData}
                          dataKey={valueKey}
                          nameKey={categoryKey}
                          cx="50%"
                          cy="50%"
                          innerRadius={82}
                          outerRadius={164}
                          paddingAngle={3}
                          onMouseEnter={(_, index) => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          labelLine={false}
                          label={false}
                        >
                          {visibleData.map((_, index) => (
                            <Cell
                              key={index}
                              fill={BAR_PALETTE[index % BAR_PALETTE.length]}
                              opacity={hoveredIndex === null || hoveredIndex === index ? 1 : 0.82}
                              stroke={hoveredIndex === index ? shiftHex(BAR_PALETTE[index % BAR_PALETTE.length], -18) : '#ffffff'}
                              strokeWidth={hoveredIndex === index ? 4 : 2}
                            />
                          ))}
                          <LabelList
                            dataKey={valueKey}
                            position="center"
                            content={() => (
                              <g>
                                <text x="50%" y="48%" textAnchor="middle" fill="#728672" style={{ fontSize: 12, fontWeight: 700 }}>
                                  Toplam
                                </text>
                                <text x="50%" y="56%" textAnchor="middle" fill="#162816" style={{ fontSize: 28, fontWeight: 900 }}>
                                  {total}
                                </text>
                              </g>
                            )}
                          />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, alignItems: 'stretch' }}>
                    {visibleData.map((item, index) => {
                      const rawName = item[categoryKey]
                      const rawValue = toNumber(item[valueKey])
                      const percent = total > 0 ? Math.round((rawValue / total) * 100) : 0
                      return (
                        <div
                          key={`${String(rawName)}-${index}`}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                          style={{ display: 'grid', gridTemplateColumns: '9px minmax(0, 1fr) auto', gap: 9, alignItems: 'center', padding: '10px 12px', borderRadius: 12, border: hoveredIndex === index ? `1px solid ${shiftHex(BAR_PALETTE[index % BAR_PALETTE.length], 26)}` : '1px solid #e7efe7', background: hoveredIndex === index ? '#fcfffc' : '#ffffff', boxShadow: hoveredIndex === index ? '0 10px 20px rgba(15,40,15,0.05)' : 'none', minHeight: 64 }}
                        >
                          <span style={{ width: 9, height: 9, borderRadius: 999, background: BAR_PALETTE[index % BAR_PALETTE.length], alignSelf: 'start', marginTop: 6 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 800, color: '#203020', lineHeight: 1.25, wordBreak: 'break-word' }}>
                              {truncateLabel(rawName, 28)}
                            </div>
                            <div style={{ marginTop: 6, height: 6, borderRadius: 999, background: '#edf4ed', overflow: 'hidden' }}>
                              <div style={{ width: `${percent}%`, height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${shiftHex(BAR_PALETTE[index % BAR_PALETTE.length], 18)}, ${shiftHex(BAR_PALETTE[index % BAR_PALETTE.length], -8)})` }} />
                            </div>
                            <div style={{ fontSize: 10.5, color: '#708470', marginTop: 4 }}>%{percent} pay</div>
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#203020', whiteSpace: 'nowrap' }}>{rawValue}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })() : (
              <div style={{ width: canSlide ? chartMinWidth : '100%', minWidth: canSlide ? chartMinWidth : 0, height: '100%', minHeight: baseChartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  {displayType === 'bar' ? (
                    <BarChart data={visibleData} margin={chartMargins} barCategoryGap={24}>
                      <defs>
                        <filter id={`barGlow-${type}-${chart.key}`} x="-20%" y="-20%" width="140%" height="160%">
                          <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="rgba(26, 58, 26, 0.12)" />
                        </filter>
                        {visibleData.map((_, index) => {
                          const base = BAR_PALETTE[index % BAR_PALETTE.length]
                          const normalTop = shiftHex(base, 18)
                          const normalBottom = shiftHex(base, -8)
                          const hoverTop = shiftHex(base, 34)
                          const hoverBottom = shiftHex(base, -18)
                          return (
                            <g key={`defs-${index}`}>
                              <linearGradient id={`barGradient-${type}-${chart.key}-${index}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={normalTop} />
                                <stop offset="100%" stopColor={normalBottom} />
                              </linearGradient>
                              <linearGradient id={`barGradientHover-${type}-${chart.key}-${index}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={hoverTop} />
                                <stop offset="100%" stopColor={hoverBottom} />
                              </linearGradient>
                            </g>
                          )
                        })}
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7efe7" vertical={false} />
                      <XAxis dataKey={categoryKey} interval={0} height={64} tickMargin={8} tickLine={false} axisLine={{ stroke: '#9fb19f' }} tick={<XAxisTick />} />
                      <YAxis allowDecimals={false} domain={[0, yAxisUpperBound]} tick={{ fontSize: 12, fill: '#5f715f' }} width={44} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(46, 139, 87, 0.05)' }} />
                      <Bar dataKey={valueKey} radius={[10, 10, 0, 0]} maxBarSize={56} minPointSize={12} onMouseEnter={(_, index) => setHoveredIndex(index)} onMouseLeave={() => setHoveredIndex(null)} filter={hoveredIndex !== null ? `url(#barGlow-${type}-${chart.key})` : undefined}>
                        {visibleData.map((_, index) => (
                          <Cell key={index} fill={`url(#${hoveredIndex === index ? `barGradientHover-${type}-${chart.key}-${index}` : `barGradient-${type}-${chart.key}-${index}`})`} stroke={hoveredIndex === index ? shiftHex(BAR_PALETTE[index % BAR_PALETTE.length], -22) : 'transparent'} strokeWidth={hoveredIndex === index ? 1.2 : 0} />
                        ))}
                        <LabelList dataKey={valueKey} content={<FloatingBarLabel />} />
                      </Bar>
                    </BarChart>
                  ) : displayType === 'grouped_bar' ? (
                    <BarChart data={visibleData} margin={chartMargins} barCategoryGap={18}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7efe7" vertical={false} />
                      <XAxis dataKey={categoryKey} interval={0} height={64} tickMargin={8} tickLine={false} axisLine={{ stroke: '#9fb19f' }} tick={<XAxisTick />} />
                      <YAxis allowDecimals={false} domain={[0, yAxisUpperBound]} tick={{ fontSize: 12, fill: '#5f715f' }} width={44} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(46, 139, 87, 0.05)' }} />
                      <Bar dataKey="tamamlanan" name="Tamamlanan" fill={chartColor(type, 0)} radius={[8, 8, 0, 0]} maxBarSize={36} minPointSize={10}>
                        <LabelList dataKey="tamamlanan" content={<FloatingBarLabel />} />
                      </Bar>
                      <Bar dataKey="diger" name="Diğer" fill={chartColor(type, 1)} radius={[8, 8, 0, 0]} maxBarSize={36} minPointSize={10}>
                        <LabelList dataKey="diger" content={<FloatingBarLabel />} />
                      </Bar>
                    </BarChart>
                  ) : (
                    <AreaChart data={visibleData} margin={chartMargins}>
                      <defs>
                        <linearGradient id={`areaGradient-${type}-${chart.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={shiftHex(accent, 36)} stopOpacity={0.45} />
                          <stop offset="100%" stopColor={shiftHex(accent, -12)} stopOpacity={0.04} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e7efe7" vertical={false} />
                      <XAxis dataKey={categoryKey} interval={0} height={64} tickMargin={8} tickLine={false} axisLine={{ stroke: '#9fb19f' }} tick={<XAxisTick />} />
                      <YAxis allowDecimals={false} domain={[0, yAxisUpperBound]} tick={{ fontSize: 12, fill: '#5f715f' }} width={44} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey={valueKey} stroke={shiftHex(accent, -24)} fill={`url(#areaGradient-${type}-${chart.key})`} strokeWidth={3} />
                      <Line type="monotone" dataKey={valueKey} stroke={shiftHex(accent, -30)} strokeWidth={2.5} dot={{ r: 4, fill: '#fff', stroke: shiftHex(accent, -30), strokeWidth: 2 }} activeDot={{ r: 6 }} label={<PointValueLabel />} />
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ExportButton({
  label,
  onClick,
  disabled,
  icon,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} indir`}
      aria-label={`${label} indir`}
      style={{
        width: 38,
        height: 38,
        borderRadius: 11,
        border: '1px solid #dfe9df',
        background: disabled ? '#f3f6f3' : '#ffffff',
        color: disabled ? '#9aac9a' : '#1f3a1f',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: disabled ? 'none' : '0 8px 18px rgba(15,40,15,0.08)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform 0.16s ease, box-shadow 0.16s ease',
      }}
    >
      {icon}
    </button>
  )
}

function QuickChartCard({
  type,
  chartKey,
  firmaId,
  options,
  projeId,
}: {
  type: QuickType
  chartKey: string
  firmaId: string | null
  options: QuickPayload['options']
  projeId?: string | null
}) {
  const filterMeta = useMemo(() => getChartFilterMeta(type, chartKey), [type, chartKey])
  const [filters, setFilters] = useState<ChartFilters>(getDefaultChartFilters)
  const [chart, setChart] = useState<QuickPayload['charts'][number] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const chartCaptureRef = useRef<HTMLDivElement | null>(null)
  const stats = useMemo(() => chartStats(chart), [chart])

  const downloadBaseName = useMemo(() => {
    const chartTitle = chart?.title?.trim() || chartKey
    const reportTitle = TYPE_OPTIONS.find((item) => item.key === type)?.title ?? type
    return sanitizeFileName(`${chartTitle}-${reportTitle}`)
  }, [chart?.title, chartKey, type])

  async function handleExport(format: 'png' | 'svg' | 'csv' | 'xlsx') {
    if (!chart) return
    try {
      setExporting(format)
      if (format === 'csv') {
        exportChartAsCsv(chart, downloadBaseName)
        return
      }
      if (format === 'xlsx') {
        const reportTitle = TYPE_OPTIONS.find((item) => item.key === type)?.title ?? type
        const meta = [] as { label: string; value: string }[]
        if (filterMeta.date) meta.push({ label: 'Tarih Aralığı', value: `${filters.dateFrom || '-'} / ${filters.dateTo || '-'}` })
        if (filterMeta.location) {
          const selected = options.locations.find((loc) => loc.id === filters.locationId)?.label
          meta.push({ label: type === 'locations' && (chartKey === 'g3' || chartKey === 'g4') ? 'Üst Lokasyon' : 'Lokasyon', value: selected || 'Tümü' })
        }
        if (filterMeta.user) {
          const selected = options.users.find((u) => u.id === filters.userId)?.label
          meta.push({ label: 'Personel', value: selected || 'Tümü' })
        }
        if (filterMeta.status) meta.push({ label: 'Durum', value: filters.status || 'Tümü' })

        const response = await fetch('/api/reports/quick/export', {
          method: 'POST',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type,
            chartKey,
            chartTitle: chart.title,
            reportTitle,
            subtitle: chart.subtitle || '',
            rows: chart.data || [],
            chartType: chart.chart,
            xKey: chart.xKey,
            dataKey: chart.dataKey,
            nameKey: chart.nameKey,
            meta,
          }),
        })
        if (!response.ok) {
          const json = await response.json().catch(() => null)
          throw new Error(json?.error ?? 'Excel dosyası hazırlanamadı.')
        }
        const blob = await response.blob()
        downloadFromResponseBlob(blob, `${downloadBaseName}.xlsx`, response.headers.get('content-disposition'))
        return
      }
      if (!chartCaptureRef.current) throw new Error('Grafik alanı bulunamadı.')
      if (format === 'svg') {
        await exportChartAsSvg(chartCaptureRef.current, downloadBaseName)
        return
      }
      await exportChartAsPng(chartCaptureRef.current, downloadBaseName)
    } catch (err: any) {
      setError(err?.message ?? 'Grafik indirilemedi.')
    } finally {
      setExporting(null)
    }
  }

  useEffect(() => {
    setFilters(getDefaultChartFilters())
  }, [type, chartKey, firmaId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        params.set('type', type)
        if (firmaId) params.set('firmaId', firmaId)
        if (projeId) params.set('projeId', projeId)
        if (filterMeta.date && filters.dateFrom) params.set('dateFrom', filters.dateFrom)
        if (filterMeta.date && filters.dateTo) params.set('dateTo', filters.dateTo)
        if (filterMeta.location && filters.locationId) params.set('locationId', filters.locationId)
        if (filterMeta.user && filters.userId) params.set('userId', filters.userId)
        if (filterMeta.status && filters.status) params.set('status', filters.status)
        if ((filterMeta as any).group && filters.groupId) params.set('groupId', filters.groupId)
        if ((filterMeta as any).parentLocation && filters.parentLocationId) params.set('parentLocationId', filters.parentLocationId)

        const res = await fetch(`/api/reports/quick?${params.toString()}`, { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? 'Grafik verisi alınamadı.')
        const matched = (json?.charts ?? []).find((item: QuickPayload['charts'][number]) => item.key === chartKey)
        if (!matched) throw new Error('Grafik bulunamadı.')
        if (!cancelled) setChart(matched)
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Grafik verisi alınamadı.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [type, chartKey, firmaId, projeId, filterMeta.date, filterMeta.location, filterMeta.status, filterMeta.user, filters])

  return (
    <div className="verde-card" style={{ padding: 18, minHeight: 560, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 0.95fr) minmax(0, 1.8fr)', gap: 18, alignItems: 'stretch', flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingRight: 4 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7a907a', marginBottom: 6 }}>{chartKey.toUpperCase()}</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f1a0f', marginBottom: 6 }}>{chart?.title ?? 'Grafik yükleniyor'}</h3>
            {chart?.subtitle ? <p style={{ fontSize: 13, color: '#7a907a', lineHeight: 1.5 }}>{chart.subtitle}</p> : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: 14, borderRadius: 14, border: '1px solid #e5efe5', background: '#fbfdfb' }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#5e725e' }}><span>Toplam değer</span><strong style={{ color: '#163016' }}>{stats.total}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#5e725e' }}><span>En yüksek sütun</span><strong style={{ color: '#163016' }}>{stats.max}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: '#5e725e' }}><span>Gösterilen başlık</span><strong style={{ color: '#163016' }}>{stats.count}</strong></div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, padding: 14, borderRadius: 14, border: '1px solid #e5efe5', background: '#fbfdfb' }}>
            {filterMeta.date ? (
              <>
                <div>
                  <label className="verde-label">Başlangıç</label>
                  <input type="date" className="verde-input" value={filters.dateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} />
                </div>
                <div>
                  <label className="verde-label">Bitiş</label>
                  <input type="date" className="verde-input" value={filters.dateTo} onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))} />
                </div>
              </>
            ) : null}

            {filterMeta.location ? (
              <div>
                <label className="verde-label">{type === 'locations' && (chartKey === 'g3' || chartKey === 'g4') ? 'Üst lokasyon' : 'Lokasyon'}</label>
                <select className="verde-input" value={filters.locationId} onChange={(e) => setFilters((prev) => ({ ...prev, locationId: e.target.value }))}>
                  <option value="">{type === 'locations' && (chartKey === 'g3' || chartKey === 'g4') ? 'Üst lokasyon seçin' : 'Tüm lokasyonlar'}</option>
                  {(type === 'locations' && (chartKey === 'g3' || chartKey === 'g4') ? options.locations.filter((loc) => !loc.parentId) : options.locations).map((loc) => <option key={loc.id} value={loc.id}>{loc.label}</option>)}
                </select>
              </div>
            ) : null}

            {filterMeta.user ? (
              <div>
                <label className="verde-label">Personel</label>
                <select className="verde-input" value={filters.userId} onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))}>
                  <option value="">Tüm personeller</option>
                  {options.users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </select>
              </div>
            ) : null}

            {(filterMeta as any).parentLocation && (options.parentLocations ?? []).length > 0 ? (
              <div>
                <label className="verde-label">Üst Lokasyon</label>
                <select
                  className="verde-input"
                  value={filters.parentLocationId}
                  onChange={(e) => setFilters((prev) => ({ ...prev, parentLocationId: e.target.value, groupId: '' }))}
                >
                  <option value="">Tüm üst lokasyonlar</option>
                  {(options.parentLocations ?? []).map((loc) => <option key={loc.id} value={loc.id}>{loc.label}</option>)}
                </select>
              </div>
            ) : null}

            {(filterMeta as any).group && options.locations.length > 0 ? (
              <div>
                <label className="verde-label">Lokasyon Grubu</label>
                <select className="verde-input" value={filters.groupId} onChange={(e) => setFilters((prev) => ({ ...prev, groupId: e.target.value }))}>
                  <option value="">Tüm gruplar</option>
                  {options.locations
                    .filter((g) => !filters.parentLocationId || g.parentId === filters.parentLocationId)
                    .map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
                </select>
              </div>
            ) : null}

            {filterMeta.status ? (
              <div>
                <label className="verde-label">Durum</label>
                <select className="verde-input" value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="">Tüm durumlar</option>
                  {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ) : null}
          </div>

          <div style={{ display: 'grid', gap: 8, padding: 14, borderRadius: 14, border: '1px dashed #cfe0cf', background: 'linear-gradient(180deg, #fcfefc 0%, #f7fbf7 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#284128' }}>
              <span style={{ width: 28, height: 28, borderRadius: 999, background: '#ffffff', border: '1px solid #dfe9df', display: 'grid', placeItems: 'center', boxShadow: '0 6px 14px rgba(15,40,15,0.06)' }}>
                <Download size={15} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>İndirme bağlantıları</div>
                <div style={{ fontSize: 12, color: '#6e846e', lineHeight: 1.35 }}>
                  {chart?.title ? `Dosya adı: ${chart.title}` : 'Grafik başlığıyla indir'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <ExportButton label="PNG" icon={<ImageIcon size={16} />} onClick={() => handleExport('png')} disabled={!chart || loading || exporting !== null} />
              <ExportButton label="SVG" icon={<FileCode2 size={16} />} onClick={() => handleExport('svg')} disabled={!chart || loading || exporting !== null} />
              <ExportButton label="CSV" icon={<Table2 size={16} />} onClick={() => handleExport('csv')} disabled={!chart || loading || exporting !== null} />
              <ExportButton label="XLSX" icon={<FileSpreadsheet size={16} />} onClick={() => handleExport('xlsx')} disabled={!chart || loading || exporting !== null} />
              {exporting ? <span style={{ fontSize: 11.5, color: '#7a907a', fontWeight: 700 }}>{exporting.toUpperCase()} hazırlanıyor...</span> : null}
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#2d3f2d', fontWeight: 700, fontSize: 13.5 }}>
              <Loader2 size={16} className="animate-spin" />
              Grafik hazırlanıyor...
            </div>
          ) : null}

          {error ? (
            <div style={{ padding: 14, borderRadius: 12, background: '#fff5f5', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13.5, fontWeight: 700 }}>
              {error}
            </div>
          ) : null}
        </div>

        <div ref={chartCaptureRef} style={{ minHeight: 600, height: '100%', borderRadius: 18, border: '1px solid #e8f0e8', background: 'linear-gradient(180deg, #ffffff 0%, #fcfefc 100%)', padding: 18, display: 'flex', alignSelf: 'stretch' }}>
          {chart && !error ? <ChartRenderer chart={chart} type={type} /> : null}
        </div>
      </div>
    </div>
  )
}

export default function QuickReportsClient({
  open,
  firmaId,
  base,
  projeId,
}: {
  open?: boolean
  firmaId: string | null
  base?: '/sa' | '/ta' | '/u'
  projeId?: string | null
}) {
  const sectionRef = useRef<HTMLDivElement | null>(null)
  const [type, setType] = useState<QuickType>('locations')
  const [loading, setLoading] = useState(false)
  const [payload, setPayload] = useState<QuickPayload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeType = useMemo(() => TYPE_OPTIONS.find((item) => item.key === type)!, [type])

  useEffect(() => {
    if (open && sectionRef.current) {
      sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        params.set('type', type)
        if (firmaId) params.set('firmaId', firmaId)
        params.set('dateFrom', todayMinus(30))
        params.set('dateTo', todayMinus(0))
        const res = await fetch(`/api/reports/quick?${params.toString()}`, { cache: 'no-store' })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? 'Hızlı rapor alınamadı.')
        if (!cancelled) setPayload(json)
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Hızlı rapor alınamadı.')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [open, type, firmaId])

  if (!open) return null

  return (
    <div ref={sectionRef} className="animate-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="verde-card" style={{ padding: 20, overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(46,139,46,0.05), rgba(37,99,235,0.06), rgba(124,58,237,0.06))' }} />
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              {base ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <Link href={`${base}/dashboard/raporlar`} style={{ textDecoration: 'none' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: '#fff', border: '1px solid #e5efe5', color: '#2d3f2d', fontWeight: 800, fontSize: 12.5 }}>
                      <ArrowLeft size={14} />
                      Raporlar sayfasına dön
                    </span>
                  </Link>
                </div>
              ) : null}
              <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f1a0f', marginBottom: 8 }}>Hızlı raporlar</h2>
              <p style={{ fontSize: 14, color: '#506050', maxWidth: 900, lineHeight: 1.6 }}>
                Görüntülemek istediğin rapor türünü seç. Her grafik kendi filtresiyle bağımsız çalışır.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ padding: '10px 12px', borderRadius: 14, background: '#fff', border: '1px solid #e5efe5', color: activeType.accent, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 30px rgba(15,40,15,0.04)' }}>
                <Wand2 size={16} />
                <span style={{ fontSize: 13, fontWeight: 800 }}>{activeType.title}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
            {TYPE_OPTIONS.map((item) => {
              const active = item.key === type
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setType(item.key)}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    borderRadius: 16,
                    border: active ? `1px solid ${item.accent}` : '1px solid #dfe9df',
                    background: active ? 'rgba(255,255,255,0.97)' : '#ffffffd9',
                    boxShadow: active ? '0 12px 28px rgba(15,40,15,0.07)' : 'none',
                    transform: active ? 'translateY(-1px)' : 'none',
                    cursor: 'pointer',
                    minHeight: 124,
                  }}
                >
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: `${item.accent}15`, color: item.accent, display: 'grid', placeItems: 'center', marginBottom: 10 }}>
                    {item.key === 'locations' ? <BarChart3 size={18} /> : item.key === 'users' ? <LineChartIcon size={18} /> : <PieChartIcon size={18} />}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f1a0f', marginBottom: 6 }}>{item.title}</div>
                  <div style={{ fontSize: 12.5, color: '#7a907a', lineHeight: 1.45 }}>{item.desc}</div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {error ? (
        <div className="verde-card" style={{ padding: 18, color: '#b91c1c', fontWeight: 700 }}>{error}</div>
      ) : null}

      {loading && !payload ? (
        <div className="verde-card" style={{ padding: 24, display: 'inline-flex', alignItems: 'center', gap: 10, color: '#2d3f2d', fontWeight: 700 }}>
          <Loader2 size={18} className="animate-spin" />
          Rapor içeriği hazırlanıyor...
        </div>
      ) : null}

      {payload?.charts?.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(560px, 1fr))',
            gap: 16,
            alignItems: 'stretch',
          }}
        >
          {payload.charts.map((chart) => (
            <QuickChartCard key={`${type}-${chart.key}`} type={type} chartKey={chart.key} firmaId={firmaId} options={payload.options} projeId={projeId} />
          ))}
        </div>
      ) : null}
    </div>
  )
}
