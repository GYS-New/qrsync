/**
 * XLSX Şablon Doldurma — JSZip ile doğrudan XML manipülasyonu.
 * ExcelJS'in grafikleri silme sorununu çözer.
 * Şablondaki tüm dosyalar (chart, drawing, style, vb.) birebir korunur.
 */
import JSZip from 'jszip'

interface SheetMapping {
  name: string
  file: string
}

async function getSheetMappings(zip: JSZip): Promise<SheetMapping[]> {
  const wbXml = await zip.file('xl/workbook.xml')!.async('string')
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')

  const sheets: { name: string; rId: string }[] = []
  const sheetRegex = /<sheet\s+name="([^"]+)"[^>]*r:id="([^"]+)"/g
  let m
  while ((m = sheetRegex.exec(wbXml)) !== null) sheets.push({ name: m[1], rId: m[2] })

  const relMap = new Map<string, string>()
  const relRegex = /Id="([^"]+)"[^>]*Target="([^"]+)"/g
  while ((m = relRegex.exec(relsXml)) !== null) relMap.set(m[1], m[2])

  return sheets.map(s => ({ name: s.name, file: 'xl/' + (relMap.get(s.rId) ?? '') }))
}

function colLetter(col: number): string {
  let s = ''
  while (col > 0) { const r = (col - 1) % 26; s = String.fromCharCode(65 + r) + s; col = Math.floor((col - 1) / 26) }
  return s
}

function cellRef(col: number, row: number): string { return colLetter(col) + row }

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export type CellValue = string | number | null
export type CellData = { col: number; row: number; value: CellValue }

export interface SheetData {
  sheetName: string
  cells: CellData[]
  templateDataRow?: number
  totalDataRows?: number
}

/**
 * Ana fonksiyon: xlsx şablonunu açar, hücreleri doldurur, buffer döndürür.
 * Grafikler, çizimler, stiller ve diğer tüm dosyalar korunur.
 */
export async function fillXlsxTemplate(
  templateBuffer: Buffer,
  sheetsData: SheetData[],
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer)
  const mappings = await getSheetMappings(zip)

  // ── SharedStrings ──────────────────────────────────────────────────────
  // Orijinal XML'i koruyarak sadece yeni string'leri ekle
  const ssFile = zip.file('xl/sharedStrings.xml')
  let originalSsXml = ''
  let originalSsCount = 0
  const newStrings: string[] = []

  if (ssFile) {
    originalSsXml = await ssFile.async('string')
    originalSsCount = (originalSsXml.match(/<si>/g) || []).length
  }

  function getOrAddSharedString(value: string): number {
    // Yeni string ekle (orijinallerin sonuna)
    const idx = originalSsCount + newStrings.length
    newStrings.push(value)
    return idx
  }

  // ── Sheet'leri işle ────────────────────────────────────────────────────
  for (const sd of sheetsData) {
    const mapping = mappings.find(m => m.name === sd.sheetName)
    if (!mapping) continue
    const sheetFile = zip.file(mapping.file)
    if (!sheetFile) continue

    let xml = await sheetFile.async('string')

    // Hücreleri gruplama: row → col → value
    const rowMap = new Map<number, Map<number, CellValue>>()
    for (const c of sd.cells) {
      if (!rowMap.has(c.row)) rowMap.set(c.row, new Map())
      rowMap.get(c.row)!.set(c.col, c.value)
    }

    // Yeni satırlar ekle (şablondaki boş satırlardan fazla veri varsa)
    if (sd.totalDataRows && sd.templateDataRow) {
      const existingRows = (xml.match(/<row /g) || []).length
      const needed = sd.templateDataRow - 1 + sd.totalDataRows

      if (needed > existingRows) {
        // Referans satırın XML'ini bul
        const refRegex = new RegExp(`<row r="${sd.templateDataRow}"([^>]*)>([\\s\\S]*?)</row>`)
        const refMatch = xml.match(refRegex)

        if (refMatch) {
          const newRows: string[] = []
          for (let i = existingRows + 1; i <= needed; i++) {
            let newRow = refMatch[0]
            // Row numarasını güncelle
            newRow = newRow.replace(`r="${sd.templateDataRow}"`, `r="${i}"`)
            // Hücre referanslarını güncelle
            newRow = newRow.replace(/r="([A-Z]+)\d+"/g, (_, col) => `r="${col}${i}"`)
            // Değerleri temizle
            newRow = newRow.replace(/<v>[^<]*<\/v>/g, '')
            newRows.push(newRow)
          }
          xml = xml.replace('</sheetData>', newRows.join('\n') + '</sheetData>')
        }
      }
    }

    // Şablondaki referans satırın ham içeriğini (stilli hücreler) bir kez hesapla
    // Self-closing row'lar bu referans ile genişletilecek → stil/border/fill korunur.
    let refRowCells: string | null = null
    if (sd.templateDataRow) {
      const refRowRegex = new RegExp(`<row r="${sd.templateDataRow}"[^>]*>([\\s\\S]*?)</row>`)
      const refMatch0 = xml.match(refRowRegex)
      if (refMatch0) refRowCells = refMatch0[1]
    }

    // Her hücreyi güncelle
    for (const [rowNum, cols] of rowMap) {
      // Self-closing row'u genişletilmiş forma çevir + template stillerini kopyala
      // <row r="9"/> → <row r="9"><c r="A9" s="7"/><c r="B9" s="7"/>...</row>
      // Böylece border/fill/font template'ten gelir, cell değerleri sonra override eder.
      const selfRegex = new RegExp(`<row r="${rowNum}"([^/>]*?)/>`)
      const selfMatch = xml.match(selfRegex)
      if (selfMatch) {
        let inner = ''
        if (refRowCells) {
          // Referans hücrelerini bu satıra kopyala: ref="A4" → r="A9"
          inner = refRowCells
            .replace(/r="([A-Z]+)\d+"/g, (_, col) => `r="${col}${rowNum}"`)
            .replace(/<v>[^<]*<\/v>/g, '') // değerleri temizle, stil kalsın
        }
        xml = xml.replace(selfMatch[0], `<row r="${rowNum}"${selfMatch[1]}>${inner}</row>`)
      }

      // Satır var mı?
      const rowRegex = new RegExp(`(<row r="${rowNum}"[^>]*>)([\\s\\S]*?)(</row>)`)
      const rowMatch = xml.match(rowRegex)

      if (rowMatch) {
        let rowContent = rowMatch[2]

        for (const [colNum, value] of cols) {
          const ref = cellRef(colNum, rowNum)
          // Hücre var mı?
          const cellRegex = new RegExp(`<c r="${ref}"([^/>]*?)(?:>(.*?)</c>|/>)`, 's')
          const cellMatch = rowContent.match(cellRegex)

          if (value === null || value === '') {
            // Boş bırak — varsa değerini temizle
            if (cellMatch) {
              const attrs = cellMatch[1].replace(/\s*t="[^"]*"/g, '')
              rowContent = rowContent.replace(cellMatch[0], `<c r="${ref}"${attrs}/>`)
            }
          } else if (typeof value === 'number') {
            const attrs = cellMatch ? cellMatch[1].replace(/\s*t="[^"]*"/g, '') : ''
            const newCell = `<c r="${ref}"${attrs}><v>${value}</v></c>`
            if (cellMatch) rowContent = rowContent.replace(cellMatch[0], newCell)
            else rowContent += newCell
          } else {
            // String → SharedStrings
            const ssIdx = getOrAddSharedString(escapeXml(value))
            const attrs = cellMatch ? cellMatch[1].replace(/\s*t="[^"]*"/g, '') : ''
            const newCell = `<c r="${ref}"${attrs} t="s"><v>${ssIdx}</v></c>`
            if (cellMatch) rowContent = rowContent.replace(cellMatch[0], newCell)
            else rowContent += newCell
          }
        }

        xml = xml.replace(rowMatch[0], `${rowMatch[1]}${rowContent}${rowMatch[3]}`)
      } else {
        // Satır yok — yeni oluştur
        const cellsXml = Array.from(cols.entries()).map(([colNum, value]) => {
          const ref = cellRef(colNum, rowNum)
          if (value === null || value === '') return ''
          if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`
          const ssIdx = getOrAddSharedString(escapeXml(value))
          return `<c r="${ref}" t="s"><v>${ssIdx}</v></c>`
        }).filter(Boolean).join('')
        xml = xml.replace('</sheetData>', `<row r="${rowNum}">${cellsXml}</row></sheetData>`)
      }
    }

    zip.file(mapping.file, xml)
  }

  // ── SharedStrings güncelle — orijinali koru, yeni string'leri ekle ────
  if (newStrings.length > 0 && originalSsXml) {
    const totalCount = originalSsCount + newStrings.length
    const newSiElements = newStrings.map(s => `<si><t>${s}</t></si>`).join('')

    // count ve uniqueCount güncelle
    let updatedSs = originalSsXml.replace(
      /count="(\d+)"/g,
      `count="${totalCount}"`
    ).replace(
      /uniqueCount="(\d+)"/g,
      `uniqueCount="${totalCount}"`
    )

    // </sst> öncesine yeni string'leri ekle
    updatedSs = updatedSs.replace('</sst>', newSiElements + '</sst>')
    zip.file('xl/sharedStrings.xml', updatedSs)
  }

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
