/**
 * GET /api/oto-yikama/raporlar/excel?firma_id=...&baslangic=...&bitis=...
 * Oto Yıkama raporunu 4 sayfalı, stilize bir Excel olarak indirir.
 *   Sayfa 1: Özet (KPI'lar)
 *   Sayfa 2: Detay (tüm yıkama kayıtları)
 *   Sayfa 3: Personel Bazlı (top 10)
 *   Sayfa 4: Plaka Bazlı (top 10)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function fmtTarihTR(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtSaatTR(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}
function fmtSure(saniye: number | null | undefined): string {
  if (!saniye || saniye <= 0) return ''
  const h = Math.floor(saniye / 3600), m = Math.floor((saniye % 3600) / 60)
  if (h > 0) return `${h}sa ${m}dk`
  if (m > 0) return `${m}dk`
  return `${saniye}sn`
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  // Cron bypass: rapor-gonder cron'u user session olmadan Excel üretmek için
  // x-cron-token header veya ?secret= ile bu endpoint'i çağırır.
  const cronToken = req.headers.get('x-cron-token') ?? sp.get('secret')
  const cronExpected = process.env.CRON_SECRET
  const isCron = !!cronExpected && cronToken === cronExpected

  let meAd: string = 'Otomatik Rapor'
  let meFirmaId: string | null = null
  let isSA = false
  if (!isCron) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id,rol,firma_id,isim_soyisim').eq('id', user.id).single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 401 })
    meAd = me.isim_soyisim ?? '—'
    meFirmaId = me.firma_id ?? null
    isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  }

  const firmaId = sp.get('firma_id')
  if (!firmaId) return NextResponse.json({ error: 'firma_id gerekli' }, { status: 400 })

  // SA dışı roller kendi firmasına bağlı (cron bypass'ta zaten secret kontrolü yapıldı)
  if (!isCron && !isSA && firmaId !== meFirmaId) {
    return NextResponse.json({ error: 'Bu firmaya erişim yok' }, { status: 403 })
  }

  const admin = createAdminClient()
  if (!(await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif'))) {
    return NextResponse.json({ error: 'Oto Yıkama modülü pasif' }, { status: 403 })
  }

  const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
  const baslangic = sp.get('baslangic') || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const bitis = sp.get('bitis') || bugun
  const personelId = sp.get('personel_id') || null
  const plaka = sp.get('plaka') || null
  const tip = sp.get('tip') || ''

  // Veriyi raporlar API'sındaki mantığa benzer şekilde topla
  // Onay bekleyen kayitlar hariç (aynı raporlar route.ts kurali).
  let metaQ = admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, arac_id, plaka_snapshot, hedef_tarih, ekstra, km, notlar')
    .gte('hedef_tarih', baslangic)
    .lte('hedef_tarih', bitis)
    .neq('onay_durumu', 'ONAY_BEKLIYOR')
  if (plaka) metaQ = metaQ.eq('plaka_snapshot', plaka)
  if (tip === 'ekstra') metaQ = metaQ.eq('ekstra', true)
  if (tip === 'planli') metaQ = metaQ.eq('ekstra', false)
  const { data: metaRows } = await metaQ
  const gorevIds = (metaRows ?? []).map(m => m.gorev_id)

  let rows: any[] = []
  if (gorevIds.length > 0) {
    // Rapor tüm durumları içerir (TAMAMLANDI/ACIK/ISLEMDE/IPTAL/YAPILAMADI/HAZIR)
    // .in('id', N-UUIDs) URL'yi sisirir; 500+ UUID Cloudflare 8KB HTTP
    // request-line limitini asar. 100'luk chunk (100 UUID ~3.7KB — guvenli marj).
    const gorevlerAll: any[] = []
    const CHUNK = 100
    for (let i = 0; i < gorevIds.length; i += CHUNK) {
      const slice = gorevIds.slice(i, i + CHUNK)
      let gQ = admin
        .from('gorevler')
        .select(`id, durum, baslatilma_tarihi, tamamlanma_tarihi, tamamlanma_suresi_saniye, lokasyon_id, islemi_yapan_id,
          lokasyon:lokasyon_id (tanim, parent_id, ust:parent_id (tanim))`)
        .in('id', slice)
        .eq('firma_id', firmaId)
      if (personelId) gQ = gQ.eq('islemi_yapan_id', personelId)
      const { data } = await gQ
      if (data && data.length > 0) gorevlerAll.push(...data)
    }
    const gorevler = gorevlerAll
    const gMap = new Map(gorevler.map((g: any) => [g.id, g]))

    const aracIds = [...new Set((metaRows ?? []).map(m => m.arac_id))]
    const userIds = [...new Set((gorevler ?? []).map((g: any) => g.islemi_yapan_id).filter(Boolean))]
    const [aRes, uRes] = await Promise.all([
      aracIds.length > 0 ? admin.from('araclar').select('id, plaka, departman, kullanici_adi_soyadi, yikama_gunleri').in('id', aracIds) : Promise.resolve({ data: [] as any[] }),
      userIds.length > 0 ? admin.from('users').select('id, isim_soyisim').in('id', userIds) : Promise.resolve({ data: [] as any[] }),
    ])
    const aMap = new Map((aRes.data ?? []).map((a: any) => [a.id, a]))
    const uMap = new Map((uRes.data ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '—']))

    rows = (metaRows ?? [])
      .filter(m => gMap.has(m.gorev_id))
      .map(m => {
        const g: any = gMap.get(m.gorev_id)
        const a: any = aMap.get(m.arac_id)
        const ust = g.lokasyon?.ust?.tanim ?? null
        const lok = g.lokasyon?.tanim ?? null
        const sure = g.tamamlanma_suresi_saniye && g.tamamlanma_suresi_saniye > 0
          ? g.tamamlanma_suresi_saniye
          : (g.baslatilma_tarihi && g.tamamlanma_tarihi
            ? Math.max(0, Math.floor((new Date(g.tamamlanma_tarihi).getTime() - new Date(g.baslatilma_tarihi).getTime()) / 1000))
            : 0)
        return {
          plaka: m.plaka_snapshot,
          departman: a?.departman ?? '',
          yikama_gunleri: Array.isArray(a?.yikama_gunleri) ? a.yikama_gunleri : [],
          arac_sahibi: a?.kullanici_adi_soyadi ?? '',
          personel_id: g.islemi_yapan_id,
          personel: g.islemi_yapan_id ? (uMap.get(g.islemi_yapan_id) ?? '—') : '—',
          lokasyon: ust && lok ? `${ust} > ${lok}` : (lok ?? ''),
          hedef_tarih: m.hedef_tarih,
          baslatilma_tarihi: g.baslatilma_tarihi,
          tamamlanma_tarihi: g.tamamlanma_tarihi,
          tamamlanma_suresi_saniye: sure,
          ekstra: !!(m as any).ekstra,
          tip: (m as any).ekstra ? 'Plansız' : 'Planlı',
          durum: g.durum as string,
          km: (m as any).km ?? null,
          notlar: (m as any).notlar ?? null,
        }
      })
      .sort((a, b) => (b.tamamlanma_tarihi ?? '').localeCompare(a.tamamlanma_tarihi ?? ''))
  }

  // Hedef: aralikta planlanan (ekstra=false) toplam gorev sayisi — durumdan bagimsiz
  let hedefQ = admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, arac:arac_id!inner(firma_id)', { count: 'exact', head: true })
    .eq('ekstra', false)
    .gte('hedef_tarih', baslangic)
    .lte('hedef_tarih', bitis)
    .eq('arac.firma_id', firmaId)
  if (plaka) hedefQ = hedefQ.eq('plaka_snapshot', plaka)
  const { count: hedefCount } = await hedefQ
  const hedef = hedefCount ?? 0

  // Agregasyonlar
  const toplam = rows.length
  const planli = rows.filter(r => !r.ekstra).length
  const ekstra = rows.filter(r => r.ekstra).length
  const personelMap = new Map<string, number>()
  const plakaMap = new Map<string, number>()
  let toplamSure = 0
  for (const r of rows) {
    personelMap.set(r.personel, (personelMap.get(r.personel) ?? 0) + 1)
    plakaMap.set(r.plaka, (plakaMap.get(r.plaka) ?? 0) + 1)
    toplamSure += r.tamamlanma_suresi_saniye ?? 0
  }
  const personelTop = Array.from(personelMap.entries()).map(([ad, adet]) => ({ ad, adet })).sort((a, b) => b.adet - a.adet)
  const plakaTop = Array.from(plakaMap.entries()).map(([plk, adet]) => ({ plk, adet })).sort((a, b) => b.adet - a.adet)

  const { data: firma } = await admin.from('firmalar').select('firma_adi, ticari_unvan').eq('id', firmaId).single()
  const firmaAd = (firma as any)?.firma_adi ?? (firma as any)?.ticari_unvan ?? '—'

  // ── EXCEL OLUŞTUR ────────────────────────────────────────────────────────
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'İO-GYS'
  wb.created = new Date()

  const HDR_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1D4ED8' } }
  const HDR_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  const HDR_ALIGN = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true }
  const META_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEFF6FF' } }
  const ZEBRA_EVEN = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF8FAFC' } }
  const ZEBRA_ODD = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } }
  const BORDER = {
    top: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
  }
  const EKSTRA_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEF3C7' } }

  function setHdrRow(ws: any, rowNum: number, cells: string[]) {
    const r = ws.getRow(rowNum); r.height = 26
    cells.forEach((txt, i) => {
      const c = r.getCell(i + 1)
      c.value = txt
      c.style = { font: HDR_FONT, fill: HDR_FILL, alignment: HDR_ALIGN, border: BORDER }
    })
  }
  function setDataRow(ws: any, rowNum: number, values: any[], i: number) {
    const r = ws.getRow(rowNum); r.height = 18
    values.forEach((v, idx) => {
      const c = r.getCell(idx + 1)
      c.value = v
      c.style = {
        font: { size: 10 },
        fill: i % 2 === 0 ? ZEBRA_EVEN : ZEBRA_ODD,
        alignment: { vertical: 'middle' as const, wrapText: false },
        border: BORDER,
      }
    })
  }

  // ── Sayfa 1: Özet ───────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Özet', { properties: { tabColor: { argb: 'FF1D4ED8' } } })
  ws1.getColumn(1).width = 26
  ws1.getColumn(2).width = 32

  const tRow = ws1.getRow(1); tRow.height = 32
  const tc = tRow.getCell(1)
  tc.value = '🚗 Oto Yıkama Raporu'
  tc.font = { bold: true, size: 16, color: { argb: 'FF0F172A' } }
  tc.alignment = { vertical: 'middle' as const }
  ws1.mergeCells('A1:B1')

  function setMeta(ws: any, rowNum: number, label: string, value: string) {
    const r = ws.getRow(rowNum); r.height = 20
    const c1 = r.getCell(1); c1.value = label
    c1.style = { font: { bold: true, size: 10 }, fill: META_FILL, alignment: { horizontal: 'right' as const, vertical: 'middle' as const }, border: BORDER }
    const c2 = r.getCell(2); c2.value = value
    c2.style = { font: { size: 10 }, fill: META_FILL, alignment: { vertical: 'middle' as const }, border: BORDER }
  }
  setMeta(ws1, 2, 'Firma:', firmaAd)
  setMeta(ws1, 3, 'Dönem:', `${fmtTarihTR(baslangic)} → ${fmtTarihTR(bitis)}`)
  setMeta(ws1, 4, 'Raporu Alan:', meAd)
  setMeta(ws1, 5, 'Oluşturulma:', new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }))
  if (personelId) setMeta(ws1, 6, 'Personel Filtresi:', personelTop[0]?.ad ?? '—')
  if (plaka) setMeta(ws1, 7, 'Plaka Filtresi:', plaka)
  if (tip) setMeta(ws1, 8, 'Tip Filtresi:', tip === 'ekstra' ? 'Plansız' : 'Planlı')

  ws1.getRow(10).height = 8

  setHdrRow(ws1, 11, ['METRİK', 'DEĞER'])
  const kpis: [string, any][] = [
    ['Hedef', hedef],
    ['Toplam Yıkama', toplam],
    ['Planlı Yıkama', planli],
    ['Plansız Yıkama', ekstra],
    ['Farklı Plaka', plakaMap.size],
    ['Personel', personelMap.size],
    ['Toplam Süre', fmtSure(toplamSure)],
    ['Ortalama Süre', fmtSure(toplam > 0 ? Math.round(toplamSure / toplam) : 0)],
  ]
  kpis.forEach(([k, v], i) => setDataRow(ws1, 12 + i, [k, v], i))

  // ── Sayfa 2: Detay (Atalian format) ─────────────────────────────────────
  // Sütunlar: Plaka | Kullanıcı (departman) | Yıkama Günü (haftalık plan) |
  //           Durum | Kabul Tarihi (baslatilma) | Yıkama Personel | KM | Açıklama
  const ws2 = wb.addWorksheet('Detay', { properties: { tabColor: { argb: 'FF7C3AED' } } })
  const detayHeaders = ['Plaka', 'Kullanıcı', 'Yıkama Günü', 'Durum', 'Kabul Tarihi', 'Yıkama Personel', 'KM', 'Açıklama']
  const detayWidths  = [14,      18,           24,            14,       20,              22,                 10,    36]
  detayWidths.forEach((w, i) => { ws2.getColumn(i + 1).width = w })
  setHdrRow(ws2, 1, detayHeaders)
  ws2.views = [{ state: 'frozen', ySplit: 1 }]
  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: detayHeaders.length } }

  const GUN_KISA_TR = ['', 'PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT', 'PAZ']
  const DURUM_LABEL_TR: Record<string, string> = {
    HAZIR: 'Hazır',
    ACIK: 'Açık',
    ISLEMDE: 'İşlemde',
    TAMAMLANDI: 'Teslim Edildi',
    IPTAL: 'İptal',
    YAPILAMADI: 'Yapılamadı',
  }

  rows.forEach((r, i) => {
    const rowNum = i + 2
    const yikamaGunStr = Array.isArray(r.yikama_gunleri) && r.yikama_gunleri.length > 0
      ? [...r.yikama_gunleri].sort((a, b) => a - b).map((g: number) => GUN_KISA_TR[g] ?? g).join(', ')
      : 'Plansız'
    const durumStr = DURUM_LABEL_TR[r.durum] ?? r.durum ?? '—'
    // Kabul Tarihi = personel görevi başlattığı an (yoksa hedef tarih)
    const kabulTarihi = r.baslatilma_tarihi
      ? `${fmtTarihTR(r.baslatilma_tarihi)} ${fmtSaatTR(r.baslatilma_tarihi)}`
      : fmtTarihTR(r.hedef_tarih)
    setDataRow(ws2, rowNum, [
      r.plaka,
      r.departman || '—',
      yikamaGunStr,
      durumStr,
      kabulTarihi,
      r.personel,
      r.km != null ? r.km : '',
      r.notlar ?? '',
    ], i)
    // Ekstra satırı: Plaka kolonunu mor vurgula (görseldeki gibi ek bilgi)
    if (r.ekstra) {
      const c = ws2.getRow(rowNum).getCell(1)
      c.style = { ...c.style, fill: EKSTRA_FILL, font: { bold: true, size: 10, color: { argb: 'FF92400E' } } }
    }
  })

  // ── Sayfa 3: Personel Bazlı ─────────────────────────────────────────────
  const ws3 = wb.addWorksheet('Personel', { properties: { tabColor: { argb: 'FF16A34A' } } })
  ws3.getColumn(1).width = 6
  ws3.getColumn(2).width = 32
  ws3.getColumn(3).width = 16
  setHdrRow(ws3, 1, ['SN', 'PERSONEL', 'YIKAMA ADET'])
  personelTop.forEach((p, i) => setDataRow(ws3, i + 2, [i + 1, p.ad, p.adet], i))

  // ── Sayfa 4: Plaka Bazlı ────────────────────────────────────────────────
  const ws4 = wb.addWorksheet('Plaka', { properties: { tabColor: { argb: 'FFD97706' } } })
  ws4.getColumn(1).width = 6
  ws4.getColumn(2).width = 14
  ws4.getColumn(3).width = 16
  setHdrRow(ws4, 1, ['SN', 'PLAKA', 'YIKAMA ADET'])
  plakaTop.forEach((p, i) => setDataRow(ws4, i + 2, [i + 1, p.plk, p.adet], i))

  const buffer = await wb.xlsx.writeBuffer()
  const filename = `oto-yikama-raporu-${baslangic}_${bitis}.xlsx`

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
