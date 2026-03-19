/**
 * lib/import-export/xlsx.ts
 * ExcelJS tabanlı Node.js implementasyonu — Python bağımlılığı yok
 */
import ExcelJS from 'exceljs'

const HEADER_BG   = '2E8B2E'
const HEADER_FG   = 'FFFFFFFF'
const WRAP_ALIGN: Partial<ExcelJS.Alignment> = { vertical: 'top', wrapText: true }

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function applyHeader(cell: ExcelJS.Cell, value: string) {
  cell.value = value
  cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
  cell.font  = { color: { argb: HEADER_FG }, bold: true }
  cell.alignment = WRAP_ALIGN
}

function autoWidth(header: string, rows: unknown[][], colIdx: number, given?: number | null): number {
  if (given) return given
  let w = header.length + 4
  for (const row of rows.slice(0, 200)) {
    const v = String(row[colIdx] ?? '')
    w = Math.min(Math.max(w, v.length + 2), 50)
  }
  return Math.max(w, 16)
}

function styleSheet(
  ws: ExcelJS.Worksheet,
  headers: { key: string; label: string; width?: number }[],
  rows: unknown[][],
) {
  // Header satırı
  const headerRow = ws.addRow(headers.map(h => h.label))
  headerRow.eachCell((cell, i) => applyHeader(cell, headers[i - 1]?.label ?? ''))

  // Data satırları
  for (const row of rows) {
    const r = ws.addRow(row)
    r.eachCell(cell => { cell.alignment = WRAP_ALIGN })
  }

  // Kolon genişlikleri + autoFilter
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1)
    col.width = autoWidth(h.label, rows, i, h.width ?? null)
  })
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } }
}

