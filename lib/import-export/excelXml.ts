export type ExcelColumn = {
  key: string
  label: string
}

function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export function buildExcelXml(sheetName: string, columns: ExcelColumn[], rows: Record<string, unknown>[]) {
  const header = columns
    .map((column) => `      <Cell><Data ss:Type="String">${escapeXml(column.label)}</Data></Cell>`)
    .join('\n')

  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => `      <Cell><Data ss:Type="String">${escapeXml(row[column.key] ?? '')}</Data></Cell>`)
        .join('\n')
      return `    <Row>\n${cells}\n    </Row>`
    })
    .join('\n')

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <Worksheet ss:Name="${escapeXml(sheetName)}">
    <Table>
    <Row>
${header}
    </Row>
${body}
    </Table>
  </Worksheet>
</Workbook>`
}

export function parseExcelXml(content: string) {
  const rows: string[][] = []
  const rowRegex = /<Row\b[^>]*>([\s\S]*?)<\/Row>/gi
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRegex.exec(content))) {
    const rowContent = rowMatch[1]
    const cells: string[] = []
    const cellRegex = /<Cell\b([^>]*)>([\s\S]*?)<\/Cell>|<Cell\b([^>]*)\/>/gi
    let cellMatch: RegExpExecArray | null

    while ((cellMatch = cellRegex.exec(rowContent))) {
      const attrs = cellMatch[1] || cellMatch[3] || ''
      const idxMatch = attrs.match(/ss:Index="(\d+)"/i)
      if (idxMatch) {
        const desiredIndex = Number(idxMatch[1]) - 1
        while (cells.length < desiredIndex) cells.push('')
      }

      const body = cellMatch[2] || ''
      const dataMatch = body.match(/<Data\b[^>]*>([\s\S]*?)<\/Data>/i)
      const raw = dataMatch?.[1] ?? ''
      const normalized = decodeXml(raw.replace(/<[^>]+>/g, '').replace(/\r/g, '').trim())
      cells.push(normalized)
    }

    rows.push(cells)
  }

  return rows.filter((row) => row.some((cell) => cell !== ''))
}

export function workbookHeadersToKeys(headers: string[]) {
  return headers.map((header) => header.trim().toLowerCase())
}
