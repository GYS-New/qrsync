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


const TERMINAL_EXPORT = ['TAMAMLANDI','ZAMANINDA_YAPILAMAYAN','ZAMANI_GECMIS','IPTAL','SILINDI','KAPATILDI']

async function fetchData(firmaId: string, projeId: string | null, params: URLSearchParams, admin: any) {
  const baslangic = params.get('baslangic') ?? null
  const bitis     = params.get('bitis')     ?? null
  const lokId     = params.get('lokasyonId') ?? null
  const yapanAdi  = params.get('yapan')     ?? null
  const tanimAra  = params.get('tanim')     ?? null
  const kaynak    = params.get('kaynak')    ?? 'rapor'
  const sinir     = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  let lokQ = admin.from('lokasyonlar').select('id,tanim,parent_id,checklist_sablon_id').eq('firma_id', firmaId)
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
  if (lokId)   lokQ = (lokQ as any).eq('id', lokId)
  const { data: loks } = await lokQ as any
  const lokIds = (loks ?? []).map((l: any) => l.id)
  if (!lokIds.length) return []

  const lokFullMap = new Map<string,any>((loks ?? []).map((l: any) => [l.id, l]))
  const pIds1 = [...new Set((loks ?? []).map((l: any) => l.parent_id).filter(Boolean))].filter((id: any) => !lokFullMap.has(id))
  if (pIds1.length) { const { data } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', pIds1) as any; for (const l of (data ?? []) as any[]) lokFullMap.set(l.id, l) }
  const pIds2 = [...new Set([...lokFullMap.values()].map(l => l.parent_id).filter(Boolean))].filter((id: any) => !lokFullMap.has(id))
  if (pIds2.length) { const { data } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', pIds2) as any; for (const l of (data ?? []) as any[]) lokFullMap.set(l.id, l) }
  function lokYolu(id: string): string {
    const parts: string[] = []; let cur: string | null = id
    while (cur) { const l = lokFullMap.get(cur); if (!l) break; parts.unshift(l.tanim); cur = l.parent_id ?? null }
    return parts.join(' / ')
  }

  const sablonIds = [...new Set((loks ?? []).map((l: any) => l.checklist_sablon_id).filter(Boolean))]
  const { data: maddelerData } = (sablonIds.length
    ? await admin.from('checklist_sablon_maddeleri').select('id,sablon_id,sira_no,baslik,zorunlu_cevap').in('sablon_id', sablonIds).order('sira_no')
    : { data: [] }) as any
  const sablonMaddeMap = new Map<string,any[]>()
  for (const m of (maddelerData ?? []) as any[]) { const arr = sablonMaddeMap.get(m.sablon_id) ?? []; arr.push(m); sablonMaddeMap.set(m.sablon_id, arr) }

  let sbQ = admin.from('checklist_sonuc_basliklari')
    .select('id,gorev_id,canli_gorev_id,lokasyon_id,sablon_id,kullanici_id,kanal,kayit_tarihi')
    .in('lokasyon_id', lokIds).order('kayit_tarihi', { ascending: false })
  if (baslangic) sbQ = (sbQ as any).gte('kayit_tarihi', `${baslangic}T00:00:00`)
  if (bitis)     sbQ = (sbQ as any).lte('kayit_tarihi', `${bitis}T23:59:59.999`)
  const { data: basliklari } = await sbQ as any
  if (!(basliklari as any[])?.length) return []

  const gorevIds = [...new Set((basliklari as any[]).map((b: any) => b.gorev_id).filter(Boolean))]
  const canliIds = [...new Set((basliklari as any[]).map((b: any) => b.canli_gorev_id).filter(Boolean))]
  const gorevMap = new Map<string,any>(); const gorevTipMap = new Map<string,string>()
  if (gorevIds.length) {
    const { data } = await admin.from('gorevler').select('id,tanim,durum,tamamlanma_tarihi,islemi_yapan_id').in('id', gorevIds) as any
    for (const g of (data ?? []) as any[]) { gorevMap.set(g.id, g); gorevTipMap.set(g.id, 'Spesifik') }
  }
  if (canliIds.length) {
    const { data: aktif } = await admin.from('canli_gorevler').select('id,tanim,durum,tamamlanma_tarihi,islemi_yapan_id,tamamlayan_kullanici_id').in('id', canliIds) as any
    const bulunan = new Set<string>()
    for (const g of (aktif ?? []) as any[]) { gorevMap.set(g.id, g); gorevTipMap.set(g.id, 'Frekansiyel'); bulunan.add(g.id) }
    const kalan = (canliIds as string[]).filter(id => !bulunan.has(id))
    if (kalan.length) {
      const { data: arsiv } = await admin.from('canli_gorevler_arsiv').select('id,tanim,durum,tamamlanma_tarihi,islemi_yapan_id,tamamlayan_kullanici_id').in('id', kalan) as any
      for (const g of (arsiv ?? []) as any[]) { gorevMap.set(g.id, g); gorevTipMap.set(g.id, 'Frekansiyel') }
    }
  }

  const baslikIds = (basliklari as any[]).map((b: any) => b.id)
  const { data: cevaplarData } = await admin.from('checklist_sonuc_maddeleri').select('sonuc_id,madde_id,secenek_degeri,aciklama,gorsel_url').in('sonuc_id', baslikIds) as any
  const cevapMap = new Map<string,Map<string,any>>()
  for (const c of (cevaplarData ?? []) as any[]) { if (!cevapMap.has(c.sonuc_id)) cevapMap.set(c.sonuc_id, new Map()); cevapMap.get(c.sonuc_id)!.set(c.madde_id, c) }

  const uids = [...new Set([...(basliklari as any[]).map((b: any) => b.kullanici_id).filter(Boolean), ...[...gorevMap.values()].flatMap((g: any) => [g.tamamlayan_kullanici_id, g.islemi_yapan_id].filter(Boolean))])]
  const { data: usersData } = (uids.length ? await admin.from('users').select('id,isim_soyisim').in('id', uids) : { data: [] }) as any
  const userMap = new Map<string,string>(((usersData ?? []) as any[]).map((u: any) => [u.id, u.isim_soyisim ?? '']))

  const rows: any[] = []
  for (const sb of (basliklari as any[])) {
    const gorevId = sb.gorev_id ?? sb.canli_gorev_id
    const g = gorevId ? gorevMap.get(gorevId) : null
    if (!g || !TERMINAL_EXPORT.includes(g.durum)) continue

    const tam = g.tamamlanma_tarihi
    if (kaynak === 'rapor' && tam && tam < sinir) continue
    if (kaynak === 'arsiv' && tam && tam >= sinir) continue

    const lokasyon = (loks ?? []).find((l: any) => l.id === sb.lokasyon_id) ?? lokFullMap.get(sb.lokasyon_id)
    const sablonId = sb.sablon_id ?? lokasyon?.checklist_sablon_id
    const maddeler = sablonId ? (sablonMaddeMap.get(sablonId) ?? []) : []
    const cevaplar = cevapMap.get(sb.id) ?? new Map()
    const dolduruldu = maddeler.filter((m: any) => cevaplar.has(m.id)).length
    const yapanId = sb.kullanici_id ?? g.tamamlayan_kullanici_id ?? g.islemi_yapan_id
    const tamamlayan = yapanId ? (userMap.get(yapanId) ?? '—') : '—'
    if (tanimAra && !(g.tanim ?? '').toLowerCase().includes(tanimAra.toLowerCase())) continue
    if (yapanAdi && !tamamlayan.toLowerCase().includes(yapanAdi.toLowerCase())) continue
    rows.push({
      tanim: g.tanim ?? '—', tip: gorevTipMap.get(gorevId) ?? '—', durum: g.durum,
      lokasyon: lokYolu(sb.lokasyon_id), tamamlayan, kanal: sb.kanal ?? 'WEB',
      kayit_tarihi: fmt(sb.kayit_tarihi), tamamlanma: fmt(g.tamamlanma_tarihi),
      madde_toplam: maddeler.length, madde_dolduruldu: dolduruldu,
      basari_pct: maddeler.length > 0 ? Math.round(dolduruldu / maddeler.length * 100) : 0,
      maddeler: maddeler.map((m: any) => {
        const c = cevaplar.get(m.id)
        return { sira:m.sira_no, baslik:m.baslik, zorunlu:m.zorunlu_cevap!==false, secenek:c?.secenek_degeri??'', aciklama:c?.aciklama??'', gorsel:c?.gorsel_url?'Var':'', dolduruldu:!!c }
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
      const header = ['GÖREV','TÜR','DURUM','LOKASYON','TAMAMLAYAN','KANAL','KAYIT TARİHİ','TAMAMLANMA','MADDE SAYISI','DOLDURULAN','BAŞARI %']
      const lines  = [header.join(';')]
      for (const r of rows) {
        lines.push([r.tanim, r.tip, r.durum, r.lokasyon, r.tamamlayan, r.kanal, r.kayit_tarihi, r.tamamlanma, r.madde_toplam, r.madde_dolduruldu, `%${r.basari_pct}`].map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(';'))
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
      { col:5, text:'TAMAMLAYAN', width:22 }, { col:6, text:'KANAL', width:10 },
      { col:7, text:'KAYIT TARİHİ', width:18 }, { col:8, text:'TAMAMLANMA', width:18 },
      { col:9, text:'MADDE SAYISI', width:14 }, { col:10, text:'DOLDURULAN', width:14 },
      { col:11, text:'BAŞARI %', width:12 },
    ])
    rows.forEach((r, i) => {
      const row = ws1.getRow(2 + i)
      row.values = [r.tanim, r.tip, r.durum, r.lokasyon, r.tamamlayan, r.kanal, r.kayit_tarihi, r.tamamlanma, r.madde_toplam, r.madde_dolduruldu, `%${r.basari_pct}`]
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
        row.values = [r.tanim, r.lokasyon, r.durum, m.sira, m.baslik, m.zorunlu ? 'Evet' : 'Hayır', m.secenek || '—', m.aciklama || '—', m.gorsel || '—', r.tamamlayan, r.kanal, r.tamamlanma]
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
