/**
 * Server-side chart image helper.
 *
 * Pure SVG generation -> sharp PNG buffer. Excel/PDF'e embed icin
 * tasarlandi. Chart.js veya canvas binding gerektirmez.
 *
 * 5 chart tipi destekler: barChart, horizontalBarChart, pieChart,
 * stackedBarChart, dualBarChart (atanan vs tamamlanan gibi).
 */

import 'server-only'

type Color = string

const PALETTE: Color[] = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

function esc(s: string): string {
  return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

async function svgToPng(svg: string, width: number, height: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default
  return await sharp(Buffer.from(svg), { density: 144 })
    .resize(width * 2, height * 2)
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/* ──────────────────────────────────────────────────────────────────
   BAR CHART (vertical) — tek seri
   ────────────────────────────────────────────────────────────────── */
export async function barChart(
  title: string,
  data: { label: string; value: number; color?: string }[],
  opts: { width?: number; height?: number; yLabel?: string } = {}
): Promise<Buffer> {
  const W = opts.width ?? 800
  const H = opts.height ?? 360
  const padL = 56, padR = 20, padT = 36, padB = 70
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const max = Math.max(1, ...data.map(d => d.value))
  // Y axis nice ticks
  const yTicks = 5
  const tickStep = Math.ceil(max / yTicks)
  const yMax = tickStep * yTicks
  const barW = Math.max(8, innerW / data.length * 0.7)
  const gap = innerW / Math.max(1, data.length)

  const bars = data.map((d, i) => {
    const x = padL + gap * i + (gap - barW) / 2
    const h = (d.value / yMax) * innerH
    const y = padT + innerH - h
    const color = d.color ?? PALETTE[i % PALETTE.length]
    const labelY = padT + innerH + 14
    const label = truncate(d.label, 12)
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color}" rx="3"/>
      <text x="${x + barW / 2}" y="${y - 4}" font-size="11" font-family="Inter,sans-serif" text-anchor="middle" fill="#111827" font-weight="600">${d.value}</text>
      <text x="${x + barW / 2}" y="${labelY}" font-size="10" font-family="Inter,sans-serif" text-anchor="middle" fill="#374151" transform="rotate(-30 ${x + barW / 2} ${labelY})">${esc(label)}</text>
    `
  }).join('')

  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = i * tickStep
    const y = padT + innerH - (v / yMax) * innerH
    return `
      <line x1="${padL}" y1="${y}" x2="${padL + innerW}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,3"/>
      <text x="${padL - 6}" y="${y + 3}" font-size="10" font-family="Inter,sans-serif" text-anchor="end" fill="#6b7280">${v}</text>
    `
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <text x="${W / 2}" y="22" font-size="14" font-family="Inter,sans-serif" font-weight="800" text-anchor="middle" fill="#111827">${esc(title)}</text>
    ${yLabels}
    ${bars}
    <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="#374151" stroke-width="1"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="#374151" stroke-width="1"/>
  </svg>`

  return svgToPng(svg, W, H)
}

/* ──────────────────────────────────────────────────────────────────
   DUAL BAR CHART — iki seri yan yana (atanan vs tamamlanan)
   ────────────────────────────────────────────────────────────────── */
export async function dualBarChart(
  title: string,
  data: { label: string; v1: number; v2: number }[],
  opts: { width?: number; height?: number; v1Label?: string; v2Label?: string; v1Color?: string; v2Color?: string } = {}
): Promise<Buffer> {
  const W = opts.width ?? 900
  const H = opts.height ?? 380
  const padL = 56, padR = 20, padT = 50, padB = 80
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const v1Color = opts.v1Color ?? '#94a3b8'
  const v2Color = opts.v2Color ?? '#10b981'
  const v1Label = opts.v1Label ?? 'Seri 1'
  const v2Label = opts.v2Label ?? 'Seri 2'
  const max = Math.max(1, ...data.flatMap(d => [d.v1, d.v2]))
  const yTicks = 5
  const tickStep = Math.ceil(max / yTicks)
  const yMax = tickStep * yTicks
  const groupW = innerW / Math.max(1, data.length)
  const barW = Math.max(6, groupW * 0.35)

  const bars = data.map((d, i) => {
    const gx = padL + groupW * i
    const cx = gx + groupW / 2
    const x1 = cx - barW - 2
    const x2 = cx + 2
    const h1 = (d.v1 / yMax) * innerH
    const h2 = (d.v2 / yMax) * innerH
    const y1 = padT + innerH - h1
    const y2 = padT + innerH - h2
    const labelY = padT + innerH + 14
    return `
      <rect x="${x1}" y="${y1}" width="${barW}" height="${h1}" fill="${v1Color}" rx="2"/>
      <rect x="${x2}" y="${y2}" width="${barW}" height="${h2}" fill="${v2Color}" rx="2"/>
      <text x="${x1 + barW / 2}" y="${y1 - 3}" font-size="9" font-family="Inter,sans-serif" text-anchor="middle" fill="#374151">${d.v1}</text>
      <text x="${x2 + barW / 2}" y="${y2 - 3}" font-size="9" font-family="Inter,sans-serif" text-anchor="middle" fill="#374151">${d.v2}</text>
      <text x="${cx}" y="${labelY}" font-size="10" font-family="Inter,sans-serif" text-anchor="middle" fill="#374151" transform="rotate(-30 ${cx} ${labelY})">${esc(truncate(d.label, 14))}</text>
    `
  }).join('')

  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = i * tickStep
    const y = padT + innerH - (v / yMax) * innerH
    return `
      <line x1="${padL}" y1="${y}" x2="${padL + innerW}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,3"/>
      <text x="${padL - 6}" y="${y + 3}" font-size="10" font-family="Inter,sans-serif" text-anchor="end" fill="#6b7280">${v}</text>
    `
  }).join('')

  const legend = `
    <g transform="translate(${W / 2 - 120}, 32)">
      <rect x="0" y="0" width="14" height="10" fill="${v1Color}" rx="2"/>
      <text x="20" y="9" font-size="11" font-family="Inter,sans-serif" fill="#111827">${esc(v1Label)}</text>
      <rect x="120" y="0" width="14" height="10" fill="${v2Color}" rx="2"/>
      <text x="140" y="9" font-size="11" font-family="Inter,sans-serif" fill="#111827">${esc(v2Label)}</text>
    </g>
  `

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <text x="${W / 2}" y="20" font-size="14" font-family="Inter,sans-serif" font-weight="800" text-anchor="middle" fill="#111827">${esc(title)}</text>
    ${legend}
    ${yLabels}
    ${bars}
    <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="#374151" stroke-width="1"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="#374151" stroke-width="1"/>
  </svg>`

  return svgToPng(svg, W, H)
}

/* ──────────────────────────────────────────────────────────────────
   STACKED BAR CHART — grup performansi (hedef / tamamlanan / sapma / kayip)
   ────────────────────────────────────────────────────────────────── */
export async function stackedBarChart(
  title: string,
  data: { label: string; segments: { value: number; color: string; name: string }[] }[],
  opts: { width?: number; height?: number; legend?: string[]; legendColors?: string[] } = {}
): Promise<Buffer> {
  const W = opts.width ?? 900
  const H = opts.height ?? 400
  const padL = 60, padR = 20, padT = 50, padB = 90
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const max = Math.max(1, ...data.map(d => d.segments.reduce((s, v) => s + v.value, 0)))
  const yTicks = 5
  const tickStep = Math.ceil(max / yTicks)
  const yMax = tickStep * yTicks
  const barW = Math.max(10, innerW / data.length * 0.65)
  const gap = innerW / Math.max(1, data.length)

  const bars = data.map((d, i) => {
    const x = padL + gap * i + (gap - barW) / 2
    let acc = 0
    const segs = d.segments.map(s => {
      const h = (s.value / yMax) * innerH
      const y = padT + innerH - h - acc
      acc += h
      return s.value > 0
        ? `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${s.color}"/>`
        : ''
    }).join('')
    const labelY = padT + innerH + 14
    return `${segs}
      <text x="${x + barW / 2}" y="${labelY}" font-size="10" font-family="Inter,sans-serif" text-anchor="middle" fill="#374151" transform="rotate(-30 ${x + barW / 2} ${labelY})">${esc(truncate(d.label, 14))}</text>
    `
  }).join('')

  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = i * tickStep
    const y = padT + innerH - (v / yMax) * innerH
    return `
      <line x1="${padL}" y1="${y}" x2="${padL + innerW}" y2="${y}" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="2,3"/>
      <text x="${padL - 6}" y="${y + 3}" font-size="10" font-family="Inter,sans-serif" text-anchor="end" fill="#6b7280">${v}</text>
    `
  }).join('')

  const legendLabels = opts.legend ?? []
  const legendCols = opts.legendColors ?? []
  const legend = legendLabels.length > 0
    ? `<g transform="translate(${W / 2 - legendLabels.length * 55}, 32)">
        ${legendLabels.map((lab, i) => `
          <rect x="${i * 110}" y="0" width="14" height="10" fill="${legendCols[i] ?? PALETTE[i]}" rx="2"/>
          <text x="${i * 110 + 20}" y="9" font-size="11" font-family="Inter,sans-serif" fill="#111827">${esc(lab)}</text>
        `).join('')}
      </g>`
    : ''

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <text x="${W / 2}" y="20" font-size="14" font-family="Inter,sans-serif" font-weight="800" text-anchor="middle" fill="#111827">${esc(title)}</text>
    ${legend}
    ${yLabels}
    ${bars}
    <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="#374151" stroke-width="1"/>
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="#374151" stroke-width="1"/>
  </svg>`

  return svgToPng(svg, W, H)
}

/* ──────────────────────────────────────────────────────────────────
   PIE CHART
   ────────────────────────────────────────────────────────────────── */
export async function pieChart(
  title: string,
  data: { label: string; value: number; color?: string }[],
  opts: { width?: number; height?: number } = {}
): Promise<Buffer> {
  const W = opts.width ?? 600
  const H = opts.height ?? 360
  const cx = 180, cy = H / 2 + 10, r = 110
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  let angle = -Math.PI / 2

  const slices = data.map((d, i) => {
    const a0 = angle
    const a1 = angle + (d.value / total) * Math.PI * 2
    angle = a1
    const x0 = cx + r * Math.cos(a0)
    const y0 = cy + r * Math.sin(a0)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy + r * Math.sin(a1)
    const large = (a1 - a0) > Math.PI ? 1 : 0
    const color = d.color ?? PALETTE[i % PALETTE.length]
    return `<path d="M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large},1 ${x1},${y1} Z" fill="${color}" stroke="#fff" stroke-width="2"/>`
  }).join('')

  const legendX = 340
  const legend = data.map((d, i) => {
    const y = 80 + i * 22
    const color = d.color ?? PALETTE[i % PALETTE.length]
    const pct = Math.round((d.value / total) * 100)
    return `
      <rect x="${legendX}" y="${y - 10}" width="14" height="14" fill="${color}" rx="2"/>
      <text x="${legendX + 22}" y="${y + 1}" font-size="11" font-family="Inter,sans-serif" fill="#111827">${esc(truncate(d.label, 28))}</text>
      <text x="${W - 20}" y="${y + 1}" font-size="11" font-family="Inter,sans-serif" text-anchor="end" fill="#6b7280" font-weight="600">${d.value} (%${pct})</text>
    `
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <text x="${W / 2}" y="22" font-size="14" font-family="Inter,sans-serif" font-weight="800" text-anchor="middle" fill="#111827">${esc(title)}</text>
    ${slices}
    ${legend}
  </svg>`

  return svgToPng(svg, W, H)
}
