/**
 * GET /api/reports/genel-rapor-export
 * Genel Rapor şablonunu (Genel_Rapor_Sablonu.xlsx) import edip
 * verilerle doldurup Excel olarak döndürür.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buildGenelRaporData } from '@/lib/reports/genel-rapor-data'
import ExcelJS from 'exceljs'
import path from 'path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function fmtSure(sn: number | null | undefined): string {
  if (!sn || sn <= 0) return '—'
  const h = Math.floor(sn / 3600), m = Math.floor((sn % 3600) / 60)
  if (h > 0) return `${h}s ${m}dk`
  if (m > 0) return `${m}dk`
  return `${sn % 60}sn`
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

  // ── 1. Rapor verisini topla ───────────────────────────────────────────
  const data = await buildGenelRaporData({
    firmaId,
    projeId,
    ustLokasyonId: ustLokId,
    altLokasyonId: altLokId,
    raporBaslangic: baslangic,
    raporBitis: bitis,
    raporuAlan: me.isim_soyisim ?? 'Yönetim',
  })

  // ── 2. Hakediş verisi ─────────────────────────────────────────────────
  const admin = createAdminClient()
  let hakedisRows: any[] = []
  if (projeId) {
    const [lokRes, fiyatRes, grupRes] = await Promise.all([
      admin.from('lokasyonlar').select('id,tanim,parent_id').eq('firma_id', firmaId).eq('proje_id', projeId),
      admin.from('birim_fiyatlar').select('lokasyon_id,grup_id,fiyat,para_birimi').eq('proje_id', projeId),
      admin.from('lokasyon_gruplari').select('id,ad').eq('proje_id', projeId).eq('firma_id', firmaId),
    ])
    const loks = lokRes.data ?? []
    const fiyatlar = fiyatRes.data ?? []
    const gruplar = grupRes.data ?? []
    const grupIds = gruplar.map((g: any) => g.id)
    const { data: grupUyeleri } = grupIds.length > 0
      ? await admin.from('lokasyon_grup_uyeleri').select('grup_id,lokasyon_id').in('grup_id', grupIds)
      : { data: [] }

    const grupMap = new Map(gruplar.map((g: any) => [g.id, g.ad]))
    const lokGrupMap = new Map<string, string>()
    for (const u of grupUyeleri ?? []) {
      lokGrupMap.set(u.lokasyon_id, u.grup_id)
    }

    // grup frekans göstergeleri verisinden hakediş hesapla
    for (const gm of data.grupMetrikleri) {
      // Gruba ait birim fiyatı bul
      const grupId = Array.from(grupMap.entries()).find(([, ad]) => ad === gm.grup)?.[0]
      let birimFiyat = 0
      if (grupId) {
        const gf = fiyatlar.find((f: any) => f.grup_id === grupId && f.fiyat > 0)
        if (gf) birimFiyat = gf.fiyat
      }
      const toplamHakedis = gm.hedef * birimFiyat
      const kayipHakedis = gm.kayip * birimFiyat
      const fazlaHakedis = 0 // frekans fazlası hakediş hesabı
      hakedisRows.push({
        grup: gm.grup,
        hedefFrekans: gm.hedef,
        birimFiyat,
        toplamHakedis,
        kayipFrekans: gm.kayip,
        kayipHakedis,
        frekFazlasi: 0,
        gerceklesenHakedis: toplamHakedis - kayipHakedis + fazlaHakedis,
      })
    }
  }

  // ── 3. Süre analizi ───────────────────────────────────────────────────
  // Hedef süre ve tamamlanan süre map'i
  let lokHedefMap = new Map<string, number>()
  if (firmaId) {
    let lq = admin.from('lokasyonlar').select('id,hedef_sure_dakika').eq('firma_id', firmaId)
    if (projeId) lq = (lq as any).eq('proje_id', projeId)
    const { data: loks } = await lq
    for (const l of loks ?? []) {
      if ((l as any).hedef_sure_dakika) lokHedefMap.set(l.id, (l as any).hedef_sure_dakika * 60)
    }
  }

  // ── 4. Şablonu aç ve doldur ──────────────────────────────────────────
  const templatePath = path.join(process.cwd(), 'public', 'templates', 'Genel_Rapor_Sablonu.xlsx')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(templatePath)

  // ── SAYFA: Giriş ─────────────────────────────────────────────────────
  const wsGiris = wb.getWorksheet('Giriş')
  if (wsGiris) {
    // Parametreler (E sütunu = değerler)
    wsGiris.getCell('E2').value = data.firmaAdi
    wsGiris.getCell('E3').value = data.projeAdi
    wsGiris.getCell('E4').value = data.ustLokTanim || 'Tümü'
    wsGiris.getCell('E5').value = data.altLokTanim || 'Tümü'
    wsGiris.getCell('E6').value = data.raporTarihLabel
    wsGiris.getCell('E7').value = data.gunSayisi
    wsGiris.getCell('E8').value = data.raporuAlan

    // Frekans Göstergeleri (sütun U = değerler, satır 12-18)
    wsGiris.getCell('U12').value = data.toplamGorev
    wsGiris.getCell('U13').value = data.toplamTamamlanan
    wsGiris.getCell('U14').value = data.toplamTamamlanan + data.toplamSapma // gerçekleşen
    const fazla = data.grupMetrikleri.reduce((s, g) => {
      const f = g.tamamlanan + g.sapma - g.hedef
      return s + (f > 0 ? f : 0)
    }, 0)
    wsGiris.getCell('U15').value = fazla
    wsGiris.getCell('U16').value = data.toplamSapma
    wsGiris.getCell('U17').value = data.toplamKayip
    wsGiris.getCell('U18').value = data.toplamGorev > 0 ? `%${data.genelBasari}` : '%0'

    // Frekans Sapmaları (satır 21-23)
    wsGiris.getCell('U21').value = data.toplamGorev
    wsGiris.getCell('U22').value = data.toplamSapma
    wsGiris.getCell('U23').value = data.toplamGorev > 0 ? `%${Math.round((data.toplamSapma / data.toplamGorev) * 100)}` : '%0'

    // Kayıp Frekans Göstergeleri (satır 26-28)
    wsGiris.getCell('U26').value = data.toplamGorev
    wsGiris.getCell('U27').value = data.toplamKayip
    wsGiris.getCell('U28').value = data.toplamGorev > 0 ? `%${Math.round((data.toplamKayip / data.toplamGorev) * 100)}` : '%0'

    // Süre Analizi (sütun Y, satır 26-28)
    let toplamHedefSure = 0, toplamGercekSure = 0
    for (const g of data.tamamlananGorevler) {
      // hedef süre ve tamamlanan süre hesabı aşağıda detay sayfalarına yazılırken kullanılıyor
    }
    // Toplam süre analizi sonra doldurulacak (detay satırlarından)

    // Grup Frekans Göstergeleri tablosu (satır 12'den itibaren, B-I sütunları)
    const grupStartRow = 12
    for (let i = 0; i < data.grupMetrikleri.length; i++) {
      const gm = data.grupMetrikleri[i]
      const r = grupStartRow + i
      // Yeterli satır yoksa ekle (şablonda 5 boş satır var, daha fazlası için)
      wsGiris.getCell(`B${r}`).value = gm.grup
      wsGiris.getCell(`C${r}`).value = gm.hedef
      wsGiris.getCell(`D${r}`).value = gm.tamamlanan
      wsGiris.getCell(`E${r}`).value = gm.hedef > 0 ? `%${Math.round((gm.tamamlanan / gm.hedef) * 100)}` : '%0'
      wsGiris.getCell(`F${r}`).value = gm.sapma
      wsGiris.getCell(`G${r}`).value = gm.kayip
      const gFazla = gm.tamamlanan + gm.sapma - gm.hedef
      wsGiris.getCell(`H${r}`).value = gFazla > 0 ? gFazla : 0
      wsGiris.getCell(`I${r}`).value = gm.genelOran
    }

    // Hakediş Faktörleri tablosu (satır 12'den itibaren, K-R sütunları)
    for (let i = 0; i < hakedisRows.length; i++) {
      const h = hakedisRows[i]
      const r = grupStartRow + i
      wsGiris.getCell(`K${r}`).value = h.grup
      wsGiris.getCell(`L${r}`).value = h.hedefFrekans
      wsGiris.getCell(`M${r}`).value = h.birimFiyat
      wsGiris.getCell(`N${r}`).value = h.toplamHakedis
      wsGiris.getCell(`O${r}`).value = h.kayipFrekans
      wsGiris.getCell(`P${r}`).value = h.kayipHakedis
      wsGiris.getCell(`Q${r}`).value = h.frekFazlasi
      wsGiris.getCell(`R${r}`).value = h.gerceklesenHakedis
    }
  }

  // ── SAYFA: Tamamlanan Frekanslar ──────────────────────────────────────
  const wsTam = wb.getWorksheet('Tamamlanan Frekanslar')
  if (wsTam) {
    // R3 = toplam sayısı
    wsTam.getCell('C3').value = data.tamamlananGorevler.length

    // Satır 4'ten itibaren veri — şablondaki boş satırları doldur
    for (let i = 0; i < data.tamamlananGorevler.length; i++) {
      const g = data.tamamlananGorevler[i]
      const r = 4 + i
      wsTam.getCell(`A${r}`).value = i + 1
      wsTam.getCell(`B${r}`).value = g.personel
      wsTam.getCell(`C${r}`).value = g.ustLokasyon
      wsTam.getCell(`D${r}`).value = g.lokasyon
      wsTam.getCell(`E${r}`).value = g.gorevNo
      wsTam.getCell(`F${r}`).value = g.gorevTanimi
      // Hedef süre ve tamamlanan süre (lokasyon hedef_sure_dakika'dan)
      // Not: buildGenelRaporData şu an süre bilgisi döndürmüyor, lokHedefMap kullanacağız
      wsTam.getCell(`G${r}`).value = '' // hedef süre — sonra doldurulacak
      wsTam.getCell(`H${r}`).value = '' // tamamlanan süre
      wsTam.getCell(`I${r}`).value = g.tarihSaat
      wsTam.getCell(`J${r}`).value = g.durum
    }
  }

  // ── SAYFA: Sapmalar ───────────────────────────────────────────────────
  const wsSapma = wb.getWorksheet('Sapmalar')
  if (wsSapma) {
    wsSapma.getCell('C3').value = data.sapmaGorevler.length

    for (let i = 0; i < data.sapmaGorevler.length; i++) {
      const g = data.sapmaGorevler[i]
      const r = 4 + i
      wsSapma.getCell(`A${r}`).value = i + 1
      wsSapma.getCell(`B${r}`).value = g.personel
      wsSapma.getCell(`C${r}`).value = g.ustLokasyon
      wsSapma.getCell(`D${r}`).value = g.lokasyon
      wsSapma.getCell(`E${r}`).value = g.gorevNo
      wsSapma.getCell(`F${r}`).value = g.gorevTanimi
      wsSapma.getCell(`G${r}`).value = '' // hedef süre
      wsSapma.getCell(`H${r}`).value = '' // tamamlanan süre
      wsSapma.getCell(`I${r}`).value = g.tarihSaat
      wsSapma.getCell(`J${r}`).value = g.sapmaNedeni
    }
  }

  // ── SAYFA: Kayıp Frekanslar ───────────────────────────────────────────
  const wsKayip = wb.getWorksheet('Kayıp Frekanslar')
  if (wsKayip) {
    wsKayip.getCell('C3').value = data.kayipGorevler.length

    for (let i = 0; i < data.kayipGorevler.length; i++) {
      const g = data.kayipGorevler[i]
      const r = 4 + i
      wsKayip.getCell(`A${r}`).value = i + 1
      wsKayip.getCell(`B${r}`).value = g.lokasyon
      wsKayip.getCell(`C${r}`).value = g.gorevNo
      wsKayip.getCell(`D${r}`).value = g.gorevTanimi
      wsKayip.getCell(`E${r}`).value = g.tarihSaat
      wsKayip.getCell(`F${r}`).value = g.durum
      wsKayip.getCell(`G${r}`).value = g.kayipNedeni
    }
  }

  // ── SAYFA: Gruplar ────────────────────────────────────────────────────
  const wsGrup = wb.getWorksheet('Gruplar')
  if (wsGrup) {
    // Toplamlar satırı (R2) — formüller şablonda var, SUM range'i güncelle
    const dataCount = data.grupMetrikleri.length
    const lastDataRow = 2 + dataCount

    for (let i = 0; i < data.grupMetrikleri.length; i++) {
      const gm = data.grupMetrikleri[i]
      const r = 3 + i // veri satır 3'ten başlıyor
      wsGrup.getCell(`A${r}`).value = i + 1
      wsGrup.getCell(`B${r}`).value = gm.grup
      wsGrup.getCell(`C${r}`).value = gm.ustLokasyon
      wsGrup.getCell(`D${r}`).value = gm.lokasyon
      wsGrup.getCell(`E${r}`).value = gm.gunlukFrekans
      wsGrup.getCell(`F${r}`).value = gm.hedef
      wsGrup.getCell(`G${r}`).value = gm.tamamlanan
      const gFazla = gm.tamamlanan + gm.sapma - gm.hedef
      wsGrup.getCell(`H${r}`).value = gFazla > 0 ? gFazla : 0
      wsGrup.getCell(`I${r}`).value = gm.sapma
      wsGrup.getCell(`J${r}`).value = gm.kayip
      wsGrup.getCell(`K${r}`).value = gm.basariOrani
      wsGrup.getCell(`L${r}`).value = gm.genelOran
    }

    // Toplamlar satırı formüllerini güncelle (R2)
    if (dataCount > 0) {
      wsGrup.getCell('E2').value = { formula: `SUM(E3:E${lastDataRow})` }
      wsGrup.getCell('F2').value = { formula: `SUM(F3:F${lastDataRow})` }
      wsGrup.getCell('G2').value = { formula: `SUM(G3:G${lastDataRow})` }
      wsGrup.getCell('I2').value = { formula: `SUM(I3:I${lastDataRow})` }
      wsGrup.getCell('J2').value = { formula: `F2-(G2+I2)` }
    }
  }

  // ── SAYFA: Frekans Fazlası ────────────────────────────────────────────
  const wsFazla = wb.getWorksheet('Frekans Fazlası')
  if (wsFazla) {
    for (let i = 0; i < data.frekansDisiGorevler.length; i++) {
      const g = data.frekansDisiGorevler[i]
      const r = 3 + i
      wsFazla.getCell(`A${r}`).value = i + 1
      wsFazla.getCell(`B${r}`).value = g.ustLokasyon
      wsFazla.getCell(`C${r}`).value = g.grupTanimi
      wsFazla.getCell(`D${r}`).value = g.lokasyonTanimi
      wsFazla.getCell(`E${r}`).value = g.aciklama // görev tanımı
      wsFazla.getCell(`F${r}`).value = g.personel
      wsFazla.getCell(`G${r}`).value = g.tarihSaat
    }
  }

  // ── Buffer olarak döndür ──────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer()
  const fileName = `Genel_Rapor_${Date.now()}.xlsx`
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename=${fileName}`,
    },
  })
}