function writeChartSheet(
  ws: ExcelJS.Worksheet,
  sheet: {
    title?: string; subtitle?: string; name?: string
    meta?: { label: string; value: string }[]
    table?: { headers?: { key: string; label: string; width?: number }[]; rows?: unknown[] }
    excelChart?: { type?: string; categoryKey?: string; seriesKeys?: string[]; title?: string; heightRows?: number; widthCells?: number; anchor?: string }
  },
) {
  ws.properties.showGridLines = false

  // Başlık
  const titleRow = ws.addRow([sheet.title ?? sheet.name ?? ''])
  titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: 'FF163016' } }
  ws.mergeCells(`A1:H1`)

  if (sheet.subtitle) {
    const subRow = ws.addRow([sheet.subtitle])
    subRow.getCell(1).font = { size: 11, italic: true, color: { argb: 'FF5E725E' } }
    ws.mergeCells(`A2:H2`)
  }

  let rowPtr = 4

  // Meta tablo
  if (sheet.meta?.length) {
    const hRow = ws.getRow(rowPtr)
    hRow.getCell(1).value = 'Alan'; hRow.getCell(2).value = 'Değer'
    ;[hRow.getCell(1), hRow.getCell(2)].forEach(c => applyHeader(c, String(c.value)))
    rowPtr++
    for (const m of sheet.meta) {
      const r = ws.getRow(rowPtr++)
      r.getCell(1).value = m.label; r.getCell(1).font = { bold: true, color: { argb: 'FF284128' } }
      r.getCell(2).value = m.value; r.getCell(2).alignment = WRAP_ALIGN
    }
    rowPtr += 2
  }

  // Veri tablosu
  const tbl = sheet.table
  if (tbl?.headers?.length) {
    const keys    = tbl.headers.map(h => h.key)
    const labels  = tbl.headers.map(h => h.label)
    const widths  = tbl.headers.map(h => h.width)
    const dataRows: unknown[][] = ((tbl.rows ?? []) as Record<string, unknown>[]).map(item =>
      Array.isArray(item) ? item : keys.map(k => item[k] ?? '')
    )

    // Veri tablosunu sayfanın altına yaz (grafik için yer bırak)
    const tableStartRow = rowPtr + 20
    const hRow = ws.getRow(tableStartRow)
    labels.forEach((l, i) => applyHeader(hRow.getCell(i + 1), l))

    dataRows.forEach((row, ri) => {
      const r = ws.getRow(tableStartRow + 1 + ri)
      ;(row as unknown[]).forEach((v, ci) => { r.getCell(ci + 1).value = v as ExcelJS.CellValue })
    })

    labels.forEach((l, i) => {
      ws.getColumn(i + 1).width = autoWidth(l, dataRows, i, widths[i] ?? null)
    })

    // ExcelJS grafik (bar/line/pie)
    const ec = sheet.excelChart
    if (ec && dataRows.length > 0) {
      const catKeyIdx = keys.indexOf(ec.categoryKey ?? '')
      const seriesIdxs = (ec.seriesKeys ?? []).map(k => keys.indexOf(k)).filter(i => i >= 0)

      if (catKeyIdx >= 0 && seriesIdxs.length > 0) {
        let chart: ExcelJS.Chart
        if (ec.type === 'pie') {
          chart = ws.workbook.addChart('pie') as ExcelJS.Chart
        } else if (ec.type === 'line') {
          chart = ws.workbook.addChart('line') as ExcelJS.Chart
        } else {
          chart = ws.workbook.addChart('bar') as ExcelJS.Chart
        }

        chart.title = ec.title ?? ''

        for (const sIdx of seriesIdxs) {
          chart.addSeries({
            name: { sheet: ws.name, row: tableStartRow, col: sIdx + 1 },
            xValues: { sheet: ws.name, from: { row: tableStartRow + 1, col: catKeyIdx + 1 }, to: { row: tableStartRow + dataRows.length, col: catKeyIdx + 1 } },
            yValues: { sheet: ws.name, from: { row: tableStartRow + 1, col: sIdx + 1 }, to: { row: tableStartRow + dataRows.length, col: sIdx + 1 } },
          })
        }

        const anchor = ec.anchor ?? 'A4'
        const anchorCol = anchor.replace(/\d/g, '')
        const anchorRow = parseInt(anchor.replace(/\D/g, '')) || 4

        chart.plotArea = { valAxis: [], catAxis: [] }
        ws.addChart(chart, {
          tl: { row: anchorRow - 1, col: anchorCol.charCodeAt(0) - 65 },
          br: { row: anchorRow + (ec.heightRows ?? 14) - 1, col: anchorCol.charCodeAt(0) - 65 + (ec.widthCells ?? 16) },
        })
      }
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Excel dosyasını okur — ilk sheet'in header + row listesini döndürür */
export async function readXlsxFromBuffer(buffer: Buffer): Promise<{
  headers: string[]
  rows: Record<string, string | null>[]
}> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  const ws = wb.worksheets[0]
  if (!ws) return { headers: [], rows: [] }

  const allRows = ws.getSheetValues() as (ExcelJS.CellValue | undefined)[][]
  // getSheetValues() 1-indexed array döndürür, [0] undefined
  const rawRows = allRows.slice(1).filter(Boolean)
  if (!rawRows.length) return { headers: [], rows: [] }

  const headers = (rawRows[0] ?? []).slice(1).map(v => (v != null ? String(v).trim() : ''))

  const rows: Record<string, string | null>[] = []
  for (const raw of rawRows.slice(1)) {
    if (!raw) continue
    const item: Record<string, string | null> = {}
    let empty = true
    headers.forEach((h, i) => {
      if (!h) return
      const v = raw[i + 1]
      const val = v != null && v !== '' ? String(v) : null
      if (val) empty = false
      item[h] = val
    })
    if (!empty) rows.push(item)
  }

  return { headers, rows }
}

/** Payload'dan xlsx buffer üretir */
export async function buildXlsxBuffer(payload: {
  sheets: Array<{
    name?: string
    mode?: string
    headers?: { key: string; label: string; width?: number }[]
    rows?: unknown[]
    // chart_with_table alanları
    title?: string
    subtitle?: string
    meta?: { label: string; value: string }[]
    table?: { headers?: { key: string; label: string; width?: number }[]; rows?: unknown[] }
    excelChart?: Record<string, unknown>
  }>
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ProATA'
  wb.created = new Date()

  for (const sheet of payload.sheets ?? []) {
    const ws = wb.addWorksheet(sheet.name ?? 'Sheet')

    if (sheet.mode === 'chart_with_table') {
      writeChartSheet(ws, sheet as Parameters<typeof writeChartSheet>[1])
      continue
    }

    const headers = sheet.headers ?? []
    const keys    = headers.map(h => h.key)
    const dataRows: unknown[][] = ((sheet.rows ?? []) as Record<string, unknown>[]).map(item =>
      Array.isArray(item) ? item : keys.map(k => item[k] ?? '')
    )

    styleSheet(ws, headers, dataRows)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
