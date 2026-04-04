/**
 * GET /api/reports/sure-analiz/export
 * Süre analiz verilerini Excel olarak döndürür.
 * ?tip=frekansiyel|spesifik &firmaId=... &projeId=... &baslangic=... &bitis=...
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function withinRange(v: string | null | undefined, from?: string | null, to?: string | null) {
  if (!v) return false
  const t = new Date(v).getTime()
  if (isNaN(t)) return false
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false
  if (to   && t > new Date(`${to}T23:59:59.999`).getTime()) return false
  return true
}

function fmtS(sn: number | null | undefined): string {
  if (!sn || sn <= 0) return '—'
  const h = Math.floor(sn / 3600), m = Math.floor((sn % 3600) / 60), s = sn % 60
  if (h > 0) return `${h}s ${m}dk`
  if (m > 0) return `${m}dk ${s}sn`
  return `${s}sn`
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin', 'musteri', 'tenant_user'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const p = req.nextUrl.searchParams
  const tip       = p.get('tip') ?? 'frekansiyel'
  const firmaId   = isSA ? p.get('firmaId') : me.firma_id
  const projeId   = p.get('projeId')   ?? null
  const baslangic = p.get('baslangic') ?? null
  const bitis     = p.get('bitis')     ?? null

  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  const admin = createAdminClient()

  // Lokasyon ve kullanıcı
  let loksQ = admin.from('lokasyonlar').select('id,tanim,parent_id,hedef_sure_dakika').eq('firma_id', firmaId)
  if (projeId) loksQ = (loksQ as any).eq('proje_id', projeId)
  const [{ data: loks }, { data: users }] = await Promise.all([
    loksQ,
    admin.from('users').select('id,isim_soyisim').eq('firma_id', firmaId),
  ])

  const lokNodeMap = new Map<string, { tanim: string; parent_id: string | null }>()
  for (const l of loks ?? []) lokNodeMap.set(l.id, { tanim: l.tanim ?? '', parent_id: l.parent_id ?? null })
  function lokFullPath(id: string): string {
    const parts: string[] = []
    let cur: string | null = id
    while (cur) { const n = lokNodeMap.get(cur); if (!n) break; parts.unshift(n.tanim); cur = n.parent_id }
    return parts.join(' > ') || '—'
  }

  const lokMap   = new Map<string, string>((loks ?? []).map((l: any) => [l.id, lokFullPath(l.id)]))
  const hedefMap = new Map<string, number | null>((loks ?? []).map((l: any) => [l.id, l.hedef_sure_dakika ?? null]))
  const userMap  = new Map<string, string>((users ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

  // Görevleri çek
  let gorevler: any[] = []
  if (tip === 'frekansiyel') {
    const SEL = 'id,firma_id,lokasyon_id,tanim,durum,olusturma_tarihi,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,atanan_kullanici_id,tamamlayan_kullanici_id,islemi_yapan_id,aktif_olma_tarihi'
    let qA = admin.from('canli_gorevler').select(SEL).eq('firma_id', firmaId)
    let qB = admin.from('canli_gorevler_arsiv').select(SEL).eq('firma_id', firmaId)
    if (projeId) { qA = (qA as any).eq('proje_id', projeId); qB = (qB as any).eq('proje_id', projeId) }
    const [{ data: a }, { data: b }] = await Promise.all([qA, qB])
    const m = new Map<string, any>()
    for (const r of (b ?? [])) m.set(r.id, r)
    for (const r of (a ?? [])) m.set(r.id, r)
    gorevler = Array.from(m.values())
  } else {
    const SEL = 'id,firma_id,lokasyon_id,tanim,durum,olusturma_tarihi,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,atanan_kullanici_id,islemi_yapan_id'
    let q = admin.from('gorevler').select(SEL).eq('firma_id', firmaId)
    if (projeId) q = (q as any).eq('proje_id', projeId)
    const { data } = await q
    gorevler = data ?? []
  }

  // Tarih filtresi
  gorevler = gorevler.filter(g =>
    !baslangic && !bitis ? true : withinRange(g.tamamlanma_tarihi ?? g.olusturma_tarihi, baslangic, bitis)
  )

  // ── Hesaplamalar ──────────────────────────────────────────────────────────
  const tamamlananlar = gorevler.filter(g => g.durum === 'TAMAMLANDI' && g.tamamlanma_suresi_saniye > 0)
  const sureler = tamamlananlar.map(g => g.tamamlanma_suresi_saniye as number).sort((a, b) => a - b)
  const ort = sureler.length > 0 ? Math.round(sureler.reduce((a, b) => a + b, 0) / sureler.length) : 0
  const p50 = percentile(sureler, 50)
  const p75 = percentile(sureler, 75)
  const p90 = percentile(sureler, 90)
  const p95 = percentile(sureler, 95)
  const minS = sureler[0] ?? 0
  const maxS = sureler[sureler.length - 1] ?? 0

  // Bekleme süresi
  const beklemeList = tamamlananlar.map(g => {
    const ref = g.baslatilma_tarihi ?? g.tamamlanma_tarihi
    if (!ref || !g.olusturma_tarihi) return null
    const ms = new Date(ref).getTime() - new Date(g.olusturma_tarihi).getTime()
    return ms > 0 ? Math.round(ms / 1000) : null
  }).filter((v): v is number => v !== null)
  const ortBekleme = beklemeList.length > 0 ? Math.round(beklemeList.reduce((a, b) => a + b, 0) / beklemeList.length) : 0

  // Lokasyon analizi
  const lokGrup: Record<string, number[]> = {}
  for (const g of gorevler) {
    if (g.durum !== 'TAMAMLANDI' || !g.tamamlanma_suresi_saniye || !g.lokasyon_id) continue
    if (!lokGrup[g.lokasyon_id]) lokGrup[g.lokasyon_id] = []
    lokGrup[g.lokasyon_id].push(g.tamamlanma_suresi_saniye)
  }
  const lokRows = Object.entries(lokGrup).map(([lid, vals]) => {
    const sorted = [...vals].sort((a, b) => a - b)
    const ortS = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    const hdk = hedefMap.get(lid) ?? null
    const hedefSn = hdk != null ? hdk * 60 : null
    const fark = hedefSn != null ? ortS - hedefSn : null
    const farkPct = hedefSn != null && hedefSn > 0 ? Math.round(((ortS - hedefSn) / hedefSn) * 100) : null
    return {
      lokasyon: lokMap.get(lid) ?? '—', adet: vals.length,
      hedef_sure: hedefSn, ort_sure: ortS, min_sure: sorted[0], max_sure: sorted[sorted.length - 1],
      fark, farkPct,
      durum: fark == null ? '—' : fark > 0 ? 'Aşım' : 'Uygun',
    }
  }).sort((a, b) => b.adet - a.adet)

  // Personel analizi
  const perGrup: Record<string, { sureler: number[]; hedefler: number[] }> = {}
  for (const g of gorevler) {
    const uid = g.tamamlayan_kullanici_id ?? g.islemi_yapan_id ?? g.atanan_kullanici_id
    if (g.durum !== 'TAMAMLANDI' || !g.tamamlanma_suresi_saniye || !uid) continue
    if (!perGrup[uid]) perGrup[uid] = { sureler: [], hedefler: [] }
    perGrup[uid].sureler.push(g.tamamlanma_suresi_saniye)
    const hdk = g.lokasyon_id ? hedefMap.get(g.lokasyon_id) : null
    if (hdk != null) perGrup[uid].hedefler.push(hdk * 60)
  }
  const perRows = Object.entries(perGrup).map(([uid, { sureler: s, hedefler: h }]) => {
    const sorted = [...s].sort((a, b) => a - b)
    const ortS = Math.round(s.reduce((a, b) => a + b, 0) / s.length)
    const ortH = h.length > 0 ? Math.round(h.reduce((a, b) => a + b, 0) / h.length) : null
    const fark = ortH != null ? ortS - ortH : null
    const farkPct = ortH != null && ortH > 0 ? Math.round(((ortS - ortH) / ortH) * 100) : null
    return {
      personel: userMap.get(uid) ?? '—', tamamlanan: s.length,
      hedef_sure: ortH, ort_sure: ortS, en_hizli: sorted[0], en_yavas: sorted[sorted.length - 1],
      fark, farkPct,
      durum: fark == null ? '—' : fark > 0 ? 'Aşım' : 'Uygun',
    }
  }).sort((a, b) => b.tamamlanan - a.tamamlanan)

  // Görev analizi (tanim + lokasyon bazında)
  const gorevGrup: Record<string, number[]> = {}
  const gorevLokIdMap: Record<string, string> = {}
  for (const g of gorevler) {
    if (g.durum !== 'TAMAMLANDI' || !g.tamamlanma_suresi_saniye || !g.tanim) continue
    const key = `${g.tanim}|||${g.lokasyon_id ?? ''}`
    if (!gorevGrup[key]) gorevGrup[key] = []
    gorevGrup[key].push(g.tamamlanma_suresi_saniye)
    if (g.lokasyon_id) gorevLokIdMap[key] = g.lokasyon_id
  }
  const gorevRows = Object.entries(gorevGrup).map(([key, vals]) => {
    const [tanim] = key.split('|||')
    const lid = gorevLokIdMap[key] ?? ''
    const sorted = [...vals].sort((a, b) => a - b)
    const ortS = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    const hdk = lid ? hedefMap.get(lid) ?? null : null
    const hedefSn = hdk != null ? hdk * 60 : null
    const fark = hedefSn != null ? ortS - hedefSn : null
    const farkPct = hedefSn != null && hedefSn > 0 ? Math.round(((ortS - hedefSn) / hedefSn) * 100) : null
    return {
      tanim, lokasyon: lid ? lokMap.get(lid) ?? '—' : '—',
      adet: vals.length, ort_sure: ortS, min_sure: sorted[0], max_sure: sorted[sorted.length - 1],
      hedef_sure: hedefSn, fark, farkPct,
      durum: fark == null ? '—' : fark > 0 ? 'Aşım' : 'Uygun',
    }
  }).sort((a, b) => b.adet - a.adet)

  // ── Excel oluştur ─────────────────────────────────────────────────────────
  const tipLabel = tip === 'frekansiyel' ? 'Frekansiyel Görevler' : 'Spesifik Görevler'
  const wb = new ExcelJS.Workbook()
  wb.creator = 'QRSync'
  wb.created = new Date()

  const hdrFill: ExcelJS.Fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6B1F' } }
  const hdrFont: Partial<ExcelJS.Font>   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  const titleFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }
  const titleFont: Partial<ExcelJS.Font> = { bold: true, size: 14, color: { argb: 'FF0F1A0F' } }
  const subFont: Partial<ExcelJS.Font>   = { size: 10, color: { argb: 'FF506050' } }
  const ozetFill: ExcelJS.Fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF6EA' } }

  function addTitle(ws: ExcelJS.Worksheet, title: string, colCount: number) {
    ws.mergeCells(1, 1, 1, colCount)
    const c1 = ws.getCell('A1')
    c1.value = `SÜRE ANALİZ — ${tipLabel.toUpperCase()}`
    c1.font = titleFont; c1.fill = titleFill; c1.alignment = { horizontal: 'center' }

    ws.mergeCells(2, 1, 2, colCount)
    const c2 = ws.getCell('A2')
    c2.value = `${title} | Tarih: ${baslangic ?? '—'} / ${bitis ?? '—'}`
    c2.font = subFont; c2.alignment = { horizontal: 'center' }
    ws.addRow([])
  }

  function addHeaders(ws: ExcelJS.Worksheet, headers: string[]) {
    const row = ws.addRow(headers)
    row.eachCell(cell => {
      cell.font = hdrFont; cell.fill = hdrFill
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0D0B0' } } }
    })
  }

  // ── Sayfa 1: Özet ─────────────────────────────────────────────────────────
  const wsOzet = wb.addWorksheet('Özet')
  addTitle(wsOzet, 'Özet Bilgiler', 4)

  addHeaders(wsOzet, ['METRIK', 'DEĞER', 'AÇIKLAMA', ''])

  const basariOrani = gorevler.length > 0 ? Math.round((tamamlananlar.length / gorevler.length) * 100) : 0
  const ozetData = [
    ['Toplam Görev',      gorevler.length,        '',                                ''],
    ['Tamamlanan Görev',  tamamlananlar.length,    `%${basariOrani} başarı oranı`,    ''],
    ['Ort. Tamamlanma',   fmtS(ort),              '',                                ''],
    ['En Hızlı',          fmtS(minS),             '',                                ''],
    ['En Yavaş',          fmtS(maxS),             '',                                ''],
    ['Medyan (P50)',       fmtS(p50),              'Görevlerin yarısı bu sürenin altında', ''],
    ['P75',               fmtS(p75),              '',                                ''],
    ['P90',               fmtS(p90),              'Görevlerin %90\'ı bu sürenin altında', ''],
    ['P95',               fmtS(p95),              '',                                ''],
    ['Ort. Bekleme Süresi', fmtS(ortBekleme),     'Oluşturma → Başlama',             ''],
  ]
  for (const row of ozetData) {
    const r = wsOzet.addRow(row)
    r.getCell(1).font = { bold: true }
  }

  // Dağılım bölümü
  wsOzet.addRow([])
  const dgRow = wsOzet.addRow(['SÜRE DAĞILIMI', '', '', ''])
  dgRow.getCell(1).font = { bold: true, size: 12 }
  dgRow.getCell(1).fill = ozetFill

  const kovalar = [
    { label: '< 5 dk', min: 0, max: 300 }, { label: '5-15 dk', min: 300, max: 900 },
    { label: '15-30 dk', min: 900, max: 1800 }, { label: '30-60 dk', min: 1800, max: 3600 },
    { label: '1-2 sa', min: 3600, max: 7200 }, { label: '2-4 sa', min: 7200, max: 14400 },
    { label: '4-8 sa', min: 14400, max: 28800 }, { label: '> 8 sa', min: 28800, max: Infinity },
  ]
  addHeaders(wsOzet, ['ARALIK', 'ADET', '', ''])
  for (const k of kovalar) {
    const adet = tamamlananlar.filter(g => g.tamamlanma_suresi_saniye >= k.min && g.tamamlanma_suresi_saniye < k.max).length
    wsOzet.addRow([k.label, adet, '', ''])
  }

  wsOzet.columns = [{ width: 24 }, { width: 20 }, { width: 36 }, { width: 10 }]

  // ── Sayfa 2: Lokasyon Bazlı ───────────────────────────────────────────────
  const wsLok = wb.addWorksheet('Lokasyon Bazlı')
  const hasLokHedef = lokRows.some(r => r.hedef_sure != null)
  const lokHeaders = hasLokHedef
    ? ['LOKASYON', 'ADET', 'HEDEF SÜRE', 'ORT. SÜRE', 'FARK', 'FARK %', 'DURUM', 'EN HIZLI', 'EN YAVAŞ']
    : ['LOKASYON', 'ADET', 'ORT. SÜRE', 'EN HIZLI', 'EN YAVAŞ']
  addTitle(wsLok, 'Lokasyon Bazlı Analiz', lokHeaders.length)
  addHeaders(wsLok, lokHeaders)

  for (const r of lokRows) {
    if (hasLokHedef) {
      const farkLabel = r.fark == null ? '—' : r.fark > 0 ? `+${fmtS(r.fark)}` : r.fark < 0 ? `-${fmtS(Math.abs(r.fark))}` : '0'
      const farkPctLabel = r.farkPct == null ? '—' : r.farkPct > 0 ? `+%${r.farkPct}` : `%${r.farkPct}`
      const row = wsLok.addRow([r.lokasyon, r.adet, r.hedef_sure != null ? fmtS(r.hedef_sure) : '—', fmtS(r.ort_sure), farkLabel, farkPctLabel, r.durum, fmtS(r.min_sure), fmtS(r.max_sure)])
      // Renklendirme
      const durumCell = row.getCell(7)
      if (r.durum === 'Aşım') durumCell.font = { bold: true, color: { argb: 'FFDC2626' } }
      else if (r.durum === 'Uygun') durumCell.font = { bold: true, color: { argb: 'FF1A5C2A' } }
    } else {
      wsLok.addRow([r.lokasyon, r.adet, fmtS(r.ort_sure), fmtS(r.min_sure), fmtS(r.max_sure)])
    }
  }

  // Lokasyon özet satırı
  if (lokRows.length > 0) {
    wsLok.addRow([])
    const topAdet = lokRows.reduce((s, r) => s + r.adet, 0)
    const topOrt = Math.round(lokRows.reduce((s, r) => s + r.ort_sure * r.adet, 0) / topAdet)
    if (hasLokHedef) {
      const uyumlu = lokRows.filter(r => r.fark != null && r.fark <= 0).length
      const asim   = lokRows.filter(r => r.fark != null && r.fark > 0).length
      const sr = wsLok.addRow(['TOPLAM', topAdet, '', fmtS(topOrt), '', '', `${uyumlu} uygun / ${asim} aşım`, '', ''])
      sr.eachCell(c => { c.font = { bold: true }; c.fill = ozetFill })
    } else {
      const sr = wsLok.addRow(['TOPLAM', topAdet, fmtS(topOrt), '', ''])
      sr.eachCell(c => { c.font = { bold: true }; c.fill = ozetFill })
    }
  }

  wsLok.columns = hasLokHedef
    ? [{ width: 36 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 14 }]
    : [{ width: 36 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }]

  // ── Sayfa 3: Personel Bazlı ───────────────────────────────────────────────
  const wsPer = wb.addWorksheet('Personel Bazlı')
  const hasPerHedef = perRows.some(r => r.hedef_sure != null)
  const perHeaders = hasPerHedef
    ? ['PERSONEL', 'TAMAMLANAN', 'HEDEF SÜRE', 'ORT. SÜRE', 'FARK', 'FARK %', 'DURUM', 'EN HIZLI', 'EN YAVAŞ']
    : ['PERSONEL', 'TAMAMLANAN', 'ORT. SÜRE', 'EN HIZLI', 'EN YAVAŞ']
  addTitle(wsPer, 'Personel Bazlı Analiz', perHeaders.length)
  addHeaders(wsPer, perHeaders)

  for (const r of perRows) {
    if (hasPerHedef) {
      const farkLabel = r.fark == null ? '—' : r.fark > 0 ? `+${fmtS(r.fark)}` : r.fark < 0 ? `-${fmtS(Math.abs(r.fark))}` : '0'
      const farkPctLabel = r.farkPct == null ? '—' : r.farkPct > 0 ? `+%${r.farkPct}` : `%${r.farkPct}`
      const row = wsPer.addRow([r.personel, r.tamamlanan, r.hedef_sure != null ? fmtS(r.hedef_sure) : '—', fmtS(r.ort_sure), farkLabel, farkPctLabel, r.durum, fmtS(r.en_hizli), fmtS(r.en_yavas)])
      const durumCell = row.getCell(7)
      if (r.durum === 'Aşım') durumCell.font = { bold: true, color: { argb: 'FFDC2626' } }
      else if (r.durum === 'Uygun') durumCell.font = { bold: true, color: { argb: 'FF1A5C2A' } }
    } else {
      wsPer.addRow([r.personel, r.tamamlanan, fmtS(r.ort_sure), fmtS(r.en_hizli), fmtS(r.en_yavas)])
    }
  }

  // Personel özet satırı
  if (perRows.length > 0) {
    wsPer.addRow([])
    const topTam = perRows.reduce((s, r) => s + r.tamamlanan, 0)
    const topOrt = Math.round(perRows.reduce((s, r) => s + r.ort_sure * r.tamamlanan, 0) / topTam)
    if (hasPerHedef) {
      const uyumlu = perRows.filter(r => r.fark != null && r.fark <= 0).length
      const asim   = perRows.filter(r => r.fark != null && r.fark > 0).length
      const sr = wsPer.addRow(['TOPLAM', topTam, '', fmtS(topOrt), '', '', `${uyumlu} uygun / ${asim} aşım`, '', ''])
      sr.eachCell(c => { c.font = { bold: true }; c.fill = ozetFill })
    } else {
      const sr = wsPer.addRow(['TOPLAM', topTam, fmtS(topOrt), '', ''])
      sr.eachCell(c => { c.font = { bold: true }; c.fill = ozetFill })
    }
  }

  wsPer.columns = hasPerHedef
    ? [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 14 }]
    : [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }]

  // ── Sayfa 4: Görev Bazlı ────────────────────────────────────────────────
  const wsGorev = wb.addWorksheet('Görev Bazlı')
  const hasGorevHedef = gorevRows.some(r => r.hedef_sure != null)
  const gorevHeaders = hasGorevHedef
    ? ['GÖREV', 'LOKASYON', 'ADET', 'HEDEF SÜRE', 'ORT. SÜRE', 'FARK', 'FARK %', 'DURUM', 'EN HIZLI', 'EN YAVAŞ']
    : ['GÖREV', 'LOKASYON', 'ADET', 'ORT. SÜRE', 'EN HIZLI', 'EN YAVAŞ']
  addTitle(wsGorev, 'Görev Bazlı Analiz', gorevHeaders.length)
  addHeaders(wsGorev, gorevHeaders)

  for (const r of gorevRows) {
    if (hasGorevHedef) {
      const farkLabel = r.fark == null ? '—' : r.fark > 0 ? `+${fmtS(r.fark)}` : r.fark < 0 ? `-${fmtS(Math.abs(r.fark))}` : '0'
      const farkPctLabel = r.farkPct == null ? '—' : r.farkPct > 0 ? `+%${r.farkPct}` : `%${r.farkPct}`
      const row = wsGorev.addRow([r.tanim, r.lokasyon, r.adet, r.hedef_sure != null ? fmtS(r.hedef_sure) : '—', fmtS(r.ort_sure), farkLabel, farkPctLabel, r.durum, fmtS(r.min_sure), fmtS(r.max_sure)])
      const durumCell = row.getCell(8)
      if (r.durum === 'Aşım') durumCell.font = { bold: true, color: { argb: 'FFDC2626' } }
      else if (r.durum === 'Uygun') durumCell.font = { bold: true, color: { argb: 'FF1A5C2A' } }
    } else {
      wsGorev.addRow([r.tanim, r.lokasyon, r.adet, fmtS(r.ort_sure), fmtS(r.min_sure), fmtS(r.max_sure)])
    }
  }

  if (gorevRows.length > 0) {
    wsGorev.addRow([])
    const topAdet = gorevRows.reduce((s, r) => s + r.adet, 0)
    const topOrt = Math.round(gorevRows.reduce((s, r) => s + r.ort_sure * r.adet, 0) / topAdet)
    if (hasGorevHedef) {
      const uyumlu = gorevRows.filter(r => r.fark != null && r.fark <= 0).length
      const asim   = gorevRows.filter(r => r.fark != null && r.fark > 0).length
      const sr = wsGorev.addRow(['TOPLAM', '', topAdet, '', fmtS(topOrt), '', '', `${uyumlu} uygun / ${asim} aşım`, '', ''])
      sr.eachCell(c => { c.font = { bold: true }; c.fill = ozetFill })
    } else {
      const sr = wsGorev.addRow(['TOPLAM', '', topAdet, fmtS(topOrt), '', ''])
      sr.eachCell(c => { c.font = { bold: true }; c.fill = ozetFill })
    }
  }

  wsGorev.columns = hasGorevHedef
    ? [{ width: 32 }, { width: 36 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 14 }]
    : [{ width: 32 }, { width: 36 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }]

  // ── Dosya döndür ──────────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer()
  const fileName = `sure_analiz_${tip}_${Date.now()}.xlsx`
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename=${fileName}`,
    },
  })
}
