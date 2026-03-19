/**
 * lib/reports/fill-excel-node.ts
 * JSZip ile Excel şablonunu doldurur — Python gerektirmez.
 * Grafikler, stiller ve merge yapısı korunur.
 */
import JSZip from 'jszip'
import { readFile } from 'fs/promises'
import path from 'path'
import type { GenelRaporData } from './genel-rapor-data'

// ─── XML yardımcıları ─────────────────────────────────────────────────────────

function colLetter(n: number): string {
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function cellRef(row: number, col: number): string {
  return `${colLetter(col)}${row}`
}

/**
 * Sheet XML'inde bir hücrenin değerini değiştirir.
 * Hücre yoksa ekler. inlineStr ve n (number) tiplerini destekler.
 */
function setCellValue(xml: string, ref: string, value: string | number): string {
  const isNum = typeof value === 'number'
  const escaped = isNum ? String(value) : String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  // Mevcut hücreyi bul (herhangi tip)
  const cellPattern = new RegExp(`<c r="${ref}"([^>]*)>(.*?)<\\/c>`, 's')
  const match = xml.match(cellPattern)

  if (match) {
    // Mevcut hücreyi güncelle
    const attrs = match[1]
    // Stil bilgisini koru, tip ve değeri değiştir
    const styleMatch = attrs.match(/s="(\d+)"/)
    const styleAttr = styleMatch ? ` s="${styleMatch[1]}"` : ''
    if (isNum) {
      return xml.replace(cellPattern, `<c r="${ref}"${styleAttr}><v>${escaped}</v></c>`)
    } else {
      return xml.replace(cellPattern, `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${escaped}</t></is></c>`)
    }
  } else {
    // Hücre yok — satıra ekle
    // Önce satırı bul
    const rowPattern = new RegExp(`(<row[^>]*\\s+r="${ref.replace(/[A-Z]+/, '')}"[^>]*>)(.*?)(<\\/row>)`, 's')
    const rowMatch = xml.match(rowPattern)
    if (rowMatch) {
      const newCell = isNum
        ? `<c r="${ref}"><v>${escaped}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t>${escaped}</t></is></c>`
      return xml.replace(rowPattern, `${rowMatch[1]}${rowMatch[2]}${newCell}${rowMatch[3]}`)
    }
    // Satır da yok — wrap etmeden döndür (değer kaybedilir, çok nadir durum)
    return xml
  }
}

/** Birden fazla hücreyi toplu günceller */
function setCells(xml: string, cells: { ref: string; value: string | number }[]): string {
  let result = xml
  for (const { ref, value } of cells) {
    result = setCellValue(result, ref, value)
  }
  return result
}

/** Satır bloğunu şablondan kopyalar (stil ve merge korunur) */
function cloneRow(xml: string, templateRow: number, targetRow: number): string {
  const rowPat = new RegExp(`<row\\s[^>]*\\br="${templateRow}"[^>]*>.*?<\\/row>`, 's')
  const match = xml.match(rowPat)
  if (!match) return xml
  // ref'lerdeki satır numaralarını değiştir
  const cloned = match[0]
    .replace(new RegExp(`r="${templateRow}"`, 'g'), `r="${targetRow}"`)
    .replace(/\s+r="[A-Z]+(\d+)"/g, (m, n) => m.replace(n, String(targetRow)))
    .replace(/<v>[^<]*<\/v>/g, '<v>0</v>')
    .replace(/<is><t>[^<]*<\/t><\/is>/g, '<is><t></t></is>')
  // Hedef satırı yoksa şablon satırından sonra ekle
  const insertAfter = new RegExp(`(<\\/row>)(?=[\\s\\S]*?<row[^>]*\\br="${templateRow}"[^>]*)`)
  if (xml.match(new RegExp(`r="${targetRow}"`))) return xml // zaten var
  return xml.replace(rowPat, match[0] + '\n' + cloned)
}

// ─── Ana fonksiyon ────────────────────────────────────────────────────────────

export async function fillGenelRaporWithNode(data: GenelRaporData): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'public', 'report-templates', 'QR-SYNC_Genel_Rapor.xlsx')
  const templateBuf  = await readFile(templatePath)
  const zip          = await JSZip.loadAsync(templateBuf)

  // Sheet isim → dosya yolu eşlemesi
  const wbXml       = await zip.files['xl/workbook.xml']?.async('string') ?? ''
  const sheetMap    = new Map<string, string>()
  const sheetRels   = await zip.files['xl/_rels/workbook.xml.rels']?.async('string') ?? ''

  // sheetId → r:id → target
  const relMap = new Map<string, string>()
  for (const m of sheetRels.matchAll(/Id="([^"]+)"[^>]+Target="([^"]+)"/g)) {
    relMap.set(m[1], m[2])
  }
  for (const m of wbXml.matchAll(/<sheet\s[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = relMap.get(m[2])
    if (target) sheetMap.set(m[1], target.startsWith('xl/') ? target : `xl/${target}`)
  }

  // Helper: sheet XML'ini al/kaydet
  const getSheet = async (name: string) => {
    const filePath = sheetMap.get(name)
    if (!filePath || !zip.files[filePath]) return { xml: '', filePath: '' }
    return { xml: await zip.files[filePath].async('string'), filePath }
  }
  const saveSheet = (filePath: string, xml: string) => {
    if (filePath) zip.file(filePath, xml)
  }

  const d = data
  const gunSayisi = d.gunSayisi || 1
  const gruplar   = d.grupMetrikleri ?? []

  // ══ GİRİŞ sayfası ══════════════════════════════════════════════════════════
  {
    const { xml: rawXml, filePath } = await getSheet('Giriş')
    let xml = rawXml

    // Parametre hücreleri (col=7 → G)
    xml = setCells(xml, [
      { ref: 'G2', value: d.firmaAdi ?? '' },
      { ref: 'G3', value: d.ustLokTanim ?? '' },
      { ref: 'G4', value: d.altLokTanim ?? '' },
      { ref: 'G5', value: d.raporTarihLabel ?? '' },
      { ref: 'G6', value: `${gunSayisi} gün` },
      { ref: 'G7', value: d.raporuAlan ?? 'Yönetim' },
    ])

    // Grup satırları — template satır 14, max 10 grup
    for (let i = 0; i < 10; i++) {
      const r  = 14 + i
      const g  = gruplar[i]
      const hedef = g?.hedef   ?? 0
      const tam   = g?.tamamlanan ?? 0
      const sap   = g?.sapma   ?? 0
      const kayip = g?.kayip   ?? 0
      const basari = hedef > 0 ? Math.round(tam / hedef * 10000) / 10000 : 0
      const genel  = hedef > 0 ? Math.round((tam + sap) / hedef * 10000) / 10000 : 0

      xml = setCells(xml, [
        { ref: cellRef(r, 2),  value: g?.grup ?? '' },
        { ref: cellRef(r, 5),  value: hedef },
        { ref: cellRef(r, 8),  value: tam },
        { ref: cellRef(r, 11), value: basari },
        { ref: cellRef(r, 15), value: sap },
        { ref: cellRef(r, 18), value: kayip },
        { ref: cellRef(r, 22), value: genel },
        // Özet blok (col 43-48-59)
        { ref: cellRef(r, 43), value: g?.grup ?? '' },
        { ref: cellRef(r, 48), value: hedef },
        { ref: cellRef(r, 59), value: kayip },
      ])
    }

    // Frekans göstergeleri (satır 12-17, col 37)
    const toplamGerceklesen = d.toplamTamamlanan + d.toplamSapma
    const frekansVals = [
      d.toplamGorev, d.toplamTamamlanan, toplamGerceklesen,
      d.toplamSapma, d.toplamKayip, `%${d.genelBasari}`
    ]
    frekansVals.forEach((v, i) => {
      xml = setCellValue(xml, cellRef(12 + i, 37), v)
    })

    // Sapma göstergeleri (col 52)
    const sapmaOrani = d.toplamGorev > 0 ? Math.round(d.toplamSapma / d.toplamGorev * 100) : 0
    ;[d.toplamGorev, d.toplamSapma, `%${sapmaOrani}`].forEach((v, i) => {
      xml = setCellValue(xml, cellRef(12 + i, 52), v)
    })

    // Kayıp göstergeleri (col 66)
    const kayipOrani = d.toplamGorev > 0 ? Math.round(d.toplamKayip / d.toplamGorev * 100) : 0
    ;[d.toplamGorev, d.toplamKayip, `%${kayipOrani}`].forEach((v, i) => {
      xml = setCellValue(xml, cellRef(12 + i, 66), v)
    })

    saveSheet(filePath, xml)
  }

  // ══ TAMAMLANAN FREKANSLAR ══════════════════════════════════════════════════
  {
    const { xml: rawXml, filePath } = await getSheet('Tamamlanan Frekanslar')
    let xml = rawXml
    const rows = d.tamamlananGorevler ?? []
    for (let i = 0; i < rows.length; i++) {
      const r = 4 + i
      const row = rows[i]
      xml = setCells(xml, [
        { ref: cellRef(r, 2), value: row.personel },
        { ref: cellRef(r, 3), value: row.lokasyon },
        { ref: cellRef(r, 4), value: row.gorevNo },
        { ref: cellRef(r, 5), value: row.gorevTanimi },
        { ref: cellRef(r, 6), value: row.tarihSaat },
        { ref: cellRef(r, 7), value: row.durum },
      ])
    }
    saveSheet(filePath, xml)
  }

  // ══ SAPMALAR ══════════════════════════════════════════════════════════════
  {
    const { xml: rawXml, filePath } = await getSheet('Sapmalar')
    let xml = rawXml
    const rows = d.sapmaGorevler ?? []
    for (let i = 0; i < rows.length; i++) {
      const r = 4 + i
      const row = rows[i]
      xml = setCells(xml, [
        { ref: cellRef(r, 2), value: row.personel },
        { ref: cellRef(r, 3), value: row.lokasyon },
        { ref: cellRef(r, 4), value: row.gorevNo },
        { ref: cellRef(r, 5), value: row.gorevTanimi },
        { ref: cellRef(r, 6), value: row.tarihSaat },
        { ref: cellRef(r, 7), value: row.sapmaNedeni },
      ])
    }
    saveSheet(filePath, xml)
  }

  // ══ KAYIP FREKANSLAR ══════════════════════════════════════════════════════
  {
    const { xml: rawXml, filePath } = await getSheet('Kayıp Frekanslar')
    if (filePath) {
      let xml = rawXml
      const rows = d.kayipGorevler ?? []
      for (let i = 0; i < rows.length; i++) {
        const r = 4 + i
        const row = rows[i]
        xml = setCells(xml, [
          { ref: cellRef(r, 2), value: row.lokasyon },
          { ref: cellRef(r, 3), value: row.gorevNo },
          { ref: cellRef(r, 4), value: row.gorevTanimi },
          { ref: cellRef(r, 5), value: row.tarihSaat },
          { ref: cellRef(r, 6), value: row.durum },
        ])
      }
      saveSheet(filePath, xml)
    }
  }

  // ══ GRUPLAR ══════════════════════════════════════════════════════════════
  {
    const { xml: rawXml, filePath } = await getSheet('Gruplar')
    let xml = rawXml
    for (let i = 0; i < gruplar.length; i++) {
      const r = 3 + i
      const g = gruplar[i]
      const hedef = g.hedef ?? 0
      const tam   = g.tamamlanan ?? 0
      const sap   = g.sapma ?? 0
      const basari = hedef > 0 ? Math.round(tam / hedef * 10000) / 10000 : 0
      const genel  = hedef > 0 ? Math.round((tam + sap) / hedef * 10000) / 10000 : 0
      xml = setCells(xml, [
        { ref: cellRef(r, 1),  value: i + 1 },
        { ref: cellRef(r, 2),  value: g.grup },
        { ref: cellRef(r, 3),  value: g.lokasyon },
        { ref: cellRef(r, 4),  value: g.gorevTanimi },
        { ref: cellRef(r, 5),  value: g.gunlukFrekans ?? 0 },
        { ref: cellRef(r, 6),  value: hedef },
        { ref: cellRef(r, 7),  value: tam },
        { ref: cellRef(r, 8),  value: sap },
        { ref: cellRef(r, 9),  value: g.kayip ?? 0 },
        { ref: cellRef(r, 10), value: basari },
        { ref: cellRef(r, 11), value: genel },
      ])
    }
    // SUM formülleri
    const dataEnd = Math.max(gruplar.length + 2, 3)
    xml = setCells(xml, [
      { ref: 'E2', value: `=SUM(E3:E${dataEnd})` },
      { ref: 'F2', value: `=SUM(F3:F${dataEnd})` },
      { ref: 'G2', value: `=SUM(G3:G${dataEnd})` },
      { ref: 'H2', value: `=SUM(H3:H${dataEnd})` },
      { ref: 'I2', value: `=SUM(I3:I${dataEnd})` },
      { ref: 'J2', value: '=IF(F2>0,G2/F2,0)' },
      { ref: 'K2', value: '=IF(F2>0,(G2+H2)/F2,0)' },
    ])
    saveSheet(filePath, xml)
  }

  // ── ZIP'i buffer olarak döndür ────────────────────────────────────────────
  const outBuf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return outBuf
}
