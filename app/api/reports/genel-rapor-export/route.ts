/**
 * GET /api/reports/genel-rapor-export
 * Genel Rapor şablonunu JSZip ile açıp verileri doldurup döndürür.
 * Grafikler, çizimler, stiller birebir korunur.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buildGenelRaporData } from '@/lib/reports/genel-rapor-data'
import { fillXlsxTemplate, type SheetData, type CellData } from '@/lib/reports/xlsx-template-filler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Sütun harfi → sayı: A=1, B=2, ..., Z=26, AA=27
function cn(col: string): number {
  let n = 0
  for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64)
  return n
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id,isim_soyisim').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const p = req.nextUrl.searchParams
  const firmaId   = isSA ? (p.get('firmaId') ?? me.firma_id) : me.firma_id
  const projeId   = p.get('projeId')   ?? null
  const ustLokId  = p.get('ustLokasyonId') ?? null
  const altLokId  = p.get('altLokasyonId') ?? null
  const baslangic = p.get('baslangic') ?? null
  const bitis     = p.get('bitis')     ?? null

  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  const admin = createAdminClient()

  // ── 1. Rapor verisini topla ───────────────────────────────────────────
  const data = await buildGenelRaporData({
    firmaId, projeId, ustLokasyonId: ustLokId, altLokasyonId: altLokId,
    raporBaslangic: baslangic, raporBitis: bitis,
    raporuAlan: me.isim_soyisim ?? 'Yönetim',
  })

  // ── 2. Proje adı ─────────────────────────────────────────────────────
  let projeAdi = data.projeAdi
  if (!projeAdi && projeId) {
    const { data: prj } = await admin.from('projeler').select('ad').eq('id', projeId).single()
    projeAdi = prj?.ad ?? ''
  }

  // ── 3. Lokasyon hedef süreleri + günlük frekans sayıları ──────────────
  let lokQ = admin.from('lokasyonlar').select('id,tanim,hedef_sure_dakika,gunluk_frekans_sayisi').eq('firma_id', firmaId)
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
  const { data: lokSureList } = await lokQ
  const lokHedefMap = new Map<string, number>()
  const lokFrekansMap = new Map<string, number>()       // id → frekans
  const lokTanimToFrekans = new Map<string, number>()   // tanim → frekans (gruplar için)
  for (const l of lokSureList ?? []) {
    if ((l as any).hedef_sure_dakika) lokHedefMap.set(l.id, (l as any).hedef_sure_dakika)
    const frek = (l as any).gunluk_frekans_sayisi ?? 1
    lokFrekansMap.set(l.id, frek)
    lokTanimToFrekans.set((l as any).tanim ?? '', frek)
  }

  // ── 4. Görev süre verileri ────────────────────────────────────────────
  const SEL_SURE = 'id,lokasyon_id,tamamlanma_suresi_saniye'
  let sureLiveQ = admin.from('canli_gorevler').select(SEL_SURE).eq('firma_id', firmaId).eq('durum', 'TAMAMLANDI')
  let sureArsivQ = admin.from('canli_gorevler_arsiv').select(SEL_SURE).eq('firma_id', firmaId).eq('durum', 'TAMAMLANDI')
  if (projeId) { sureLiveQ = (sureLiveQ as any).eq('proje_id', projeId); sureArsivQ = (sureArsivQ as any).eq('proje_id', projeId) }
  if (baslangic) { const v = new Date(baslangic + 'T00:00:00+03:00').toISOString(); sureLiveQ = sureLiveQ.gte('aktif_olma_tarihi', v); sureArsivQ = sureArsivQ.gte('aktif_olma_tarihi', v) }
  if (bitis) { const v = new Date(bitis + 'T23:59:59+03:00').toISOString(); sureLiveQ = sureLiveQ.lte('aktif_olma_tarihi', v); sureArsivQ = sureArsivQ.lte('aktif_olma_tarihi', v) }
  const [{ data: sureLive }, { data: sureArsiv }] = await Promise.all([sureLiveQ, sureArsivQ])

  const sureMap = new Map<string, number>()
  const gorevLokMap2 = new Map<string, string>()
  for (const g of [...(sureLive ?? []), ...(sureArsiv ?? [])]) {
    if (g.tamamlanma_suresi_saniye) {
      sureMap.set(g.id, g.tamamlanma_suresi_saniye)
      sureMap.set(g.id.slice(-8).toUpperCase(), g.tamamlanma_suresi_saniye)
    }
    if (g.lokasyon_id) {
      gorevLokMap2.set(g.id, g.lokasyon_id)
      gorevLokMap2.set(g.id.slice(-8).toUpperCase(), g.lokasyon_id)
    }
  }

  // Süre toplam
  let toplamHedefDk = 0, toplamGercekDk = 0
  for (const [gId, sureSn] of sureMap) {
    if (gId.length <= 8) continue // short key duplicate'ı atla
    toplamGercekDk += Math.round(sureSn / 60)
    const lokId = gorevLokMap2.get(gId)
    if (lokId && lokHedefMap.has(lokId)) toplamHedefDk += lokHedefMap.get(lokId)!
  }

  // ── 5. Hakediş verileri ───────────────────────────────────────────────
  let hakedisRows: { grup: string; hedef: number; birimFiyat: number; toplam: number; kayipF: number; kayipH: number; fazla: number; gerceklesen: number }[] = []
  if (projeId) {
    const [fiyatRes, grupRes] = await Promise.all([
      admin.from('birim_fiyatlar').select('lokasyon_id,grup_id,fiyat').eq('proje_id', projeId),
      admin.from('lokasyon_gruplari').select('id,ad').eq('proje_id', projeId).eq('firma_id', firmaId),
    ])
    const grupMap = new Map((grupRes.data ?? []).map((g: any) => [g.id, g.ad]))
    const grupFiyat = new Map<string, number>()
    for (const f of fiyatRes.data ?? []) {
      if (f.grup_id && f.fiyat > 0) grupFiyat.set(f.grup_id, f.fiyat)
    }
    // Grup metrikleri üzerinden hakediş
    const grupBirlesik = new Map<string, { hedef: number; kayip: number; fazla: number }>()
    for (const gm of data.grupMetrikleri) {
      const m = grupBirlesik.get(gm.grup) ?? { hedef: 0, kayip: 0, fazla: 0 }
      m.hedef += gm.hedef; m.kayip += gm.kayip
      const f = gm.tamamlanan + gm.sapma - gm.hedef
      m.fazla += f > 0 ? f : 0
      grupBirlesik.set(gm.grup, m)
    }
    for (const [grupAd, m] of grupBirlesik) {
      const grupId = Array.from(grupMap.entries()).find(([, ad]) => ad === grupAd)?.[0]
      const birimFiyat = grupId ? (grupFiyat.get(grupId) ?? 0) : 0
      const toplam = m.hedef * birimFiyat
      const kayipH = m.kayip * birimFiyat
      hakedisRows.push({
        grup: grupAd, hedef: m.hedef, birimFiyat, toplam,
        kayipF: m.kayip, kayipH, fazla: m.fazla,
        gerceklesen: toplam - kayipH,
      })
    }
  }

  // ── 6. Grup metrikleri birleştirme (üst lokasyon seçildiğinde) ────────
  // Aynı isimli grupları birleştir + lokasyon frekanslarını topla
  const birlesikGruplar = new Map<string, typeof data.grupMetrikleri[0] & { lokFrekansTop: number }>()
  for (const gm of data.grupMetrikleri) {
    const lokFrek = lokTanimToFrekans.get(gm.lokasyon) ?? gm.gunlukFrekans ?? 1
    const m = birlesikGruplar.get(gm.grup)
    if (!m) {
      birlesikGruplar.set(gm.grup, { ...gm, lokFrekansTop: lokFrek })
    } else {
      m.hedef += gm.hedef; m.tamamlanan += gm.tamamlanan; m.sapma += gm.sapma
      m.kayip += gm.kayip; m.lokFrekansTop += lokFrek
      m.basariOrani = `%${m.hedef > 0 ? Math.round(m.tamamlanan / m.hedef * 100) : 0}`
      m.genelOran = `%${m.hedef > 0 ? Math.round((m.tamamlanan + m.sapma) / m.hedef * 100) : 0}`
    }
  }
  const mergedGruplar = Array.from(birlesikGruplar.values())

  // ── 7. Frekans fazlası hesabı ─────────────────────────────────────────
  const fazlaTop = mergedGruplar.reduce((s, g) => {
    const f = g.tamamlanan + g.sapma - g.hedef
    return s + (f > 0 ? f : 0)
  }, 0)

  // ═══ ŞABLON DOLDURMA ═══════════════════════════════════════════════════
  const sheets: SheetData[] = []

  // ── GİRİŞ SAYFASI ─────────────────────────────────────────────────────
  const girisC: CellData[] = []
  const c = (col: string, row: number, value: CellData['value']) => girisC.push({ col: cn(col), row, value })

  // Parametreler (E sütunu — merged cell sol üstü)
  c('E', 2, data.firmaAdi)
  c('E', 3, projeAdi)
  c('E', 4, data.ustLokTanim || 'Tümü')
  c('E', 5, data.altLokTanim || 'Tümü')
  c('E', 6, data.raporTarihLabel)
  c('E', 7, data.gunSayisi)
  c('E', 8, data.raporuAlan)

  // Grup Frekans Göstergeleri (B-I, satır 12'den)
  for (let i = 0; i < mergedGruplar.length; i++) {
    const gm = mergedGruplar[i], r = 12 + i
    c('B', r, gm.grup)
    c('C', r, gm.hedef)
    c('D', r, gm.tamamlanan)
    c('E', r, gm.hedef > 0 ? Math.round(gm.tamamlanan / gm.hedef * 100) / 100 : 0) // oran
    c('F', r, gm.sapma)
    c('G', r, gm.kayip)
    const gF = gm.tamamlanan + gm.sapma - gm.hedef
    c('H', r, gF > 0 ? gF : 0)
    c('I', r, gm.hedef > 0 ? Math.round((gm.tamamlanan + gm.sapma) / gm.hedef * 100) / 100 : 0)
  }

  // Hakediş Faktörleri (K-R, satır 12'den)
  for (let i = 0; i < hakedisRows.length; i++) {
    const h = hakedisRows[i], r = 12 + i
    c('K', r, h.grup); c('L', r, h.hedef); c('M', r, h.birimFiyat)
    c('N', r, h.toplam); c('O', r, h.kayipF); c('P', r, h.kayipH)
    c('Q', r, h.fazla); c('R', r, h.gerceklesen)
  }

  // Frekans Göstergeleri (U sütunu, satır 12-18) — chart1 bağlı
  c('U', 12, data.toplamGorev)
  c('U', 13, data.toplamTamamlanan)
  c('U', 14, data.toplamTamamlanan + data.toplamSapma)
  c('U', 15, fazlaTop)
  c('U', 16, data.toplamSapma)
  c('U', 17, data.toplamKayip)
  c('U', 18, data.toplamGorev > 0 ? Math.round(data.genelBasari) / 100 : 0)

  // Frekans Sapmaları (U, satır 21-23) — chart2 bağlı
  c('U', 21, data.toplamGorev)
  c('U', 22, data.toplamSapma)
  c('U', 23, data.toplamGorev > 0 ? Math.round(data.toplamSapma / data.toplamGorev * 100) / 100 : 0)

  // Kayıp Frekans (U, satır 26-28) — chart3 bağlı
  c('U', 26, data.toplamGorev)
  c('U', 27, data.toplamKayip)
  c('U', 28, data.toplamGorev > 0 ? Math.round(data.toplamKayip / data.toplamGorev * 100) / 100 : 0)

  // Süre Analizi (X, satır 26-28) — chart4+5 bağlı
  c('X', 26, toplamHedefDk)
  c('X', 27, toplamGercekDk)
  c('X', 28, toplamGercekDk - toplamHedefDk)

  sheets.push({ sheetName: 'Giriş', cells: girisC })

  // ── TAMAMLANAN FREKANSLAR ─────────────────────────────────────────────
  const tamC: CellData[] = []
  tamC.push({ col: cn('C'), row: 3, value: data.tamamlananGorevler.length })
  for (let i = 0; i < data.tamamlananGorevler.length; i++) {
    const g = data.tamamlananGorevler[i], r = 4 + i
    tamC.push({ col: cn('A'), row: r, value: i + 1 })
    tamC.push({ col: cn('B'), row: r, value: g.personel })
    tamC.push({ col: cn('C'), row: r, value: g.ustLokasyon })
    tamC.push({ col: cn('D'), row: r, value: g.lokasyon })
    tamC.push({ col: cn('E'), row: r, value: g.gorevNo })
    tamC.push({ col: cn('F'), row: r, value: g.gorevTanimi })
    // Hedef süre DK
    const lokId = gorevLokMap2.get(g.gorevNo) ?? ''
    const hedefDk = lokId ? (lokHedefMap.get(lokId) ?? null) : null
    tamC.push({ col: cn('G'), row: r, value: hedefDk })
    // Tamamlanan süre DK
    const sureSn = sureMap.get(g.gorevNo) ?? null
    tamC.push({ col: cn('H'), row: r, value: sureSn ? Math.round(sureSn / 60) : null })
    tamC.push({ col: cn('I'), row: r, value: g.tarihSaat })
    tamC.push({ col: cn('J'), row: r, value: g.durum })
  }
  sheets.push({ sheetName: 'Tamamlanan Frekanslar', cells: tamC, templateDataRow: 4, totalDataRows: data.tamamlananGorevler.length })

  // ── SAPMALAR ──────────────────────────────────────────────────────────
  const sapC: CellData[] = []
  sapC.push({ col: cn('C'), row: 3, value: data.sapmaGorevler.length })
  for (let i = 0; i < data.sapmaGorevler.length; i++) {
    const g = data.sapmaGorevler[i], r = 4 + i
    sapC.push({ col: cn('A'), row: r, value: i + 1 })
    sapC.push({ col: cn('B'), row: r, value: g.personel })
    sapC.push({ col: cn('C'), row: r, value: g.ustLokasyon })
    sapC.push({ col: cn('D'), row: r, value: g.lokasyon })
    sapC.push({ col: cn('E'), row: r, value: g.gorevNo })
    sapC.push({ col: cn('F'), row: r, value: g.gorevTanimi })
    const lokIdS = gorevLokMap2.get(g.gorevNo) ?? ''
    sapC.push({ col: cn('G'), row: r, value: lokIdS ? (lokHedefMap.get(lokIdS) ?? null) : null })
    const sureSn2 = sureMap.get(g.gorevNo) ?? null
    sapC.push({ col: cn('H'), row: r, value: sureSn2 ? Math.round(sureSn2 / 60) : null })
    sapC.push({ col: cn('I'), row: r, value: g.tarihSaat })
    sapC.push({ col: cn('J'), row: r, value: g.sapmaNedeni })
  }
  sheets.push({ sheetName: 'Sapmalar', cells: sapC, templateDataRow: 4, totalDataRows: data.sapmaGorevler.length })

  // ── KAYIP FREKANSLAR (A=SN, B=ÜST LOKASYON, C=LOKASYON, D=GÖREV NO, E=GÖREV TANIMI, F=TARİH-SAAT, G=DURUM, H=KAYIP NEDENİ)
  const kayC: CellData[] = []
  kayC.push({ col: cn('C'), row: 3, value: data.kayipGorevler.length })
  for (let i = 0; i < data.kayipGorevler.length; i++) {
    const g = data.kayipGorevler[i], r = 4 + i
    kayC.push({ col: cn('A'), row: r, value: i + 1 })
    kayC.push({ col: cn('B'), row: r, value: g.ustLokasyon })
    kayC.push({ col: cn('C'), row: r, value: g.lokasyon })
    kayC.push({ col: cn('D'), row: r, value: g.gorevNo })
    kayC.push({ col: cn('E'), row: r, value: g.gorevTanimi })
    kayC.push({ col: cn('F'), row: r, value: g.tarihSaat })
    kayC.push({ col: cn('G'), row: r, value: g.durum })
    kayC.push({ col: cn('H'), row: r, value: g.kayipNedeni })
  }
  sheets.push({ sheetName: 'Kayıp Frekanslar', cells: kayC, templateDataRow: 4, totalDataRows: data.kayipGorevler.length })

  // ── GRUPLAR ───────────────────────────────────────────────────────────
  const grpC: CellData[] = []
  // Toplamlar satırı (R2) — sayısal değerler doğrudan yazalım
  let topE = 0, topF = 0, topG = 0, topH = 0, topI = 0, topJ = 0
  for (let i = 0; i < data.grupMetrikleri.length; i++) {
    const gm = data.grupMetrikleri[i], r = 3 + i
    grpC.push({ col: cn('A'), row: r, value: i + 1 })
    grpC.push({ col: cn('B'), row: r, value: gm.grup })
    grpC.push({ col: cn('C'), row: r, value: gm.ustLokasyon })
    grpC.push({ col: cn('D'), row: r, value: gm.lokasyon })
    // Günlük frekans: lokasyon tablosundaki gunluk_frekans_sayisi (Sistem Ayarları'ndan)
    const lokFrekans = lokTanimToFrekans.get(gm.lokasyon) ?? gm.gunlukFrekans ?? 1
    grpC.push({ col: cn('E'), row: r, value: lokFrekans })
    // Hedef frekans = o satırdaki lokasyon için üretilen toplam görev sayısı
    grpC.push({ col: cn('F'), row: r, value: gm.hedef })
    grpC.push({ col: cn('G'), row: r, value: gm.tamamlanan })
    const gFaz = gm.tamamlanan + gm.sapma - gm.hedef
    grpC.push({ col: cn('H'), row: r, value: gFaz > 0 ? gFaz : 0 })
    grpC.push({ col: cn('I'), row: r, value: gm.sapma })
    grpC.push({ col: cn('J'), row: r, value: gm.kayip })
    // Başarılı İşlem Oranı = Tamamlanan/Hedef (yüzde)
    const basariOran = gm.hedef > 0 ? Math.round(gm.tamamlanan / gm.hedef * 100) : 0
    grpC.push({ col: cn('K'), row: r, value: `%${basariOran}` })
    // Genel Oran = (Tamamlanan+Sapma)/Hedef
    const genelOran = gm.hedef > 0 ? Math.round((gm.tamamlanan + gm.sapma) / gm.hedef * 100) : 0
    grpC.push({ col: cn('L'), row: r, value: `%${genelOran}` })

    topE += lokFrekans; topF += gm.hedef; topG += gm.tamamlanan
    topH += gFaz > 0 ? gFaz : 0; topI += gm.sapma; topJ += gm.kayip
  }
  // Toplamlar
  grpC.push({ col: cn('E'), row: 2, value: topE })
  grpC.push({ col: cn('F'), row: 2, value: topF })
  grpC.push({ col: cn('G'), row: 2, value: topG })
  grpC.push({ col: cn('H'), row: 2, value: topH })
  grpC.push({ col: cn('I'), row: 2, value: topI })
  grpC.push({ col: cn('J'), row: 2, value: topJ })
  grpC.push({ col: cn('K'), row: 2, value: topF > 0 ? `%${Math.round(topG / topF * 100)}` : '%0' })
  grpC.push({ col: cn('L'), row: 2, value: topF > 0 ? `%${Math.round((topG + topI) / topF * 100)}` : '%0' })

  sheets.push({ sheetName: 'Gruplar', cells: grpC, templateDataRow: 3, totalDataRows: data.grupMetrikleri.length })

  // ── FREKANS FAZLASI ───────────────────────────────────────────────────
  const fazC: CellData[] = []
  for (let i = 0; i < data.frekansDisiGorevler.length; i++) {
    const g = data.frekansDisiGorevler[i], r = 3 + i
    fazC.push({ col: cn('A'), row: r, value: i + 1 })
    fazC.push({ col: cn('B'), row: r, value: g.ustLokasyon })
    fazC.push({ col: cn('C'), row: r, value: g.grupTanimi })
    fazC.push({ col: cn('D'), row: r, value: g.lokasyonTanimi })
    fazC.push({ col: cn('E'), row: r, value: g.aciklama })
    fazC.push({ col: cn('F'), row: r, value: g.personel })
    fazC.push({ col: cn('G'), row: r, value: g.tarihSaat })
  }
  sheets.push({ sheetName: 'Frekans Fazlası', cells: fazC, templateDataRow: 3, totalDataRows: data.frekansDisiGorevler.length })

  // ── Şablonu aç, doldur, döndür ────────────────────────────────────────
  const { data: storageFile } = await admin.storage.from('templates').download('Genel_Rapor_Sablonu.xlsx')
  let templateBuf: Buffer
  if (storageFile) {
    templateBuf = Buffer.from(await storageFile.arrayBuffer())
  } else {
    const fs = await import('fs/promises')
    const path = await import('path')
    templateBuf = await fs.readFile(path.join(process.cwd(), 'public', 'templates', 'Genel_Rapor_Sablonu.xlsx'))
  }

  const outBuf = await fillXlsxTemplate(templateBuf, sheets)

  return new NextResponse(outBuf as unknown as BodyInit, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename=Genel_Rapor_${Date.now()}.xlsx`,
    },
  })
}
