/**
 * GET /api/reports/spesifik-rapor-export?format=excel|pdf&...
 * Spesifik Görevler Raporu'nu Excel veya PDF olarak indirir.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildSimplePdf } from '@/lib/reports/pdf'

export const runtime = 'nodejs'

function fmt(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}
function fmtSure(sn: number | null | undefined) {
  if (!sn) return '—'
  const h = Math.floor(sn/3600), m = Math.floor((sn%3600)/60), s = sn%60
  if (h > 0) return `${h}s ${m}dk`
  if (m > 0) return `${m}dk ${s}sn`
  return `${s}sn`
}
function within(v: string | null | undefined, from?: string | null, to?: string | null) {
  if (!v) return false
  const t = new Date(v).getTime()
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false
  if (to   && t > new Date(`${to}T23:59:59.999`).getTime()) return false
  return true
}

export async function GET(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('id,rol,firma_id,isim_soyisim').eq('id', authUser.id).single()
    if (!me || !['super_admin','alt_super_admin','tenant_admin'].includes(me.rol)) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const p = new URL(req.url).searchParams
    const firmaId    = isSA ? p.get('firmaId') : me.firma_id
    const projeId    = p.get('projeId')    ?? null
    const baslangic  = p.get('baslangic')  ?? null
    const bitis      = p.get('bitis')      ?? null
    const raporuAlan = p.get('raporuAlan') ?? (me.isim_soyisim ?? '')
    const format     = p.get('format')     ?? 'excel'

    if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    const { createAdminClient } = await import('@/lib/supabase/server')
    const admin = createAdminClient()

    const { data: firma } = await admin.from('firmalar').select('firma_adi,ticari_unvan').eq('id', firmaId).single()
    const firmaAdi = firma?.firma_adi || firma?.ticari_unvan || '—'

    const { data: lokasyonlar } = await admin.from('lokasyonlar').select('id,tanim').eq('firma_id', firmaId).eq('aktif', true)
    const { data: kullanicilar } = await admin.from('users').select('id,isim_soyisim').eq('firma_id', firmaId).eq('aktif', true)
    const lokMap  = new Map((lokasyonlar ?? []).map((l: any) => [l.id, l.tanim]))
    const userMap = new Map((kullanicilar ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

    let q = admin.from('gorevler')
      .select('id,tanim,durum,lokasyon_id,atanan_kullanici_id,olusturan_id,islemi_yapan_id,olusturma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,durum_degisim_tarihi')
      .eq('firma_id', firmaId)
    if (projeId) q = (q as any).eq('proje_id', projeId)
    const { data: raw } = await q
    const gorevler = (raw ?? []).filter((g: any) => {
      if (baslangic || bitis) return within(g.olusturma_tarihi, baslangic, bitis)
      return true
    })

    const toplam     = gorevler.length
    const tamamlanan = gorevler.filter((g: any) => g.durum === 'TAMAMLANDI').length
    const acik       = gorevler.filter((g: any) => g.durum === 'ACIK').length
    const islemde    = gorevler.filter((g: any) => g.durum === 'ISLEMDE').length
    const iptal      = gorevler.filter((g: any) => g.durum === 'IPTAL').length
    const basari     = toplam > 0 ? Math.round(tamamlanan/toplam*100) : 0

    // Tarih etiketi
    const donem = baslangic && bitis ? `${baslangic} – ${bitis}` : baslangic ? `${baslangic} sonrası` : bitis ? `${bitis} öncesi` : 'Tüm zamanlar'

    // ── EXCEL ─────────────────────────────────────────────────────────────────
    if (format === 'excel') {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'QR-Sync'

      // ── Sayfa 1: Özet ──────────────────────────────────────────────────────
      const ws1 = wb.addWorksheet('Özet')
      const hdrStyle: any = {
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5C2A' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: { bottom: { style: 'thin', color: { argb: 'FF2E8B2E' } } },
      }
      const addHdr = (ws: any, row: number, cols: { col: number; text: string; width?: number }[]) => {
        const r = ws.getRow(row)
        r.height = 22
        cols.forEach(({ col, text, width }) => {
          const c = r.getCell(col)
          c.value = text; Object.assign(c.style, hdrStyle)
          if (width) ws.getColumn(col).width = width
        })
      }

      // Meta bilgi
      ws1.getRow(1).values = ['Spesifik Görevler Raporu']
      ws1.getRow(1).getCell(1).font = { bold: true, size: 14, color: { argb: 'FF0F1A0F' } }
      ws1.getRow(2).values = [`Firma: ${firmaAdi}  |  Dönem: ${donem}  |  Raporu Alan: ${raporuAlan}`]
      ws1.getRow(2).getCell(1).font = { size: 10, color: { argb: 'FF475569' } }
      ws1.getRow(3).values = []

      addHdr(ws1, 4, [
        { col: 1, text: 'METRIK', width: 28 },
        { col: 2, text: 'DEĞER', width: 16 },
      ])
      const ozetRows = [
        ['Toplam Görev', toplam],
        ['Tamamlanan', tamamlanan],
        ['Açık', acik],
        ['İşlemde', islemde],
        ['İptal', iptal],
        ['Başarı Oranı', `%${basari}`],
      ]
      ozetRows.forEach((row, i) => {
        const r = ws1.getRow(5 + i)
        r.values = row
        r.getCell(1).font = { bold: true }
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF' } }
      })

      // ── Sayfa 2: Lokasyon Bazlı ───────────────────────────────────────────
      const ws2 = wb.addWorksheet('Lokasyon Bazlı')
      addHdr(ws2, 1, [
        { col: 1, text: 'LOKASYON', width: 32 },
        { col: 2, text: 'TOPLAM', width: 12 },
        { col: 3, text: 'TAMAMLANAN', width: 14 },
        { col: 4, text: 'İPTAL', width: 12 },
        { col: 5, text: 'BAŞARI', width: 12 },
      ])
      const lokMap2: Record<string, { toplam: number; tamamlanan: number; iptal: number }> = {}
      for (const g of gorevler) {
        const lid = g.lokasyon_id ?? '__'
        if (!lokMap2[lid]) lokMap2[lid] = { toplam: 0, tamamlanan: 0, iptal: 0 }
        lokMap2[lid].toplam++
        if (g.durum === 'TAMAMLANDI') lokMap2[lid].tamamlanan++
        if (g.durum === 'IPTAL') lokMap2[lid].iptal++
      }
      Object.entries(lokMap2).sort((a,b) => b[1].toplam - a[1].toplam).forEach(([lid, v], i) => {
        const r = ws2.getRow(2 + i)
        const basariPct = v.toplam > 0 ? Math.round(v.tamamlanan/v.toplam*100) : 0
        r.values = [lokMap.get(lid) ?? '—', v.toplam, v.tamamlanan, v.iptal, `%${basariPct}`]
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF4F8F4' : 'FFFFFFFF' } }
      })

      // ── Sayfa 3: Personel Bazlı ───────────────────────────────────────────
      const ws3 = wb.addWorksheet('Personel Bazlı')
      addHdr(ws3, 1, [
        { col: 1, text: 'PERSONEL', width: 28 },
        { col: 2, text: 'TOPLAM', width: 12 },
        { col: 3, text: 'TAMAMLANAN', width: 14 },
        { col: 4, text: 'BAŞARI', width: 12 },
      ])
      const persMap: Record<string, { toplam: number; tamamlanan: number }> = {}
      for (const g of gorevler) {
        const uid = g.atanan_kullanici_id ?? '__'
        if (!persMap[uid]) persMap[uid] = { toplam: 0, tamamlanan: 0 }
        persMap[uid].toplam++
        if (g.durum === 'TAMAMLANDI') persMap[uid].tamamlanan++
      }
      Object.entries(persMap).sort((a,b) => b[1].toplam - a[1].toplam).forEach(([uid, v], i) => {
        const r = ws3.getRow(2 + i)
        const basariPct = v.toplam > 0 ? Math.round(v.tamamlanan/v.toplam*100) : 0
        r.values = [uid === '__' ? 'Atanmamış' : userMap.get(uid) ?? '—', v.toplam, v.tamamlanan, `%${basariPct}`]
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF4F8F4' : 'FFFFFFFF' } }
      })

      // ── Sayfa 4: Tamamlanan Görevler ──────────────────────────────────────
      const ws4 = wb.addWorksheet('Tamamlanan')
      addHdr(ws4, 1, [
        { col: 1, text: 'SN', width: 6 },
        { col: 2, text: 'GÖREV', width: 30 },
        { col: 3, text: 'LOKASYON', width: 24 },
        { col: 4, text: 'ATANAN', width: 20 },
        { col: 5, text: 'TAMAMLAYAN', width: 20 },
        { col: 6, text: 'OLUŞTURMA', width: 18 },
        { col: 7, text: 'TAMAMLANMA', width: 18 },
        { col: 8, text: 'SÜRE', width: 12 },
      ])
      gorevler.filter((g: any) => g.durum === 'TAMAMLANDI')
        .sort((a: any, b: any) => new Date(b.tamamlanma_tarihi ?? 0).getTime() - new Date(a.tamamlanma_tarihi ?? 0).getTime())
        .forEach((g: any, i: number) => {
          const r = ws4.getRow(2 + i)
          r.values = [
            i + 1,
            g.tanim ?? '—',
            lokMap.get(g.lokasyon_id) ?? '—',
            g.atanan_kullanici_id ? userMap.get(g.atanan_kullanici_id) ?? '—' : '—',
            g.islemi_yapan_id ? userMap.get(g.islemi_yapan_id) ?? '—' : '—',
            fmt(g.olusturma_tarihi),
            fmt(g.tamamlanma_tarihi),
            fmtSure(g.tamamlanma_suresi_saniye),
          ]
          r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF4F8F4' : 'FFFFFFFF' } }
        })

      // ── Sayfa 5: Açık / İptal ─────────────────────────────────────────────
      const ws5 = wb.addWorksheet('Açık-İptal')
      addHdr(ws5, 1, [
        { col: 1, text: 'SN', width: 6 },
        { col: 2, text: 'GÖREV', width: 30 },
        { col: 3, text: 'LOKASYON', width: 24 },
        { col: 4, text: 'ATANAN', width: 20 },
        { col: 5, text: 'DURUM', width: 14 },
        { col: 6, text: 'OLUŞTURMA', width: 18 },
        { col: 7, text: 'SON İŞLEM', width: 18 },
      ])
      gorevler.filter((g: any) => ['ACIK','ISLEMDE','IPTAL'].includes(g.durum))
        .forEach((g: any, i: number) => {
          const r = ws5.getRow(2 + i)
          r.values = [
            i + 1,
            g.tanim ?? '—',
            lokMap.get(g.lokasyon_id) ?? '—',
            g.atanan_kullanici_id ? userMap.get(g.atanan_kullanici_id) ?? '—' : '—',
            g.durum,
            fmt(g.olusturma_tarihi),
            fmt(g.durum_degisim_tarihi),
          ]
          r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF4F8F4' : 'FFFFFFFF' } }
        })

      const buf = await wb.xlsx.writeBuffer()
      const tarih = new Date().toISOString().slice(0,10)
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="spesifik-rapor-${tarih}.xlsx"`,
        },
      })
    }

    // ── PDF ───────────────────────────────────────────────────────────────────
    if (format === 'pdf') {
      // Özet sayfası
      const ozetHeaders = ['METRİK', 'DEĞER']
      const ozetRows: string[][] = [
        ['Firma', firmaAdi],
        ['Dönem', donem],
        ['Raporu Alan', raporuAlan],
        ['Toplam Görev', String(toplam)],
        ['Tamamlanan', String(tamamlanan)],
        ['Açık', String(acik)],
        ['İşlemde', String(islemde)],
        ['İptal', String(iptal)],
        ['Başarı Oranı', `%${basari}`],
      ]
      const buf = buildSimplePdf({
        title: 'Spesifik Görevler Raporu',
        subtitle: `${firmaAdi} · ${donem}`,
        headers: ozetHeaders,
        rows: ozetRows,
      })
      const tarih = new Date().toISOString().slice(0,10)
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="spesifik-rapor-${tarih}.pdf"`,
        },
      })
    }

    return NextResponse.json({ error: 'Geçersiz format' }, { status: 400 })
  } catch (err: any) {
    console.error('[spesifik-rapor-export]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası.' }, { status: 500 })
  }
}
