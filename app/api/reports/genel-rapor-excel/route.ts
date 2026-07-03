/**
 * GET /api/reports/genel-rapor-excel?firmaId=...&ustLokasyonId=...
 *
 * ŞABLON BAZLI: lib/reports/templates altındaki .xlsx dosyalarını kullanır.
 * Chart'lar şablonda tanımlı, KPI hücrelerinden formülle bağlı.
 * Kod sadece veri hücrelerini doldurur, chart'lara hiç dokunmaz.
 *
 * Filtreye göre şablon seçimi:
 *   ustLokasyonId varsa (spesifik departman) → template-tek.xlsx
 *   yoksa/Tümü                               → template-tumu.xlsx
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGenelRaporData } from '@/lib/reports/genel-rapor-data'
import path from 'path'

export const runtime = 'nodejs'

function fmt(n: number | null | undefined): number { return typeof n === 'number' ? n : 0 }
function pct(n: number | null | undefined): string { return `%${typeof n === 'number' ? n : 0}` }

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 })

    const p = new URL(request.url).searchParams
    const firmaId = p.get('firmaId')
    if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    const ustLokasyonId = p.get('ustLokasyonId')
    const data = await buildGenelRaporData({
      firmaId,
      projeId:          p.get('projeId')          || null,
      ustLokasyonId,
      altLokasyonId:    p.get('altLokasyonId')    || null,
      altAltLokasyonId: p.get('altAltLokasyonId') || null,
      raporBaslangic: p.get('raporBaslangic') || null,
      raporBitis:     p.get('raporBitis')     || null,
      raporuAlan:     p.get('raporuAlan')     || null,
      // KRITIK: UI'daki buildParams() 'vardiya' gonderiyor ama Excel endpoint
      // bunu almiyordu -> UI kartlari filtreli, Excel filtresiz -> tutarsizlik.
      vardiya: (p.get('vardiya') as any) || 'all',
    })

    const toplamHedef       = data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0) || data.toplamGorev
    const toplamTamamlanan  = data.toplamTamamlanan
    const toplamSapma       = data.toplamSapma
    const toplamKayip       = data.toplamKayip
    const toplamEkstra      = data.toplamEkstra ?? data.frekansDisiGorevler.length
    const toplamGerceklesen = toplamTamamlanan + toplamSapma
    const genelOran         = toplamHedef > 0 ? Math.round(toplamGerceklesen / toplamHedef * 100) : 0
    const basari            = data.genelBasari ?? 0

    // Şablonu filtreye göre seç
    const templateFile = ustLokasyonId
      ? 'frekansiyel-rapor-tek.xlsx'
      : 'frekansiyel-rapor-tumu.xlsx'
    const templatePath = path.join(process.cwd(), 'lib', 'reports', 'templates', templateFile)

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(templatePath)

    // ── Özet Sayfası ─────────────────────────────────────────────────────
    const wsOzet = wb.getWorksheet('Özet')
    if (!wsOzet) throw new Error("Sablon 'Özet' sheet'i bulunamadi")

    // Rapor bilgileri (A2-A8 = label, B2-B8 = değer)
    wsOzet.getCell('B2').value = data.firmaAdi    || '—'
    wsOzet.getCell('B3').value = data.projeAdi    || '—'
    wsOzet.getCell('B4').value = data.ustLokTanim || 'Tümü'
    wsOzet.getCell('B5').value = data.altLokTanim || 'Tümü'
    wsOzet.getCell('B6').value = data.raporTarihLabel || '—'
    wsOzet.getCell('B7').value = data.gunSayisi
    wsOzet.getCell('B8').value = data.raporuAlan  || '—'

    // KPI metrikleri (B11-B18) — chart'lar bunlardan formülle bağlı
    wsOzet.getCell('B11').value = fmt(toplamHedef)
    wsOzet.getCell('B12').value = fmt(toplamTamamlanan)
    wsOzet.getCell('B13').value = fmt(toplamEkstra)
    wsOzet.getCell('B14').value = fmt(toplamGerceklesen)
    wsOzet.getCell('B15').value = fmt(toplamSapma)
    wsOzet.getCell('B16').value = fmt(toplamKayip)
    wsOzet.getCell('B17').value = pct(basari)
    wsOzet.getCell('B18').value = pct(genelOran)

    // ── Grup Metrikleri ──────────────────────────────────────────────────
    // Row 1 = header (şablonda mevcut, dokunma)
    // Row 2 = TOPLAM satırı (şablonda formatlı, veriyi güncelle)
    // Row 3+ = detay satırları
    const wsGrup = wb.getWorksheet('Grup Metrikleri')
    if (wsGrup) {
      // Şablonda önceden yerleştirilen örnek satırları temizle (row 2'den itibaren
      // header dışında kalan tüm satırlar). Row 2'yi TOPLAM olarak kullanacağız.
      const eskiRowSayisi = wsGrup.rowCount
      for (let r = eskiRowSayisi; r >= 2; r--) {
        const row = wsGrup.getRow(r)
        row.eachCell({ includeEmpty: true }, c => { c.value = null })
      }

      // Row 2: TOPLAM
      const tGunluk = data.grupMetrikleri.reduce((s, g) => s + g.gunlukFrekans, 0)
      const tHedef  = data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0)
      const tTam    = data.grupMetrikleri.reduce((s, g) => s + g.tamamlanan, 0)
      const tEks    = data.grupMetrikleri.reduce((s, g) => s + (g.ekstra ?? 0), 0)
      const tSap    = data.grupMetrikleri.reduce((s, g) => s + g.sapma, 0)
      const tKay    = data.grupMetrikleri.reduce((s, g) => s + g.kayip, 0)
      const tGer    = tTam + tEks
      const tBas    = tHedef > 0 ? Math.round(tGer / tHedef * 100) : 0
      const tGenel  = tHedef > 0 ? Math.round((tGer + tSap) / tHedef * 100) : 0
      const totRow  = wsGrup.getRow(2)
      totRow.getCell(1).value  = '—'
      totRow.getCell(2).value  = 'TOPLAM'
      totRow.getCell(3).value  = '—'
      totRow.getCell(4).value  = '—'
      totRow.getCell(5).value  = tGunluk
      totRow.getCell(6).value  = tHedef
      totRow.getCell(7).value  = tTam
      totRow.getCell(8).value  = tEks
      totRow.getCell(9).value  = tSap
      totRow.getCell(10).value = tKay
      totRow.getCell(11).value = `%${tBas}`
      totRow.getCell(12).value = `%${tGenel}`
      totRow.font = { bold: true }

      // Row 3+: detay
      data.grupMetrikleri.forEach((g, i) => {
        const row = wsGrup.getRow(3 + i)
        row.getCell(1).value  = i + 1
        row.getCell(2).value  = g.grup
        row.getCell(3).value  = g.ustLokasyon
        row.getCell(4).value  = g.lokasyon
        row.getCell(5).value  = g.gunlukFrekans
        row.getCell(6).value  = g.hedef
        row.getCell(7).value  = g.tamamlanan
        row.getCell(8).value  = g.ekstra ?? 0
        row.getCell(9).value  = g.sapma
        row.getCell(10).value = g.kayip
        row.getCell(11).value = `%${g.basariOrani}`
        row.getCell(12).value = `%${g.genelOran}`
      })
    }

    // ── Yardımcı: bir sheet'i data ile doldur ────────────────────────────
    function fillDetaySheet(sheetName: string, rows: any[], mapper: (r: any, i: number) => any[]) {
      const ws = wb.getWorksheet(sheetName)
      if (!ws) return
      // Eski örnek satırları temizle (row 2'den itibaren)
      const eskiRowSayisi = ws.rowCount
      for (let r = eskiRowSayisi; r >= 2; r--) {
        const row = ws.getRow(r)
        row.eachCell({ includeEmpty: true }, c => { c.value = null })
      }
      rows.forEach((r, i) => {
        const excelRow = ws.getRow(2 + i)
        const vals = mapper(r, i)
        vals.forEach((v, ci) => { excelRow.getCell(ci + 1).value = v })
      })
    }

    // ── Tamamlanan ───────────────────────────────────────────────────────
    fillDetaySheet('Tamamlanan', data.tamamlananGorevler, (t) => [
      t.sn, t.personel, t.ustLokasyon, t.lokasyon, t.gorevNo, t.gorevTanimi, t.tarihSaat, t.durum,
    ])

    // ── Sapmalar ─────────────────────────────────────────────────────────
    fillDetaySheet('Sapmalar', data.sapmaGorevler, (s) => [
      s.sn, s.personel, s.ustLokasyon, s.lokasyon, s.gorevNo, s.gorevTanimi, s.tarihSaat, s.sapmaNedeni,
    ])

    // ── Kayıp Frekanslar ─────────────────────────────────────────────────
    fillDetaySheet('Kayıp Frekanslar', data.kayipGorevler, (k) => {
      // Tanımda "VARDIYA" geçmiyorsa üretildiği vardiya no'yu suffix ekle
      const tanim = (k.vardiyaNo && !/VARD[İI]YA/i.test(String(k.gorevTanimi ?? '')))
        ? `${k.gorevTanimi}  ·  V${k.vardiyaNo}`
        : k.gorevTanimi
      return [k.sn, k.ustLokasyon, k.lokasyon, k.gorevNo, tanim, k.tarih, k.iptalEden ?? 'sistem', k.durum, k.kayipNedeni]
    })

    // ── Frekans Dışı ─────────────────────────────────────────────────────
    fillDetaySheet('Frekans Dışı', data.frekansDisiGorevler, (f) => [
      f.sn, f.ustLokasyon, f.grupTanimi, f.lokasyonTanimi, f.aciklama,
      f.tarihSaat, f.gorevSuresi, f.personel, f.gerekce || '',
    ])

    // ── Export ───────────────────────────────────────────────────────────
    // Hybrid yaklasim (Ters yon): Sabloni TAMAMEN preserve et, sadece
    // worksheet XML'lerini ExcelJS'ten alarak sablona overwrite et.
    // Chart'lar, workbook.xml, calcChain, styles, sharedStrings hepsi
    // orijinal sablondaki gibi kalir -> Excel "onarim" istegi cikarmaz.
    const excelJSBuffer = await wb.xlsx.writeBuffer()

    const fs = await import('fs')
    const JSZip = (await import('jszip')).default
    const templateBuffer = await fs.promises.readFile(templatePath)
    const outputZip = await JSZip.loadAsync(templateBuffer)  // Sablonun kopyasi
    const excelJSZip = await JSZip.loadAsync(excelJSBuffer as any)

    // ExcelJS output'undan alinacak dosyalar:
    //  - worksheet XML'leri (yeni cell degerleri)
    //  - sharedStrings.xml (worksheet string ID'leri)
    //  - styles.xml (worksheet cell style ID referanslari — sablondaki
    //    styles.xml'i preserve edersek ExcelJS'in <c s="5"> gibi refleri
    //    yanlis style'a bakip percent format vs. corruption yapiyor)
    const excelJSFiles: string[] = []
    excelJSZip.forEach((relPath, file) => {
      if (file.dir) return
      if (/^xl\/worksheets\/sheet\d+\.xml$/.test(relPath)) excelJSFiles.push(relPath)
      if (relPath === 'xl/sharedStrings.xml') excelJSFiles.push(relPath)
      if (relPath === 'xl/styles.xml') excelJSFiles.push(relPath)
    })

    for (const relPath of excelJSFiles) {
      const file = excelJSZip.file(relPath)
      if (!file) continue
      const content = await file.async('nodebuffer')
      outputZip.file(relPath, content)
    }

    // ExcelJS worksheet'lerinin drawing (chart) bagli kalmasi icin
    // xl/worksheets/_rels/sheet1.xml.rels'te drawing referansi olmali.
    // ExcelJS bunu ureten sheet1.xml.rels'te chart yok cunku ExcelJS chart'i
    // silmisti. Sablondaki .rels dosyalari zaten preserve edilmis (biz
    // ExcelJS'in .rels dosyalarini almiyoruz). Ancak ExcelJS sheet1.xml
    // icinde <drawing r:id="rId1"/> reference'ini uretmiyor olabilir.
    // Bu durumda sheet1.xml'in sonuna manuel drawing reference ekle.
    const sheet1XmlFile = outputZip.file('xl/worksheets/sheet1.xml')
    if (sheet1XmlFile) {
      let sheet1Xml = await sheet1XmlFile.async('string')
      if (!sheet1Xml.includes('<drawing ')) {
        // </worksheet>'ten hemen once <drawing r:id="rIdX"/> ekle
        // ExcelJS'in sheet1.xml.rels'inde drawing icin bir rId olmali.
        // Sablondan sheet1.xml.rels'i okuyup drawing rId'sini bul.
        const sheetRelsFile = outputZip.file('xl/worksheets/_rels/sheet1.xml.rels')
        if (sheetRelsFile) {
          const relsXml = await sheetRelsFile.async('string')
          // Her <Relationship .../>'in kendi icinde Id ve Type attribute'larini bul
          const relMatches = relsXml.matchAll(/<Relationship\s+([^>]+?)\/>/g)
          let drawingRId: string | null = null
          for (const m of relMatches) {
            const attrs = m[1]
            if (/Type="[^"]*drawing"/.test(attrs)) {
              const idMatch = attrs.match(/Id="([^"]+)"/)
              if (idMatch) { drawingRId = idMatch[1]; break }
            }
          }
          if (drawingRId) {
            sheet1Xml = sheet1Xml.replace(/<\/worksheet>/, `<drawing r:id="${drawingRId}"/></worksheet>`)
            outputZip.file('xl/worksheets/sheet1.xml', sheet1Xml)
          }
        }
      }
    }

    // Excel acilinca formul recalculation zorla — sablonun workbook.xml'ine
    // calcPr fullCalcOnLoad ekle.
    const wbXmlFile = outputZip.file('xl/workbook.xml')
    if (wbXmlFile) {
      let wbXml = await wbXmlFile.async('string')
      if (/<calcPr\b[^>]*\bfullCalcOnLoad=/.test(wbXml)) {
        // Zaten var, dokunma
      } else if (/<calcPr\b[^>]*\/>/.test(wbXml)) {
        wbXml = wbXml.replace(/<calcPr\b([^>]*)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>')
      } else if (!wbXml.includes('<calcPr')) {
        wbXml = wbXml.replace(/<\/workbook>/, '<calcPr fullCalcOnLoad="1"/></workbook>')
      }
      outputZip.file('xl/workbook.xml', wbXml)
    }

    // calcChain.xml'i sil — worksheet degistiginde stale reference'lari
    // olabilir. Excel calcPr fullCalcOnLoad ile yeniden hesaplayacak.
    outputZip.remove('xl/calcChain.xml')
    // [Content_Types].xml'den calcChain reference'ini da temizle
    const ctFile = outputZip.file('[Content_Types].xml')
    if (ctFile) {
      let ct = await ctFile.async('string')
      ct = ct.replace(/<Override\b[^/]*PartName="\/xl\/calcChain\.xml"[^/]*\/>/g, '')
      outputZip.file('[Content_Types].xml', ct)
    }

    const finalBuffer = await outputZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(finalBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="frekansiyel-rapor-${date}.xlsx"`,
      },
    })
  } catch (err: any) {
    console.error('[genel-rapor-excel]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
