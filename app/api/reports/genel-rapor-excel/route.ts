/**
 * GET /api/reports/genel-rapor-excel?firmaId=...&...
 * Frekansiyel Görevler Raporu'nu ExcelJS ile oluşturur.
 * Şablona bağımlılık yoktur — sayfa yapısı UI sekmeleriyle birebir örtüşür.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGenelRaporData } from '@/lib/reports/genel-rapor-data'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 })

    const p = new URL(request.url).searchParams
    const firmaId = p.get('firmaId')
    if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    const data = await buildGenelRaporData({
      firmaId,
      projeId:          p.get('projeId')          || null,
      ustLokasyonId:    p.get('ustLokasyonId')    || null,
      altLokasyonId:    p.get('altLokasyonId')    || null,
      altAltLokasyonId: p.get('altAltLokasyonId') || null,
      raporBaslangic: p.get('raporBaslangic') || null,
      raporBitis:     p.get('raporBitis')     || null,
      raporuAlan:     p.get('raporuAlan')     || null,
    })

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'QR-Sync'

    // ── Ortak stiller ────────────────────────────────────────────────────────
    const HDR_FILL  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1A5C2A' } }
    const HDR_FONT  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
    const HDR_ALIGN = { horizontal: 'center' as const, vertical: 'middle' as const }
    const META_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEFF6FF' } }
    const EVEN_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF8FAFC' } }
    const ODD_FILL  = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } }

    function setHdr(ws: any, rowNum: number, cols: { col: number; text: string; width?: number }[]) {
      const row = ws.getRow(rowNum)
      row.height = 22
      cols.forEach(({ col, text, width }) => {
        const c = row.getCell(col)
        c.value = text
        c.style = { font: HDR_FONT, fill: HDR_FILL, alignment: HDR_ALIGN }
        if (width) ws.getColumn(col).width = width
      })
    }

    function setMeta(ws: any, rowNum: number, label: string, value: string) {
      const row = ws.getRow(rowNum)
      row.height = 18
      const c1 = row.getCell(1); c1.value = label
      c1.style = { font: { bold: true, size: 10 }, fill: META_FILL, alignment: { horizontal: 'right' as const } }
      const c2 = row.getCell(2); c2.value = value
      c2.style = { font: { size: 10 }, fill: META_FILL }
    }

    const toplamHedef       = data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0) || data.toplamGorev
    const toplamGerceklesen = data.toplamTamamlanan + data.toplamSapma
    const genelOran         = toplamHedef > 0 ? Math.round(toplamGerceklesen / toplamHedef * 100) : 0

    // ── Sayfa 1: Özet ────────────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Özet')
    ws1.getColumn(1).width = 22
    ws1.getColumn(2).width = 30

    const titleRow = ws1.getRow(1)
    titleRow.height = 28
    const tc = titleRow.getCell(1)
    tc.value = 'Frekansiyel Görevler Raporu'
    tc.font  = { bold: true, size: 15, color: { argb: 'FF0F1A0F' } }
    ws1.mergeCells('A1:B1')

    setMeta(ws1, 2, 'Firma:',        data.firmaAdi    || '—')
    setMeta(ws1, 3, 'Proje:',        data.projeAdi    || '—')
    setMeta(ws1, 4, 'Üst Lokasyon:', data.ustLokTanim || 'Tümü')
    setMeta(ws1, 5, 'Alt Lokasyon:', data.altLokTanim || 'Tümü')
    setMeta(ws1, 6, 'Dönem:',        data.raporTarihLabel || '—')
    setMeta(ws1, 7, 'Gün Sayısı:',   String(data.gunSayisi))
    setMeta(ws1, 8, 'Raporu Alan:',  data.raporuAlan  || '—')

    ws1.getRow(9).height = 8

    setHdr(ws1, 10, [
      { col: 1, text: 'METRİK', width: 22 },
      { col: 2, text: 'DEĞER',  width: 18 },
    ])
    const kpiRows: [string, string][] = [
      ['Hedef Frekans',  String(toplamHedef)],
      ['Tamamlanan',     String(data.toplamTamamlanan)],
      ['Ekstra (Frekans Dışı)', String(data.toplamEkstra ?? data.frekansDisiGorevler.length)],
      ['Gerçekleşen',    String(toplamGerceklesen)],
      ['Sapma',          String(data.toplamSapma)],
      ['Kayıp',          String(data.toplamKayip)],
      ['Başarı Oranı',   `%${data.genelBasari}`],
      ['Genel Oran',     `%${genelOran}`],
    ]
    kpiRows.forEach(([label, value], i) => {
      const r = ws1.getRow(11 + i)
      r.height = 18
      const c1 = r.getCell(1); c1.value = label; c1.font = { bold: true, size: 10 }
      const c2 = r.getCell(2); c2.value = value;  c2.font = { size: 10 }
      const fill = i % 2 === 0 ? EVEN_FILL : ODD_FILL
      c1.fill = fill; c2.fill = fill
    })

    // ── Sayfa 2: Grup Metrikleri ─────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Grup Metrikleri')
    setHdr(ws2, 1, [
      { col: 1,  text: 'SN',             width: 6  },
      { col: 2,  text: 'GRUP',           width: 28 },
      { col: 3,  text: 'ÜST LOKASYON',  width: 20 },
      { col: 4,  text: 'LOKASYON',       width: 22 },
      { col: 5,  text: 'VARDİYA FREKANS', width: 16 },
      { col: 6,  text: 'HEDEF',          width: 10 },
      { col: 7,  text: 'TAMAMLANAN',     width: 13 },
      { col: 8,  text: 'EKSTRA',         width: 10 },
      { col: 9,  text: 'SAPMA',          width: 10 },
      { col: 10, text: 'KAYIP',          width: 10 },
      { col: 11, text: 'BAŞARI',         width: 10 },
      { col: 12, text: 'GENEL ORAN',     width: 12 },
    ])

    if (data.grupMetrikleri.length > 0) {
      const tGunluk = data.grupMetrikleri.reduce((s, g) => s + g.gunlukFrekans, 0)
      const tHedef  = data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0)
      const tTam    = data.grupMetrikleri.reduce((s, g) => s + g.tamamlanan, 0)
      const tEks    = data.grupMetrikleri.reduce((s, g) => s + (g.ekstra ?? 0), 0)
      const tSap    = data.grupMetrikleri.reduce((s, g) => s + g.sapma, 0)
      const tKay    = data.grupMetrikleri.reduce((s, g) => s + g.kayip, 0)
      const tGer    = tTam + tEks
      const tBas    = tHedef > 0 ? Math.round(tGer / tHedef * 100) : 0
      const tGenel  = tHedef > 0 ? Math.round((tGer + tSap) / tHedef * 100) : 0
      const totFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD1FAE5' } }
      const totRow  = ws2.getRow(2)
      totRow.height = 20
      const totVals: any[] = ['—', 'TOPLAM', '—', '—', tGunluk, tHedef, tTam, tEks, tSap, tKay, `%${tBas}`, `%${tGenel}`]
      totVals.forEach((v, ci) => {
        const c = totRow.getCell(ci + 1)
        c.value = v; c.font = { bold: true, size: 10 }; c.fill = totFill
        c.alignment = { horizontal: ci < 3 ? 'left' : 'center' }
      })
    }

    data.grupMetrikleri.forEach((g, i) => {
      const r = ws2.getRow((data.grupMetrikleri.length > 0 ? 3 : 2) + i)
      r.height = 18
      const vals: any[] = [i + 1, g.grup, g.ustLokasyon, g.lokasyon, g.gunlukFrekans, g.hedef, g.tamamlanan, g.ekstra ?? 0, g.sapma, g.kayip, g.basariOrani, g.genelOran]
      vals.forEach((v, ci) => {
        const c = r.getCell(ci + 1)
        c.value = v; c.font = { size: 10 }
        c.fill  = i % 2 === 0 ? EVEN_FILL : ODD_FILL
        c.alignment = { horizontal: ci < 3 ? 'left' : 'center' }
      })
    })

    // ── Sayfa 3: Tamamlanan Frekanslar ───────────────────────────────────────
    const ws3 = wb.addWorksheet('Tamamlanan')
    setHdr(ws3, 1, [
      { col: 1, text: 'SN',            width: 6  },
      { col: 2, text: 'PERSONEL',      width: 22 },
      { col: 3, text: 'ÜST LOKASYON', width: 20 },
      { col: 4, text: 'LOKASYON',      width: 22 },
      { col: 5, text: 'GÖREV NO',      width: 14 },
      { col: 6, text: 'GÖREV TANIMI',  width: 32 },
      { col: 7, text: 'TARİH-SAAT',   width: 18 },
      { col: 8, text: 'DURUM',         width: 14 },
    ])
    data.tamamlananGorevler.forEach((t, i) => {
      const r = ws3.getRow(2 + i); r.height = 17
      const vals: any[] = [t.sn, t.personel, t.ustLokasyon, t.lokasyon, t.gorevNo, t.gorevTanimi, t.tarihSaat, t.durum]
      vals.forEach((v, ci) => { const c = r.getCell(ci + 1); c.value = v; c.font = { size: 10 }; c.fill = i % 2 === 0 ? EVEN_FILL : ODD_FILL })
    })

    // ── Sayfa 4: Sapmalar ────────────────────────────────────────────────────
    const ws4 = wb.addWorksheet('Sapmalar')
    setHdr(ws4, 1, [
      { col: 1, text: 'SN',            width: 6  },
      { col: 2, text: 'PERSONEL',      width: 22 },
      { col: 3, text: 'ÜST LOKASYON', width: 20 },
      { col: 4, text: 'LOKASYON',      width: 22 },
      { col: 5, text: 'GÖREV NO',      width: 14 },
      { col: 6, text: 'GÖREV TANIMI',  width: 32 },
      { col: 7, text: 'TARİH-SAAT',   width: 18 },
      { col: 8, text: 'SAPMA NEDENİ', width: 24 },
    ])
    data.sapmaGorevler.forEach((s, i) => {
      const r = ws4.getRow(2 + i); r.height = 17
      const vals: any[] = [s.sn, s.personel, s.ustLokasyon, s.lokasyon, s.gorevNo, s.gorevTanimi, s.tarihSaat, s.sapmaNedeni]
      vals.forEach((v, ci) => { const c = r.getCell(ci + 1); c.value = v; c.font = { size: 10 }; c.fill = i % 2 === 0 ? EVEN_FILL : ODD_FILL })
    })

    // ── Sayfa 5: Kayıp Frekanslar ────────────────────────────────────────────
    const ws5 = wb.addWorksheet('Kayıp Frekanslar')
    setHdr(ws5, 1, [
      { col: 1, text: 'SN',            width: 6  },
      { col: 2, text: 'ÜST LOKASYON', width: 20 },
      { col: 3, text: 'LOKASYON',      width: 22 },
      { col: 4, text: 'GÖREV NO',      width: 14 },
      { col: 5, text: 'GÖREV TANIMI',  width: 32 },
      { col: 6, text: 'TARİH',         width: 14 },
      { col: 7, text: 'PERSONEL',     width: 22 },
      { col: 8, text: 'DURUM',         width: 14 },
      { col: 9, text: 'KAYIP NEDENİ', width: 24 },
    ])
    data.kayipGorevler.forEach((k, i) => {
      const r = ws5.getRow(2 + i); r.height = 17
      // Tanımda "VARDIYA" geçmiyorsa, üretildiği vardiya no'yu suffix olarak ekle
      const tanim = (k.vardiyaNo && !/VARD[İI]YA/i.test(String(k.gorevTanimi ?? '')))
        ? `${k.gorevTanimi}  ·  V${k.vardiyaNo}`
        : k.gorevTanimi
      const vals: any[] = [k.sn, k.ustLokasyon, k.lokasyon, k.gorevNo, tanim, k.tarih, k.iptalEden ?? 'sistem', k.durum, k.kayipNedeni]
      vals.forEach((v, ci) => { const c = r.getCell(ci + 1); c.value = v; c.font = { size: 10 }; c.fill = i % 2 === 0 ? EVEN_FILL : ODD_FILL })
    })

    // ── Sayfa 6: Frekans Dışı ────────────────────────────────────────────────
    // Mobil v1.0.28+ ekstra görev akışı: baslat/tamamla → gerçek SÜRE + GEREKÇE.
    // Eski tek-POST kayıtlarda gerekçe boş, süre "Tek tık".
    const ws6 = wb.addWorksheet('Frekans Dışı')
    setHdr(ws6, 1, [
      { col: 1, text: 'SN',           width: 6  },
      { col: 2, text: 'ÜST LOKASYON', width: 20 },
      { col: 3, text: 'GRUP TANIMI',  width: 26 },
      { col: 4, text: 'LOKASYON',     width: 22 },
      { col: 5, text: 'GÖREV TANIMI', width: 26 },
      { col: 6, text: 'TARİH-SAAT',   width: 18 },
      { col: 7, text: 'SÜRE',         width: 14 },
      { col: 8, text: 'PERSONEL',     width: 22 },
      { col: 9, text: 'GEREKÇE',      width: 40 },
    ])
    data.frekansDisiGorevler.forEach((f, i) => {
      const r = ws6.getRow(2 + i); r.height = 17
      const vals: any[] = [
        f.sn, f.ustLokasyon, f.grupTanimi, f.lokasyonTanimi, f.aciklama,
        f.tarihSaat, f.gorevSuresi, f.personel, f.gerekce || '',
      ]
      vals.forEach((v, ci) => { const c = r.getCell(ci + 1); c.value = v; c.font = { size: 10 }; c.fill = i % 2 === 0 ? EVEN_FILL : ODD_FILL })
    })

    const buf  = await wb.xlsx.writeBuffer()
    const date = new Date().toISOString().slice(0, 10)
    return new NextResponse(buf as unknown as BodyInit, {
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
