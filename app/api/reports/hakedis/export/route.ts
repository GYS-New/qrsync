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

  const admin = createAdminClient()

  const [lokRes, fiyatRes, grupRes] = await Promise.all([
    admin.from('lokasyonlar').select('id,tanim,parent_id').eq('proje_id', projeId).eq('firma_id', firmaId),
    admin.from('birim_fiyatlar').select('lokasyon_id,grup_id,fiyat,para_birimi').eq('proje_id', projeId),
    admin.from('lokasyon_gruplari').select('id,ad').eq('proje_id', projeId).eq('firma_id', firmaId),
  ])

  const lokasyonlar   = lokRes.data   ?? []
  const birimFiyatlar = fiyatRes.data ?? []
  const gruplar       = grupRes.data  ?? []

  const grupIds = gruplar.map((g: any) => g.id)
  const { data: grupUyeleri } = grupIds.length > 0
    ? await admin.from('lokasyon_grup_uyeleri').select('grup_id,lokasyon_id').in('grup_id', grupIds)
    : { data: [] }

  const lokMap   = new Map(lokasyonlar.map((l: any) => [l.id, l]))
  const grupMap  = new Map(gruplar.map((g: any) => [g.id, g.ad]))

  const lokGrupMap  = new Map<string, string[]>()
  const grupLokMap  = new Map<string, string[]>()
  for (const u of grupUyeleri ?? []) {
    const a1 = lokGrupMap.get(u.lokasyon_id) ?? []; a1.push(u.grup_id); lokGrupMap.set(u.lokasyon_id, a1)
    const a2 = grupLokMap.get(u.grup_id)     ?? []; a2.push(u.lokasyon_id); grupLokMap.set(u.grup_id, a2)
  }

  const lokFiyatMap  = new Map<string, { fiyat: number; para_birimi: string }>()
  const grupFiyatMap = new Map<string, { fiyat: number; para_birimi: string }>()
  for (const f of birimFiyatlar) {
    if (f.lokasyon_id && f.fiyat > 0) lokFiyatMap.set(f.lokasyon_id, { fiyat: f.fiyat, para_birimi: f.para_birimi })
    if (f.grup_id     && f.fiyat > 0) grupFiyatMap.set(f.grup_id,    { fiyat: f.fiyat, para_birimi: f.para_birimi })
  }

  type EF = { fiyat: number; para_birimi: string; turu: 'lokasyon' | 'grup'; grup_id?: string }
  const efektifMap = new Map<string, EF>()
  for (const l of lokasyonlar) {
    if (lokFiyatMap.has(l.id)) {
      efektifMap.set(l.id, { ...lokFiyatMap.get(l.id)!, turu: 'lokasyon' })
    } else {
      for (const gid of lokGrupMap.get(l.id) ?? []) {
        if (grupFiyatMap.has(gid)) { efektifMap.set(l.id, { ...grupFiyatMap.get(gid)!, turu: 'grup', grup_id: gid }); break }
      }
    }
  }

  let filteredLoks = lokasyonlar.filter((l: any) => efektifMap.has(l.id))
  if (grupIdF) { const s = new Set(grupLokMap.get(grupIdF) ?? []); filteredLoks = filteredLoks.filter((l: any) => s.has(l.id)) }
  if (lokIdF)  filteredLoks = filteredLoks.filter((l: any) => l.id === lokIdF)

  const lokIds = filteredLoks.map((l: any) => l.id)

  let rows: any[] = []
  let ozet = { toplam_hakedis: 0, tamamlanan_hakedis: 0, gecikmeli_hakedis: 0, kayip_hakedis: 0, toplam_gorev: 0 }

  if (lokIds.length > 0) {
    const buildQ = (table: string) => {
      let q = admin.from(table).select('lokasyon_id,durum')
        .eq('firma_id', firmaId).eq('proje_id', projeId).in('lokasyon_id', lokIds)
      if (baslangic) q = (q as any).gte('aktif_olma_tarihi', baslangic)
      if (bitis)     q = (q as any).lte('aktif_olma_tarihi', bitis + 'T23:59:59.999Z')
      return q
    }
    const [{ data: aktif }, { data: arsiv }] = await Promise.all([buildQ('canli_gorevler'), buildQ('canli_gorevler_arsiv')])

    type Counts = { toplam: number; tamamlanan: number; gecikmeli: number; kayip: number; aktif_gorev: number }
    const countMap = new Map<string, Counts>()
    for (const g of [...(aktif ?? []), ...(arsiv ?? [])]) {
      if (!g.lokasyon_id) continue
      const c = countMap.get(g.lokasyon_id) ?? { toplam: 0, tamamlanan: 0, gecikmeli: 0, kayip: 0, aktif_gorev: 0 }
      c.toplam++
      if (g.durum === 'TAMAMLANDI') c.tamamlanan++
      else if (g.durum === 'ZAMANINDA_YAPILAMAYAN') c.gecikmeli++
      else if (['IPTAL', 'SILINDI', 'BEKLEMEDE', 'ZAMANI_GECMIS'].includes(g.durum)) c.kayip++
      else c.aktif_gorev++
      countMap.set(g.lokasyon_id, c)
    }

    rows = filteredLoks
      .filter((l: any) => (countMap.get(l.id)?.toplam ?? 0) > 0)
      .map((l: any) => {
        const ef = efektifMap.get(l.id)!
        const c  = countMap.get(l.id) ?? { toplam: 0, tamamlanan: 0, gecikmeli: 0, kayip: 0, aktif_gorev: 0 }
        const ust = l.parent_id ? (lokMap.get(l.parent_id) as any)?.tanim ?? null : null
        const gid = ef.grup_id ?? lokGrupMap.get(l.id)?.[0]
        return {
          lokasyon_tanim: l.tanim, ust_tanim: ust,
          grup_adi: gid ? (grupMap.get(gid) ?? null) : null,
          birim_fiyat: ef.fiyat, para_birimi: ef.para_birimi,
          fiyat_turu: ef.turu,
          toplam: c.toplam, tamamlanan: c.tamamlanan, gecikmeli: c.gecikmeli, kayip: c.kayip, aktif_gorev: c.aktif_gorev,
          tamamlanan_hakedis: c.tamamlanan * ef.fiyat,
          gecikmeli_hakedis:  c.gecikmeli  * ef.fiyat,
          kayip_hakedis:      c.kayip      * ef.fiyat,
          toplam_hakedis:     c.toplam     * ef.fiyat,
        }
      })
      .sort((a: any, b: any) => (a.ust_tanim ?? a.lokasyon_tanim).localeCompare(b.ust_tanim ?? b.lokasyon_tanim, 'tr'))

    ozet = rows.reduce((acc: any, r: any) => ({
      toplam_hakedis:     acc.toplam_hakedis     + r.toplam_hakedis,
      tamamlanan_hakedis: acc.tamamlanan_hakedis + r.tamamlanan_hakedis,
      gecikmeli_hakedis:  acc.gecikmeli_hakedis  + r.gecikmeli_hakedis,
      kayip_hakedis:      acc.kayip_hakedis      + r.kayip_hakedis,
      toplam_gorev:       acc.toplam_gorev       + r.toplam,
    }), ozet)
  }

  // ── Excel ────────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'QRSync'
  wb.created = new Date()
  const ws = wb.addWorksheet('Hakediş Raporu')

  ws.mergeCells('A1:O1')
  const t = ws.getCell('A1')
  t.value = 'HAKEDİŞ RAPORU'
  t.font = { bold: true, size: 14, color: { argb: 'FF0F1A0F' } }
  t.alignment = { horizontal: 'center' }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }

  ws.mergeCells('A2:O2')
  const s = ws.getCell('A2')
  s.value = `Tarih: ${baslangic ?? '—'} / ${bitis ?? '—'}${grupIdF ? ' | Grup filtreli' : ''}${lokIdF ? ' | Lokasyon filtreli' : ''}`
  s.font = { size: 10, color: { argb: 'FF506050' } }
  s.alignment = { horizontal: 'center' }

  ws.addRow([])

  const headers = [
    'Lokasyon', 'Üst Lokasyon', 'Grup', 'Birim Fiyat', 'Para Birimi', 'Fiyat Türü',
    'Toplam Görev', 'Tamamlanan', 'Gecikmeli', 'Kayıp', 'Aktif',
    'Toplam Hakediş', 'Tamamlanan Hakediş', 'Gecikmeli Hakediş', 'Kayıp Hakediş',
  ]
  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6B1F' } }
    cell.alignment = { horizontal: 'center' }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0D0B0' } } }
  })

  const money = '#,##0.00'
  for (const r of rows) {
    const row = ws.addRow([
      r.lokasyon_tanim, r.ust_tanim ?? '—', r.grup_adi ?? '—',
      r.birim_fiyat, r.para_birimi, r.fiyat_turu === 'grup' ? 'Grup' : 'Lokasyon',
      r.toplam, r.tamamlanan, r.gecikmeli, r.kayip, r.aktif_gorev,
      r.toplam_hakedis, r.tamamlanan_hakedis, r.gecikmeli_hakedis, r.kayip_hakedis,
    ])
    ;[4, 12, 13, 14, 15].forEach(i => { row.getCell(i).numFmt = money })
  }

  ws.addRow([])
  const ozetRow = ws.addRow([
    'TOPLAM', '', '', '', '', '',
    rows.reduce((s, r) => s + r.toplam, 0),
    rows.reduce((s, r) => s + r.tamamlanan, 0),
    rows.reduce((s, r) => s + r.gecikmeli, 0),
    rows.reduce((s, r) => s + r.kayip, 0),
    rows.reduce((s, r) => s + r.aktif_gorev, 0),
    ozet.toplam_hakedis, ozet.tamamlanan_hakedis, ozet.gecikmeli_hakedis, ozet.kayip_hakedis,
  ])
  ozetRow.eachCell(cell => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF6EA' } }
  })
  ;[12, 13, 14, 15].forEach(i => { ozetRow.getCell(i).numFmt = money })

  ws.columns = [
    { width: 28 }, { width: 20 }, { width: 20 }, { width: 12 }, { width: 10 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 10 }, { width: 10 },
    { width: 18 }, { width: 20 }, { width: 20 }, { width: 16 },
  ]

  const buf = await wb.xlsx.writeBuffer()
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename=hakedis_raporu_${Date.now()}.xlsx`,
    },
  })
}
