/**
 * XLSX Şablon Doldurma — JSZip ile doğrudan XML manipülasyonu.
 * ExcelJS'in grafikleri silme sorununu çözer.
 * Şablondaki tüm dosyalar (chart, drawing, style, vb.) birebir korunur.
 */
import JSZip from 'jszip'

// Sheet XML namespace'leri
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'

interface SheetMapping {
  name: string
  file: string // xl/worksheets/sheetN.xml
}

/**
 * xlsx buffer'dan sheet isimlerini ve dosya eşlemelerini çıkarır.
 */
async function getSheetMappings(zip: JSZip): Promise<SheetMapping[]> {
  const wbXml = await zip.file('xl/workbook.xml')!.async('string')
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')

  // workbook.xml: <sheet name="Giriş" sheetId="15" r:id="rId1"/>
  const sheets: { name: string; rId: string }[] = []
  const sheetRegex = /<sheet\s+name="([^"]+)"[^>]*r:id="([^"]+)"/g
  let m
  while ((m = sheetRegex.exec(wbXml)) !== null) {
    sheets.push({ name: m[1], rId: m[2] })
  }

  // rels: <Relationship Id="rId1" ... Target="worksheets/sheet1.xml"/>
  const relMap = new Map<string, string>()
  const relRegex = /Id="([^"]+)"[^>]*Target="([^"]+)"/g
  while ((m = relRegex.exec(relsXml)) !== null) {
    relMap.set(m[1], m[2])
  }

  return sheets.map(s => ({
    name: s.name,
    file: 'xl/' + (relMap.get(s.rId) ?? ''),
  }))
}

/**
 * SharedStrings tablosuna yeni string ekler ve index'ini döndürür.
 */
function addSharedString(ssStrings: string[], value: string): number {
  const idx = ssStrings.length
  ssStrings.push(value)
  return idx
}

/**
 * Sütun harfini (A, B, ..., Z, AA, AB...) hesaplar.
 */
function colLetter(col: number): string {
  let s = ''
  while (col > 0) {
    const r = (col - 1) % 26
    s = String.fromCharCode(65 + r) + s
    col = Math.floor((col - 1) / 26)
  }
  return s
}

/**
 * Hücre referansı oluşturur (1-indexed col+row → "A1").
 */
function cellRef(col: number, row: number): string {
  return colLetter(col) + row
}

export type CellValue = string | number | null
export type CellData = { col: number; row: number; value: CellValue }

export interface SheetData {
  sheetName: string
  cells: CellData[]
  /** Şablondaki son boş satırdan sonra eklenen yeni satırlar için referans satır numarası */
  templateDataRow?: number
  /** Yeni satır sayısı (şablondaki boş satırlardan fazla olan) */
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

  // SharedStrings yükle
  const ssFile = zip.file('xl/sharedStrings.xml')
  let ssStrings: string[] = []
  let ssXml = ''
  if (ssFile) {
    ssXml = await ssFile.async('string')
    // Mevcut string'leri parse et
    const siRegex = /<si>[\s\S]*?<\/si>/g
    let sm
    while ((sm = siRegex.exec(ssXml)) !== null) {
      // <si><t>value</t></si> → value
      const tMatch = sm[0].match(/<t[^>]*>([\s\S]*?)<\/t>/)
      ssStrings.push(tMatch ? tMatch[1] : '')
    }
  }

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

    // Gerekirse yeni satırlar ekle (şablondaki satırlardan fazla veri varsa)
    if (sd.totalDataRows && sd.templateDataRow) {
      const existingRowCount = (xml.match(/<row /g) || []).length
      const templateRowRef = sd.templateDataRow

      // Şablondaki referans satırın XML'ini bul (stil kopyası için)
      const refRowRegex = new RegExp(`<row r="${templateRowRef}"[^>]*>([\\s\\S]*?)</row>`)
      const refRowMatch = xml.match(refRowRegex)
      const refRowContent = refRowMatch ? refRowMatch[0] : null

      if (refRowContent && sd.totalDataRows > 0) {
        // </sheetData> öncesine yeni satırlar ekle
        const newRows: string[] = []
        for (let i = existingRowCount + 1; i <= sd.templateDataRow - 1 + sd.totalDataRows; i++) {
          // Referans satırı klonla, row numarasını güncelle
          let newRow = refRowContent.replace(/r="(\d+)"/, `r="${i}"`)
          // Hücre referanslarını güncelle (A4 → A25 gibi)
          newRow = newRow.replace(/r="([A-Z]+)\d+"/g, (_, col) => `r="${col}${i}"`)
          // Hücre değerlerini temizle
          newRow = newRow.replace(/<v>[^<]*<\/v>/g, '<v></v>')
          newRow = newRow.replace(/t="s"\s*/g, '') // string type'ı kaldır
          newRows.push(newRow)
        }
        if (newRows.length > 0) {
          xml = xml.replace('</sheetData>', newRows.join('') + '</sheetData>')
        }
      }
    }

    // Her satır için hücreleri güncelle veya ekle
    for (const [rowNum, cols] of rowMap) {
      const rowRegex = new RegExp(`<row r="${rowNum}"([^>]*)>([\\s\\S]*?)</row>`)
      const rowMatch = xml.match(rowRegex)

      if (rowMatch) {
        let rowContent = rowMatch[2]
        const rowAttrs = rowMatch[1]

        for (const [colNum, value] of cols) {
          const ref = cellRef(colNum, rowNum)
          const cellRegex = new RegExp(`<c r="${ref}"([^>]*)(?:>(.*?)</c>|/>)`, 's')
          const cellMatch = rowContent.match(cellRegex)

          let cellXml: string
          if (value === null || value === '') {
            // Boş hücre
            if (cellMatch) {
              cellXml = `<c r="${ref}"${cellMatch[1].replace(/\s*t="[^"]*"/, '')}/>`
              rowContent = rowContent.replace(cellMatch[0], cellXml)
            }
          } else if (typeof value === 'number') {
            const attrs = cellMatch ? cellMatch[1].replace(/\s*t="[^"]*"/, '') : ''
            cellXml = `<c r="${ref}"${attrs}><v>${value}</v></c>`
            if (cellMatch) {
              rowContent = rowContent.replace(cellMatch[0], cellXml)
            } else {
              rowContent += cellXml
            }
          } else {
            // String → sharedStrings'e ekle
            const ssIdx = addSharedString(ssStrings, escapeXml(value))
            const attrs = cellMatch ? cellMatch[1].replace(/\s*t="[^"]*"/, '') : ''
            cellXml = `<c r="${ref}"${attrs} t="s"><v>${ssIdx}</v></c>`
            if (cellMatch) {
              rowContent = rowContent.replace(cellMatch[0], cellXml)
            } else {
              rowContent += cellXml
            }
          }
        }

        xml = xml.replace(rowMatch[0], `<row r="${rowNum}"${rowAttrs}>${rowContent}</row>`)
      } else {
        // Satır yok — yeni satır oluştur
        const cellsXml = Array.from(cols.entries()).map(([colNum, value]) => {
          const ref = cellRef(colNum, rowNum)
          if (value === null || value === '') return ''
          if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`
          const ssIdx = addSharedString(ssStrings, escapeXml(value))
          return `<c r="${ref}" t="s"><v>${ssIdx}</v></c>`
        }).filter(Boolean).join('')

        const newRowXml = `<row r="${rowNum}">${cellsXml}</row>`
        xml = xml.replace('</sheetData>', newRowXml + '</sheetData>')
      }
    }

    zip.file(mapping.file, xml)
  }

  // SharedStrings güncelle
  if (ssStrings.length > 0) {
    const newSsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="${NS}" count="${ssStrings.length}" uniqueCount="${ssStrings.length}">
${ssStrings.map(s => `<si><t>${s}</t></si>`).join('')}
</sst>`
    zip.file('xl/sharedStrings.xml', newSsXml)
  }

  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  return outBuf
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
