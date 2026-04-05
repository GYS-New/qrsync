/**
 * POST /api/reports/rapor-gonder
 * Cron tetikli: zamanı gelen raporları oluşturup mail ile gönderir.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { buildGenelRaporData } from '@/lib/reports/genel-rapor-data'
import { fillXlsxTemplate, type SheetData, type CellData } from '@/lib/reports/xlsx-template-filler'
import { sendMail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function cn(col: string): number {
  let n = 0
  for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64)
  return n
}

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-cron-token')
  const envToken = process.env.CRON_SECRET
  if (!envToken || !token || token !== envToken)
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const admin = createAdminClient()
  const now = new Date()
  const results: any[] = []

  // Zamanı gelen aktif zamanlamaları bul
  const { data: zamanlamalar } = await admin
    .from('rapor_zamanlama')
    .select('*')
    .eq('aktif', true)
    .lte('sonraki_gonderim_tarihi', now.toISOString())
    .limit(20)

  for (const z of zamanlamalar ?? []) {
    try {
      // Rapor tarih aralığı — önceki dönem bazlı
      let baslangic: string, bitis: string
      if (z.tekrar_tipi === 'tek_sefer' && z.rapor_baslangic && z.rapor_bitis) {
        baslangic = z.rapor_baslangic
        bitis = z.rapor_bitis
      } else if (z.tekrar_tipi === 'gunluk') {
        // Önceki gün
        const oncekiGun = new Date(now.getTime() - 86400000)
        baslangic = oncekiGun.toISOString().slice(0, 10)
        bitis = baslangic
      } else if (z.tekrar_tipi === 'haftalik') {
        // Önceki hafta (Pazartesi-Pazar)
        const bugun = now.getDay() // 0=Pazar
        const pazartesiOffset = bugun === 0 ? 6 : bugun - 1
        const buPazartesi = new Date(now.getTime() - pazartesiOffset * 86400000)
        const oncekiPazar = new Date(buPazartesi.getTime() - 86400000)
        const oncekiPazartesi = new Date(oncekiPazar.getTime() - 6 * 86400000)
        baslangic = oncekiPazartesi.toISOString().slice(0, 10)
        bitis = oncekiPazar.toISOString().slice(0, 10)
      } else if (z.tekrar_tipi === 'aylik') {
        // Önceki ay (1. gün - son gün)
        const oncekiAy = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const oncekiAySon = new Date(now.getFullYear(), now.getMonth(), 0)
        baslangic = oncekiAy.toISOString().slice(0, 10)
        bitis = oncekiAySon.toISOString().slice(0, 10)
      } else {
        // Fallback: son 30 gün
        bitis = now.toISOString().slice(0, 10)
        baslangic = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)
      }

      // Kullanıcı adını çek
      const { data: olusturan } = await admin.from('users').select('isim_soyisim').eq('id', z.olusturan_id).single()

      // Rapor oluştur
      const data = await buildGenelRaporData({
        firmaId: z.firma_id,
        projeId: z.proje_id,
        ustLokasyonId: z.ust_lokasyon_id,
        raporBaslangic: baslangic,
        raporBitis: bitis,
        raporuAlan: (olusturan as any)?.isim_soyisim ?? 'Sistem',
      })

      // Proje adı
      let projeAdi = data.projeAdi
      if (!projeAdi && z.proje_id) {
        const { data: prj } = await admin.from('projeler').select('ad').eq('id', z.proje_id).single()
        projeAdi = prj?.ad ?? ''
      }

      // Şablonu doldur (basit — ana sayfalar)
      const sheets: SheetData[] = []

      // Giriş
      const girisC: CellData[] = []
      const c = (col: string, row: number, value: any) => girisC.push({ col: cn(col), row, value })
      c('E', 2, data.firmaAdi); c('E', 3, projeAdi)
      c('E', 4, data.ustLokTanim || 'Tümü'); c('E', 5, data.altLokTanim || 'Tümü')
      c('E', 6, data.raporTarihLabel); c('E', 7, data.gunSayisi); c('E', 8, data.raporuAlan)
      c('U', 12, data.toplamGorev); c('U', 13, data.toplamTamamlanan)
      c('U', 14, data.toplamTamamlanan + data.toplamSapma)
      c('U', 16, data.toplamSapma); c('U', 17, data.toplamKayip)
      c('U', 18, data.toplamGorev > 0 ? data.genelBasari / 100 : 0)
      c('U', 21, data.toplamGorev); c('U', 22, data.toplamSapma)
      c('U', 26, data.toplamGorev); c('U', 27, data.toplamKayip)

      // Birleşik gruplar
      const birlesik = new Map<string, any>()
      for (const gm of data.grupMetrikleri) {
        const m = birlesik.get(gm.grup)
        if (!m) birlesik.set(gm.grup, { ...gm })
        else { m.hedef += gm.hedef; m.tamamlanan += gm.tamamlanan; m.sapma += gm.sapma; m.kayip += gm.kayip }
      }
      let i = 0
      for (const gm of birlesik.values()) {
        const r = 12 + i++
        c('B', r, gm.grup); c('C', r, gm.hedef); c('D', r, gm.tamamlanan)
        c('E', r, gm.hedef > 0 ? Math.round(gm.tamamlanan / gm.hedef * 100) / 100 : 0)
        c('F', r, gm.sapma); c('G', r, gm.kayip)
        c('I', r, gm.hedef > 0 ? Math.round((gm.tamamlanan + gm.sapma) / gm.hedef * 100) / 100 : 0)
      }
      sheets.push({ sheetName: 'Giriş', cells: girisC })

      // Tamamlanan
      const tamC: CellData[] = [{ col: cn('C'), row: 3, value: data.tamamlananGorevler.length }]
      data.tamamlananGorevler.forEach((g, idx) => {
        const r = 4 + idx
        tamC.push({ col: cn('A'), row: r, value: idx + 1 }, { col: cn('B'), row: r, value: g.personel },
          { col: cn('C'), row: r, value: g.ustLokasyon }, { col: cn('D'), row: r, value: g.lokasyon },
          { col: cn('E'), row: r, value: g.gorevNo }, { col: cn('F'), row: r, value: g.gorevTanimi },
          { col: cn('I'), row: r, value: g.tarihSaat }, { col: cn('J'), row: r, value: g.durum })
      })
      sheets.push({ sheetName: 'Tamamlanan Frekanslar', cells: tamC, templateDataRow: 4, totalDataRows: data.tamamlananGorevler.length })

      // Sapmalar
      const sapC: CellData[] = [{ col: cn('C'), row: 3, value: data.sapmaGorevler.length }]
      data.sapmaGorevler.forEach((g, idx) => {
        const r = 4 + idx
        sapC.push({ col: cn('A'), row: r, value: idx + 1 }, { col: cn('B'), row: r, value: g.personel },
          { col: cn('C'), row: r, value: g.ustLokasyon }, { col: cn('D'), row: r, value: g.lokasyon },
          { col: cn('E'), row: r, value: g.gorevNo }, { col: cn('F'), row: r, value: g.gorevTanimi },
          { col: cn('I'), row: r, value: g.tarihSaat }, { col: cn('J'), row: r, value: g.sapmaNedeni })
      })
      sheets.push({ sheetName: 'Sapmalar', cells: sapC, templateDataRow: 4, totalDataRows: data.sapmaGorevler.length })

      // Kayıp
      const kayC: CellData[] = [{ col: cn('C'), row: 3, value: data.kayipGorevler.length }]
      data.kayipGorevler.forEach((g, idx) => {
        const r = 4 + idx
        kayC.push({ col: cn('A'), row: r, value: idx + 1 }, { col: cn('B'), row: r, value: g.ustLokasyon },
          { col: cn('C'), row: r, value: g.lokasyon }, { col: cn('D'), row: r, value: g.gorevNo },
          { col: cn('E'), row: r, value: g.gorevTanimi }, { col: cn('F'), row: r, value: g.tarihSaat },
          { col: cn('G'), row: r, value: g.durum }, { col: cn('H'), row: r, value: g.kayipNedeni })
      })
      sheets.push({ sheetName: 'Kayıp Frekanslar', cells: kayC, templateDataRow: 4, totalDataRows: data.kayipGorevler.length })

      // Gruplar
      const grpC: CellData[] = []
      data.grupMetrikleri.forEach((gm, idx) => {
        const r = 3 + idx
        grpC.push({ col: cn('A'), row: r, value: idx + 1 }, { col: cn('B'), row: r, value: gm.grup },
          { col: cn('C'), row: r, value: gm.ustLokasyon }, { col: cn('D'), row: r, value: gm.lokasyon },
          { col: cn('E'), row: r, value: gm.gunlukFrekans }, { col: cn('F'), row: r, value: gm.hedef },
          { col: cn('G'), row: r, value: gm.tamamlanan }, { col: cn('I'), row: r, value: gm.sapma },
          { col: cn('J'), row: r, value: gm.kayip },
          { col: cn('K'), row: r, value: gm.basariOrani }, { col: cn('L'), row: r, value: gm.genelOran })
      })
      sheets.push({ sheetName: 'Gruplar', cells: grpC, templateDataRow: 3, totalDataRows: data.grupMetrikleri.length })

      // Frekans Fazlası
      const fazC: CellData[] = []
      data.frekansDisiGorevler.forEach((g, idx) => {
        const r = 3 + idx
        fazC.push({ col: cn('A'), row: r, value: idx + 1 }, { col: cn('B'), row: r, value: g.ustLokasyon },
          { col: cn('C'), row: r, value: g.grupTanimi }, { col: cn('D'), row: r, value: g.lokasyonTanimi },
          { col: cn('E'), row: r, value: g.aciklama }, { col: cn('F'), row: r, value: g.personel },
          { col: cn('G'), row: r, value: g.tarihSaat })
      })
      sheets.push({ sheetName: 'Frekans Fazlası', cells: fazC, templateDataRow: 3, totalDataRows: data.frekansDisiGorevler.length })

      // Şablon doldur
      const { data: storageFile } = await admin.storage.from('templates').download('Genel_Rapor_Sablonu.xlsx')
      if (!storageFile) { results.push({ id: z.id, error: 'Şablon bulunamadı' }); continue }
      const templateBuf = Buffer.from(await storageFile.arrayBuffer())
      const excelBuf = await fillXlsxTemplate(templateBuf, sheets)

      // Mail gönder
      const konu = `QR-Sync Genel Rapor — ${data.firmaAdi}${projeAdi ? ' / ' + projeAdi : ''} (${data.raporTarihLabel})`
      const govde = [
        `Merhaba,`,
        ``,
        `${data.firmaAdi}${projeAdi ? ' - ' + projeAdi : ''} projesine ait Genel Rapor ekte sunulmuştur.`,
        ``,
        `Rapor Tarihi: ${data.raporTarihLabel}`,
        `Toplam Görev: ${data.toplamGorev}`,
        `Tamamlanan: ${data.toplamTamamlanan}`,
        `Sapma: ${data.toplamSapma}`,
        `Kayıp: ${data.toplamKayip}`,
        `Başarı Oranı: %${data.genelBasari}`,
        z.aciklama ? `\nAçıklama: ${z.aciklama}` : '',
        ``,
        `Bu rapor QR-Sync sistemi tarafından otomatik oluşturulmuştur.`,
      ].filter(Boolean).join('\n')

      for (const email of z.alici_emails) {
        await sendMail({
          to: email,
          subject: konu,
          text: govde,
          attachments: [{
            filename: `Genel_Rapor_${baslangic}_${bitis}.xlsx`,
            content: excelBuf,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }],
        })
      }

      // Sonraki gönderim tarihini güncelle
      let sonraki: string | null = null
      if (z.tekrar_tipi === 'gunluk') {
        const d = new Date(z.sonraki_gonderim_tarihi)
        d.setDate(d.getDate() + 1)
        sonraki = d.toISOString()
      } else if (z.tekrar_tipi === 'haftalik') {
        const d = new Date(z.sonraki_gonderim_tarihi)
        d.setDate(d.getDate() + 7)
        sonraki = d.toISOString()
      } else if (z.tekrar_tipi === 'aylik') {
        const d = new Date(z.sonraki_gonderim_tarihi)
        d.setMonth(d.getMonth() + 1)
        sonraki = d.toISOString()
      }

      await admin.from('rapor_zamanlama').update({
        son_gonderim_tarihi: now.toISOString(),
        sonraki_gonderim_tarihi: sonraki,
        aktif: z.tekrar_tipi !== 'tek_sefer', // tek sefer = gönderince pasif
        guncelleme_tarihi: now.toISOString(),
      }).eq('id', z.id)

      results.push({ id: z.id, ok: true, emails: z.alici_emails.length })
    } catch (e: any) {
      results.push({ id: z.id, error: e.message })
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}
