import ExcelJS from "exceljs"
import path from "path"
import { GenelRaporData } from "./genel-rapor-data"

/**
 * Merged hücrelerde her zaman merge aralığının sol-üst hücresine yaz.
 * ExcelJS merged hücrelere yazarken bu gereklidir.
 */
function writeCell(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
  align: "left" | "center" | "right" = "left"
) {
  const cell = ws.getCell(row, col)
  cell.value = value
  cell.alignment = { horizontal: align, vertical: "middle", wrapText: true }
}

export async function fillGenelRaporExcel(data: GenelRaporData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()

  const templatePath = path.join(
    process.cwd(),
    "public",
    "report-templates",
    "QR-SYNC_Genel_Rapor.xlsx"
  )

  await workbook.xlsx.readFile(templatePath)

  const wsGiris   = workbook.getWorksheet("Giriş")
  const wsGruplar = workbook.getWorksheet("Gruplar")
  const wsTam     = workbook.getWorksheet("Tamamlanan Frekanslar")
  const wsSap     = workbook.getWorksheet("Sapmalar")

  if (!wsGiris || !wsGruplar || !wsTam || !wsSap) {
    throw new Error("Template sheet bulunamadı")
  }

  const gruplar      = data.grupMetrikleri
  const toplam       = data.toplamGorev
  const toplamTam    = data.toplamTamamlanan
  const toplamSap    = data.toplamSapma
  const toplamKay    = data.toplamKayip
  const genelBasari  = data.genelBasari
  const toplamGercek = toplamTam + toplamSap

  /* ═══════════════════════════════════════════════════════════
     GİRİŞ SAYFASI
  ═══════════════════════════════════════════════════════════ */

  // PARAMETRELER — G sütunu (col=7), G2:P merge başlangıcı
  writeCell(wsGiris, 2, 7, data.firmaAdi)
  writeCell(wsGiris, 3, 7, data.ustLokTanim)
  writeCell(wsGiris, 4, 7, data.altLokTanim)
  writeCell(wsGiris, 5, 7, data.raporTarihLabel)
  writeCell(wsGiris, 6, 7, "Otomatik hesaplanır")
  writeCell(wsGiris, 7, 7, data.raporuAlan)

  // HAKEDİŞ FAKTÖRLERİ — satır 4'ten itibaren
  // AQ(43)=Grup Tanımı, AV(48)=Hedef Frekans/Birim Fiyat, BG(59)=Kayıp Hakediş
  for (let i = 0; i < Math.min(gruplar.length, 20); i++) {
    const r = 4 + i
    const g = gruplar[i]
    writeCell(wsGiris, r, 43, g.grup)
    writeCell(wsGiris, r, 48, g.hedef, "center")
    writeCell(wsGiris, r, 59, g.kayip, "center")
  }

  // GRUP FREKANS GÖSTERGELERİ — satır 14'ten itibaren
  // B(2)=Grup Tanımı, E(5)=Hedef, H(8)=Tamamlanmış, K(11)=Zamanında%,
  // O(15)=Sapma, R(18)=Kayıp, V(22)=Genel Oran
  for (let i = 0; i < Math.min(gruplar.length, 10); i++) {
    const r = 14 + i
    const g = gruplar[i]
    writeCell(wsGiris, r, 2,  g.grup)
    writeCell(wsGiris, r, 5,  g.hedef,       "center")
    writeCell(wsGiris, r, 8,  g.tamamlanan,  "center")
    writeCell(wsGiris, r, 11, g.basariOrani, "center")
    writeCell(wsGiris, r, 15, g.sapma,       "center")
    writeCell(wsGiris, r, 18, g.kayip,       "center")
    writeCell(wsGiris, r, 22, g.genelOran,   "center")
  }

  // FREKANS GÖSTERGELERİ değerleri — AK(37) sütunu, satır 12'den
  // Toplam | Tamamlanmış | Gerçekleşen | Sapma | Kayıp | Başarı%
  const frekVals: ExcelJS.CellValue[] = [
    toplam,
    toplamTam,
    toplamGercek,
    toplamSap,
    toplamKay,
    `%${genelBasari}`,
  ]
  for (let i = 0; i < frekVals.length; i++) {
    writeCell(wsGiris, 12 + i, 37, frekVals[i], "center")
  }

  // FREKANS SAPMALARI değerleri — AZ(52) sütunu, satır 12'den
  // Grafik kaynağı: Giriş!$AZ$12:$AZ$13
  const sapmaPct = toplam > 0 ? Math.round((toplamSap / toplam) * 100) : 0
  const sapmaVals: ExcelJS.CellValue[] = [toplam, toplamSap, `%${sapmaPct}`]
  for (let i = 0; i < sapmaVals.length; i++) {
    writeCell(wsGiris, 12 + i, 52, sapmaVals[i], "center")
  }

  // KAYIP FREKANS GÖSTERGELERİ değerleri — BN(66) sütunu, satır 12'den
  const kayipPct = toplam > 0 ? Math.round((toplamKay / toplam) * 100) : 0
  const kayipVals: ExcelJS.CellValue[] = [toplam, toplamKay, `%${kayipPct}`]
  for (let i = 0; i < kayipVals.length; i++) {
    writeCell(wsGiris, 12 + i, 66, kayipVals[i], "center")
  }

  /* ═══════════════════════════════════════════════════════════
     TAMAMLANAN FREKANSLAR
  ═══════════════════════════════════════════════════════════ */

  wsTam.getCell("C3").value = toplamTam

  const tamRows  = data.tamamlananGorevler
  const tamClear = Math.max(5, tamRows.length)
  for (let r = 4; r < 4 + tamClear; r++) {
    for (let c = 1; c <= 7; c++) wsTam.getCell(r, c).value = null
  }

  for (let i = 0; i < tamRows.length; i++) {
    const r = 4 + i
    const t = tamRows[i]
    wsTam.getCell(r, 1).value = t.sn
    wsTam.getCell(r, 2).value = t.personel
    wsTam.getCell(r, 3).value = t.lokasyon
    wsTam.getCell(r, 4).value = t.gorevNo
    wsTam.getCell(r, 5).value = t.gorevTanimi
    wsTam.getCell(r, 6).value = t.tarihSaat
    wsTam.getCell(r, 7).value = "TAMAMLANDI"
  }

  /* ═══════════════════════════════════════════════════════════
     SAPMALAR
  ═══════════════════════════════════════════════════════════ */

  wsSap.getCell("C3").value = toplamSap

  const sapRows  = data.sapmaGorevler
  const sapClear = Math.max(5, sapRows.length)
  for (let r = 4; r < 4 + sapClear; r++) {
    for (let c = 1; c <= 7; c++) wsSap.getCell(r, c).value = null
  }

  for (let i = 0; i < sapRows.length; i++) {
    const r = 4 + i
    const s = sapRows[i]
    wsSap.getCell(r, 1).value = s.sn
    wsSap.getCell(r, 2).value = s.personel
    wsSap.getCell(r, 3).value = s.lokasyon
    wsSap.getCell(r, 4).value = s.gorevNo
    wsSap.getCell(r, 5).value = s.gorevTanimi
    wsSap.getCell(r, 6).value = s.tarihSaat
    wsSap.getCell(r, 7).value = s.sapmaNedeni
  }

  /* ═══════════════════════════════════════════════════════════
     GRUPLAR
  ═══════════════════════════════════════════════════════════ */

  const toplamBasari = toplam > 0 ? Math.round((toplamTam / toplam) * 100) : 0
  const toplamGenel  = toplam > 0 ? Math.round(((toplamTam + toplamSap) / toplam) * 100) : 0
  const toplamGunluk = gruplar.reduce((s, g) => s + g.gunlukFrekans, 0)

  wsGruplar.getCell(2, 4).value  = toplamGunluk
  wsGruplar.getCell(2, 5).value  = toplam
  wsGruplar.getCell(2, 6).value  = toplamTam
  wsGruplar.getCell(2, 7).value  = toplamSap
  wsGruplar.getCell(2, 8).value  = toplamKay
  wsGruplar.getCell(2, 9).value  = `%${toplamBasari}`
  wsGruplar.getCell(2, 10).value = `%${toplamGenel}`

  const grClear = Math.max(5, gruplar.length)
  for (let r = 3; r < 3 + grClear; r++) {
    for (let c = 1; c <= 10; c++) wsGruplar.getCell(r, c).value = null
  }

  for (let i = 0; i < gruplar.length; i++) {
    const r = 3 + i
    const g = gruplar[i]
    wsGruplar.getCell(r, 1).value  = i + 1
    wsGruplar.getCell(r, 2).value  = g.grup
    wsGruplar.getCell(r, 3).value  = g.lokasyon
    wsGruplar.getCell(r, 4).value  = g.gunlukFrekans
    wsGruplar.getCell(r, 5).value  = g.hedef
    wsGruplar.getCell(r, 6).value  = g.tamamlanan
    wsGruplar.getCell(r, 7).value  = g.sapma
    wsGruplar.getCell(r, 8).value  = g.kayip
    wsGruplar.getCell(r, 9).value  = g.basariOrani
    wsGruplar.getCell(r, 10).value = g.genelOran
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}