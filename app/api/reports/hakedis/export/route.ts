import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  // Aynı parametreler — data API ile aynı mantık
  const p = req.nextUrl.searchParams
  const firmaId   = p.get('firma_id')
  const projeId   = p.get('proje_id')
  const baslangic = p.get('baslangic')
  const bitis     = p.get('bitis')
  const grupIdF   = p.get('grup_id')
  const lokIdF    = p.get('lokasyon_id')

  if (!firmaId || !projeId) return NextResponse.json({ error: 'firma_id ve proje_id zorunlu' }, { status: 400 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (!isSA && me.firma_id !== firmaId) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  // Data çek (hakedis route ile aynı mantık — yeniden kullan)
  const dataRes = await fetch(
    `${req.nextUrl.origin}/api/reports/hakedis?firma_id=${firmaId}&proje_id=${projeId}${baslangic ? `&baslangic=${baslangic}` : ''}${bitis ? `&bitis=${bitis}` : ''}${grupIdF ? `&grup_id=${grupIdF}` : ''}${lokIdF ? `&lokasyon_id=${lokIdF}` : ''}`,
    { headers: { cookie: req.headers.get('cookie') ?? '' } }
  )
  const json = await dataRes.json()
  if (!json.ok) return NextResponse.json({ error: json.error }, { status: 500 })

  const rows: any[] = json.rows ?? []
  const ozet: any  = json.ozet ?? {}

  // ExcelJS
  const wb = new ExcelJS.Workbook()
  wb.creator = 'QRSync'
  wb.created = new Date()

  const ws = wb.addWorksheet('Hakediş Raporu')

  // Başlık
  ws.mergeCells('A1:L1')
  const titleCell = ws.getCell('A1')
  titleCell.value = 'HAKEDİŞ RAPORU'
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF0F1A0F' } }
  titleCell.alignment = { horizontal: 'center' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }

  ws.mergeCells('A2:L2')
  const subtitleCell = ws.getCell('A2')
  subtitleCell.value = `Tarih: ${baslangic ?? '—'} / ${bitis ?? '—'}${grupIdF ? ` | Grup filtreli` : ''}${lokIdF ? ` | Lokasyon filtreli` : ''}`
  subtitleCell.font = { size: 10, color: { argb: 'FF506050' } }
  subtitleCell.alignment = { horizontal: 'center' }

  ws.addRow([])

  // Kolon başlıkları
  const headers = [
    'Lokasyon', 'Üst Lokasyon', 'Grup', 'Birim Fiyat', 'Para Birimi', 'Fiyat Türü',
    'Toplam Görev', 'Tamamlanan', 'Gecikmeli', 'Kayıp', 'Aktif',
    'Toplam Hakediş', 'Tamamlanan Hakediş', 'Gecikmeli Hakediş', 'Kayıp Hakediş',
  ]
  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6B1F' } }
    cell.alignment = { horizontal: 'center' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0D0B0' } } }
  })

  // Satırlar
  for (const r of rows) {
    const row = ws.addRow([
      r.lokasyon_tanim,
      r.ust_tanim ?? '—',
      r.grup_adi ?? '—',
      r.birim_fiyat,
      r.para_birimi,
      r.fiyat_turu === 'grup' ? 'Grup' : 'Lokasyon',
      r.toplam,
      r.tamamlanan,
      r.gecikmeli,
      r.kayip,
      r.aktif_gorev,
      r.toplam_hakedis,
      r.tamamlanan_hakedis,
      r.gecikmeli_hakedis,
      r.kayip_hakedis,
    ])
    row.getCell(4).numFmt  = '#,##0.00'
    row.getCell(12).numFmt = '#,##0.00'
    row.getCell(13).numFmt = '#,##0.00'
    row.getCell(14).numFmt = '#,##0.00'
    row.getCell(15).numFmt = '#,##0.00'
  }

  // Özet satırı
  ws.addRow([])
  const ozetRow = ws.addRow([
    'TOPLAM', '', '', '', '', '',
    rows.reduce((s, r) => s + r.toplam, 0),
    rows.reduce((s, r) => s + r.tamamlanan, 0),
    rows.reduce((s, r) => s + r.gecikmeli, 0),
    rows.reduce((s, r) => s + r.kayip, 0),
    rows.reduce((s, r) => s + r.aktif_gorev, 0),
    ozet.toplam_hakedis,
    ozet.tamamlanan_hakedis,
    ozet.gecikmeli_hakedis,
    ozet.kayip_hakedis,
  ])
  ozetRow.eachCell(cell => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF6EA' } }
  })
  ozetRow.getCell(12).numFmt = '#,##0.00'
  ozetRow.getCell(13).numFmt = '#,##0.00'
  ozetRow.getCell(14).numFmt = '#,##0.00'
  ozetRow.getCell(15).numFmt = '#,##0.00'

  // Kolon genişlikleri
  ws.columns = [
    { width: 28 }, { width: 20 }, { width: 20 }, { width: 12 }, { width: 10 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 10 },
    { width: 18 }, { width: 20 }, { width: 20 }, { width: 16 },
  ]

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as Buffer, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename=hakedis_raporu_${Date.now()}.xlsx`,
    },
  })
}
