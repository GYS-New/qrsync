/**
 * GET /api/reports/ceklist-rapor-export?format=excel|csv|pdf&...
 * Çeklist Raporları'nı Excel / CSV / PDF olarak indirir.
 * Aynı filtreleri ceklist-rapor route'u ile paylaşır.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buildSimplePdf } from '@/lib/reports/pdf'

export const runtime = 'nodejs'

function fmt(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v); if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function withinRange(v: string | null | undefined, from?: string | null, to?: string | null) {
  if (!v) return !from && !to
  const t = new Date(v).getTime()
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false
  if (to   && t > new Date(`${to}T23:59:59.999`).getTime()) return false
  return true
}

async function fetchData(firmaId: string, projeId: string | null, params: URLSearchParams, admin: any) {
  const baslangic  = params.get('baslangic') ?? null
  const bitis      = params.get('bitis')     ?? null
  const lokId      = params.get('lokasyonId') ?? null
  const yapanAdi   = params.get('yapan')     ?? null
  const tanimAra   = params.get('tanim')     ?? null
  const durumFil   = params.get('durum')     ?? null
  const gorevTipi  = params.get('gorevTipi') ?? 'hepsi'

  // Lokasyonlar
  let lokQ = admin.from('lokasyonlar').select('id,tanim,checklist_sablon_id').eq('firma_id', firmaId).not('checklist_sablon_id', 'is', null)
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
  if (lokId)   lokQ = (lokQ as any).eq('id', lokId)
  const { data: loks } = await lokQ
  const lokMap  = new Map<string, any>((loks ?? []).map((l: any) => [l.id, l]))
  const lokIds  = (loks ?? []).map((l: any) => l.id)
  if (!lokIds.length) return []

  // Şablon maddeleri
  const sablonIds = [...new Set((loks ?? []).map((l: any) => l.checklist_sablon_id).filter(Boolean))]
  const { data: maddelerData } = sablonIds.length
    ? await admin.from('checklist_sablon_maddeleri').select('id,sablon_id,sira_no,baslik,zorunlu_cevap').in('sablon_id', sablonIds).order('sira_no')
    : { data: [] }
  const sablonMaddeMap = new Map<string, any[]>()
  for (const m of maddelerData ?? []) {
    const arr = sablonMaddeMap.get(m.sablon_id) ?? []; arr.push(m); sablonMaddeMap.set(m.sablon_id, arr)
  }

  // Görevler
  // gorevler tablosunda tamamlayan_kullanici_id yok — ayrı SEL
  const SEL_CANLI    = 'id,firma_id,tanim,durum,lokasyon_id,olusturma_tarihi,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id,tamamlayan_kullanici_id'
  const SEL_SPESIFIK = 'id,firma_id,tanim,durum,lokasyon_id,olusturma_tarihi,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id'
  const buildQ = (table: string): Promise<any> => {
    const sel = table === 'gorevler' ? SEL_SPESIFIK : SEL_CANLI
    let q = admin.from(table).select(sel).eq('firma_id', firmaId).in('lokasyon_id', lokIds)
    if (projeId) q = (q as any).eq('proje_id', projeId)
    if (durumFil && durumFil !== 'TUMU') q = (q as any).eq('durum', durumFil)
    return Promise.resolve(q)
  }
  const queries: Promise<any>[] = []
  if (gorevTipi !== 'spesifik')    queries.push(buildQ('canli_gorevler'), buildQ('canli_gorevler_arsiv'))
  if (gorevTipi !== 'frekansiyel') queries.push(buildQ('gorevler'))

  const results  = await Promise.all(queries)
  const tables   = gorevTipi !== 'spesifik'
    ? (gorevTipi !== 'frekansiyel' ? ['canli_gorevler','canli_gorevler_arsiv','gorevler'] : ['canli_gorevler','canli_gorevler_arsiv'])
    : ['gorevler']
  const gorevMap = new Map<string, { g: any; tip: string }>()
  results.forEach((r, i) => {
    for (const g of r.data ?? []) if (!gorevMap.has(g.id)) gorevMap.set(g.id, { g, tip: tables[i] === 'gorevler' ? 'Spesifik' : 'Frekansiyel' })
  })

  const gorevler = Array.from(gorevMap.values()).filter(({ g }) => withinRange(g.tamamlanma_tarihi ?? g.olusturma_tarihi, baslangic, bitis))
  if (!gorevler.length) return []

  const gorevIds = gorevler.map(({ g }) => g.id)

  // Kullanıcılar
  const uids = [...new Set(gorevler.flatMap(({ g }) => [g.atanan_kullanici_id, g.tamamlayan_kullanici_id, g.islemi_yapan_id]).filter(Boolean))]
  const { data: usersData } = uids.length ? await admin.from('users').select('id,isim_soyisim').in('id', uids) : { data: [] }
  const userMap = new Map<string, string>((usersData ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

  // Sonuç başlıkları
  const { data: sonucBasliklari } = await admin.from('checklist_sonuc_basliklari')
    .select('id,gorev_id,canli_gorev_id,kullanici_id,kanal,created_at')
    .or(gorevIds.map((id: string) => `gorev_id.eq.${id},canli_gorev_id.eq.${id}`).join(','))
    .order('created_at', { ascending: false })
  const sbMap = new Map<string, any>()
  for (const sb of sonucBasliklari ?? []) {
    const gid = sb.gorev_id ?? sb.canli_gorev_id
    if (gid && !sbMap.has(gid)) sbMap.set(gid, sb)
  }

  // Madde cevapları
  const sonucIds = [...sbMap.values()].map((sb: any) => sb.id)
  const { data: sonucMaddeler } = sonucIds.length
    ? await admin.from('checklist_sonuc_maddeleri').select('id,sonuc_id,madde_id,secenek_degeri,aciklama,gorsel_url').in('sonuc_id', sonucIds)
    : { data: [] }
  const cevapMap = new Map<string, Map<string, any>>()
  for (const sm of sonucMaddeler ?? []) {
    if (!cevapMap.has(sm.sonuc_id)) cevapMap.set(sm.sonuc_id, new Map())
    cevapMap.get(sm.sonuc_id)!.set(sm.madde_id, sm)
  }

  // Satırları oluştur
  const rows: any[] = []
  for (const { g, tip } of gorevler) {
    const lok    = lokMap.get(g.lokasyon_id); if (!lok) continue
    const maddeler   = sablonMaddeMap.get(lok.checklist_sablon_id) ?? []
    const sb         = sbMap.get(g.id)
    const gorevCevap = sb ? cevapMap.get(sb.id) ?? new Map() : new Map()
    const dolduruldu = maddeler.filter((m: any) => gorevCevap.has(m.id)).length
    const tamamlayan = g.tamamlayan_kullanici_id ? userMap.get(g.tamamlayan_kullanici_id) : g.islemi_yapan_id ? userMap.get(g.islemi_yapan_id) : null

    if (tanimAra && !(g.tanim ?? '').toLowerCase().includes(tanimAra.toLowerCase())) continue
    if (yapanAdi && !(tamamlayan ?? '').toLowerCase().includes(yapanAdi.toLowerCase())) continue

    rows.push({
      tanim: g.tanim, tip, durum: g.durum, lokasyon: lok.tanim,
      atanan:    g.atanan_kullanici_id ? userMap.get(g.atanan_kullanici_id) ?? '—' : '—',
      tamamlayan: tamamlayan ?? '—',
      olusturma: fmt(g.olusturma_tarihi), tamamlanma: fmt(g.tamamlanma_tarihi),
      madde_toplam: maddeler.length, madde_dolduruldu: dolduruldu,
      basari_pct: maddeler.length > 0 ? Math.round(dolduruldu / maddeler.length * 100) : 0,
      maddeler: maddeler.map((m: any) => {
        const c = gorevCevap.get(m.id)
        return {
          sira: m.sira_no, baslik: m.baslik, zorunlu: m.zorunlu_cevap !== false,
          secenek: c?.secenek_degeri ?? '', aciklama: c?.aciklama ?? '',
          gorsel: c?.gorsel_url ? 'Var' : '', dolduruldu: !!c,
        }
      }),
    })
  }
  return rows
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me || !['super_admin','alt_super_admin','tenant_admin','musteri','tenant_user'].includes(me.rol)) {
      return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
    }
    const isSA    = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const params  = new URL(req.url).searchParams
    const firmaId = isSA ? params.get('firmaId') : me.firma_id
    const projeId = params.get('projeId') ?? null
    const format  = params.get('format') ?? 'excel'
    if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    const admin = createAdminClient()
    const rows  = await fetchData(firmaId, projeId, params, admin)
    const tarih = new Date().toISOString().slice(0, 10)

    // ── CSV ──────────────────────────────────────────────────────────────
    if (format === 'csv') {
      const header = ['GÖREV','TÜR','DURUM','LOKASYON','ATANAN','TAMAMLAYAN','OLUŞTURMA','TAMAMLANMA','MADDE SAYISI','DOLDURULAN','BAŞARI %']
      const lines  = [header.join(';')]
      for (const r of rows) {
        lines.push([r.tanim, r.tip, r.durum, r.lokasyon, r.atanan, r.tamamlayan, r.olusturma, r.tamamlanma, r.madde_toplam, r.madde_dolduruldu, `%${r.basari_pct}`].map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(';'))
      }
      const csv = '\uFEFF' + lines.join('\r\n')
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="ceklist-rapor-${tarih}.csv"`,
        },
      })
    }

    // ── PDF ──────────────────────────────────────────────────────────────
    if (format === 'pdf') {
      const headers = ['GÖREV', 'TÜR', 'DURUM', 'LOKASYON', 'TAMAMLAYAN', 'TAMAMLANMA', 'BAŞARI']
      const pdfRows = rows.map(r => [r.tanim, r.tip, r.durum, r.lokasyon, r.tamamlayan, r.tamamlanma, `%${r.basari_pct}`])
      const buf = buildSimplePdf({ title: 'Çeklist Raporları', subtitle: `Toplam ${rows.length} görev`, headers, rows: pdfRows })
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="ceklist-rapor-${tarih}.pdf"`,
        },
      })
    }

    // ── EXCEL ─────────────────────────────────────────────────────────────
    const ExcelJS = (await import('exceljs')).default
    const wb   = new ExcelJS.Workbook(); wb.creator = 'QR-Sync'
    const hdrStyle: any = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5C2A' } },
      alignment: { horizontal: 'center', vertical: 'middle' },
    }
    const addHdr = (ws: any, row: number, cols: { col: number; text: string; width?: number }[]) => {
      const r = ws.getRow(row); r.height = 22
      cols.forEach(({ col, text, width }) => {
        const c = r.getCell(col); c.value = text; Object.assign(c.style, hdrStyle)
        if (width) ws.getColumn(col).width = width
      })
    }

    // ── Sayfa 1: Özet ─────────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Özet')
    addHdr(ws1, 1, [
      { col:1, text:'GÖREV', width:36 }, { col:2, text:'TÜR', width:14 },
      { col:3, text:'DURUM', width:14 }, { col:4, text:'LOKASYON', width:28 },
      { col:5, text:'ATANAN', width:22 }, { col:6, text:'TAMAMLAYAN', width:22 },
      { col:7, text:'OLUŞTURMA', width:18 }, { col:8, text:'TAMAMLANMA', width:18 },
      { col:9, text:'MADDE SAYISI', width:14 }, { col:10, text:'DOLDURULAN', width:14 },
      { col:11, text:'BAŞARI %', width:12 },
    ])
    rows.forEach((r, i) => {
      const row = ws1.getRow(2 + i)
      row.values = [r.tanim, r.tip, r.durum, r.lokasyon, r.atanan, r.tamamlayan, r.olusturma, r.tamamlanma, r.madde_toplam, r.madde_dolduruldu, `%${r.basari_pct}`]
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF4F8F4' : 'FFFFFFFF' } }
      // Başarı rengi
      const basariCell = row.getCell(11)
      basariCell.font = { bold: true, color: { argb: r.basari_pct === 100 ? 'FF166534' : r.basari_pct >= 50 ? 'FFD97706' : 'FFDC2626' } }
    })

    // ── Sayfa 2: Madde Detayları ──────────────────────────────────────────
    const ws2 = wb.addWorksheet('Madde Detayları')
    addHdr(ws2, 1, [
      { col:1, text:'GÖREV', width:36 }, { col:2, text:'LOKASYON', width:24 },
      { col:3, text:'DURUM', width:14 }, { col:4, text:'#', width:6 },
      { col:5, text:'MADDE', width:36 }, { col:6, text:'ZORUNLU', width:10 },
      { col:7, text:'SEÇENEK', width:20 }, { col:8, text:'AÇIKLAMA', width:30 },
      { col:9, text:'GÖRSEL', width:10 }, { col:10, text:'TAMAMLAYAN', width:22 },
      { col:11, text:'KANAL', width:10 }, { col:12, text:'TARİH', width:18 },
    ])
    let rowIdx = 2
    for (const r of rows) {
      for (const m of r.maddeler) {
        const row = ws2.getRow(rowIdx++)
        row.values = [r.tanim, r.lokasyon, r.durum, m.sira, m.baslik, m.zorunlu ? 'Evet' : 'Hayır', m.secenek || '—', m.aciklama || '—', m.gorsel || '—', r.tamamlayan, '—', r.tamamlanma]
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: m.dolduruldu ? 'FFF0FDF4' : 'FFFFFFFF' } }
        if (!m.dolduruldu && m.zorunlu) {
          row.getCell(5).font = { color: { argb: 'FFDC2626' } }
        }
      }
    }

    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="ceklist-rapor-${tarih}.xlsx"`,
      },
    })
  } catch (err: any) {
    console.error('[ceklist-rapor-export]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
