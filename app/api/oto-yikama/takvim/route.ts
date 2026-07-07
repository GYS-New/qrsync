/**
 * GET /api/oto-yikama/takvim?firma_id=...&baslangic=...&bitis=...
 *
 * Yıkama Takvimi sayfası için tek-uçlu veri:
 *   - gercek: belirtilen aralıktaki tüm Oto Yıkama görevleri
 *     (oto_yikama_gorev_metadata + gorevler + oto_yikama_arsiv birleşik)
 *   - araclar: aktif araç listesi (client-side tahmin için)
 *   - lokasyonAdMap, kullaniciAdMap: id → ad eşlemesi
 *
 * Aralık tek seferde döner; sekme/navigasyon değiştikçe client tetikler.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'
import { fetchAll } from '@/lib/supabase/fetchAll'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export type TakvimGercekKayit = {
  kaynak: 'aktif' | 'arsiv'
  gorev_id: string
  arac_id: string | null
  plaka: string
  hedef_tarih: string
  durum: 'HAZIR' | 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL' | 'YAPILAMADI' | null
  ekstra: boolean
  lokasyon_id: string | null
  baslatilma_tarihi: string | null
  tamamlanma_tarihi: string | null
  tamamlanma_suresi_saniye: number | null
  km: number | null
  notlar: string | null
  iptal_sebep: string | null
  olusturan_id: string | null
  islemi_yapan_id: string | null
}

export type TakvimArac = {
  id: string
  plaka: string
  departman: string | null
  varsayilan_lokasyon_id: string | null
  yikama_frekans_tip: 'HAFTALIK' | 'BIHAFTA' | 'AYLIK' | null
  yikama_frekans_aralik: number | null
  yikama_referans_tarih: string | null
  yikama_gunleri: number[] | null
  aktif: boolean
}

export type TakvimSkip = { tarih: string; arac_id: string }

export type TakvimResponse = {
  ok: true
  gercek: TakvimGercekKayit[]
  araclar: TakvimArac[]
  skipler: TakvimSkip[]
  lokasyonAdMap: Record<string, string>
  kullaniciAdMap: Record<string, string>
}

// Undici hata zincirini duz string'e cevir — cause.cause.cause chain'i dahil
function serializeError(e: any): string {
  const parts: string[] = []
  let cur = e
  let depth = 0
  while (cur && depth < 5) {
    const code = cur.code ?? cur.errno ?? ''
    const msg = cur.message ?? String(cur)
    parts.push(`${depth === 0 ? '' : `→cause[${depth}]:`}${code ? `[${code}] ` : ''}${msg}`)
    cur = cur.cause
    depth++
  }
  return parts.join(' ')
}

async function timedStep<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  try {
    const res = await fn()
    const dt = Date.now() - t0
    // Postgrest response'unda .error dolu ise "OK" yazmak yaniltici olur
    const postgrestErr = (res as any)?.error
    if (postgrestErr) {
      // eslint-disable-next-line no-console
      console.log(`[TAKVIM] ${label} FAIL(postgrest) ${dt}ms err=${serializeError(postgrestErr)}`)
      return res
    }
    const rows = Array.isArray(res) ? res.length : (res as any)?.data?.length ?? '-'
    // eslint-disable-next-line no-console
    console.log(`[TAKVIM] ${label} OK ${dt}ms rows=${rows}`)
    return res
  } catch (e: any) {
    const dt = Date.now() - t0
    // eslint-disable-next-line no-console
    console.log(`[TAKVIM] ${label} FAIL ${dt}ms err=${serializeError(e)}`)
    throw e
  }
}

export async function GET(req: NextRequest) {
  const reqStart = Date.now()
  // eslint-disable-next-line no-console
  console.log(`[TAKVIM] REQUEST BASLADI url=${req.nextUrl.pathname}${req.nextUrl.search}`)
  try {
  const { me } = await timedStep('assertModulYetkisi', () => assertModulYetkisi('oto_yikama'))

  const sp = req.nextUrl.searchParams
  const firmaId = sp.get('firma_id')
  const baslangic = sp.get('baslangic')
  const bitis = sp.get('bitis')

  if (!firmaId || !baslangic || !bitis) {
    return NextResponse.json({ ok: false, error: 'firma_id, baslangic, bitis zorunlu' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baslangic) || !/^\d{4}-\d{2}-\d{2}$/.test(bitis)) {
    return NextResponse.json({ ok: false, error: 'Tarih formatı YYYY-MM-DD olmalı' }, { status: 400 })
  }
  if (bitis < baslangic) {
    return NextResponse.json({ ok: false, error: 'bitis < baslangic olamaz' }, { status: 400 })
  }

  const admin = createAdminClient()

  // SA değilse kendi firmasına bağlı kalsın
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (!isSA && me.firma_id !== firmaId) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }

  const modulAktif = await timedStep('getFirmaModulDurumu', () =>
    getFirmaModulDurumu(admin as any, firmaId, 'oto_yikama_aktif')
  )
  if (!modulAktif) {
    return NextResponse.json({ ok: false, error: 'Oto Yıkama modülü pasif' }, { status: 403 })
  }

  // 1) Aktif gorevler için metadata (aralık) — 2 step (PostgREST nested embed bu tabloda güvenilmez)
  // fetchAll ile 1000+ satır destegi (PostgREST default max_rows cap'i asilir).
  const metaArr = await timedStep('metadata.fetchAll', () => fetchAll<any>(() => admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, arac_id, plaka_snapshot, hedef_tarih, ekstra, km, notlar')
    .gte('hedef_tarih', baslangic)
    .lte('hedef_tarih', bitis)
    .order('gorev_id', { ascending: true })
  ))

  const gorevIds = metaArr.map(m => m.gorev_id).filter(Boolean) as string[]

  // .in('id', gorevIds) URL'yi sisirebilir. Bir UUID = 37 char (36 + virgul).
  // Cloudflare 8KB HTTP request-line limiti var — 500 UUID = ~18KB, RED.
  // Supabase edge'i "TypeError: fetch failed" olarak dondurur (undici socket kesildi).
  // 100 UUID = ~3.7KB + query base ~500B = ~4.2KB — guvenli marj.
  const gorevMap = new Map<string, any>()
  if (gorevIds.length > 0) {
    const CHUNK = 100
    for (let i = 0; i < gorevIds.length; i += CHUNK) {
      const slice = gorevIds.slice(i, i + CHUNK)
      const chunkIdx = Math.floor(i / CHUNK) + 1
      const totalChunks = Math.ceil(gorevIds.length / CHUNK)
      const res = await timedStep(`gorevler.chunk[${chunkIdx}/${totalChunks}] size=${slice.length}`, async () =>
        admin
          .from('gorevler')
          .select(`
            id, durum, firma_id, lokasyon_id,
            baslatilma_tarihi, tamamlanma_tarihi, tamamlanma_suresi_saniye,
            olusturan_id, islemi_yapan_id, iptal_sebep
          `)
          .eq('firma_id', firmaId)
          .in('id', slice)
      )
      if (res.error) throw new Error(`gorevler chunk ${chunkIdx} err: ${res.error.message}`)
      for (const g of (res.data ?? []) as any[]) gorevMap.set(g.id, g)
    }
  }

  // Sadece firma scope'una düşen metadata'ları al
  const aktifMeta = metaArr.filter(m => gorevMap.has(m.gorev_id))

  // 2) Arşiv (zaten firma_id taşır) — fetchAll pagination ile 1000+ satir destegi
  const arsivArr = await timedStep('arsiv.fetchAll', () => fetchAll<any>(() => admin
    .from('oto_yikama_arsiv')
    .select(`
      gorev_id, arac_id, plaka_snapshot, hedef_tarih, ekstra, durum, lokasyon_id,
      baslatilma_tarihi, tamamlanma_tarihi, tamamlanma_suresi_saniye,
      olusturan_id, islemi_yapan_id, iptal_sebep, km, notlar
    `)
    .eq('firma_id', firmaId)
    .gte('hedef_tarih', baslangic)
    .lte('hedef_tarih', bitis)
    .order('gorev_id', { ascending: true })
  ))

  // 3) Aktif araçlar — tahmin için
  const aracRes = await timedStep('araclar.select', async () =>
    admin
      .from('araclar')
      .select(`
        id, plaka, departman, varsayilan_lokasyon_id,
        yikama_frekans_tip, yikama_frekans_aralik, yikama_referans_tarih, yikama_gunleri, aktif
      `)
      .eq('firma_id', firmaId)
      .eq('aktif', true)
  )
  if (aracRes.error) throw new Error(`araclar err: ${aracRes.error.message}`)
  const aracRows = aracRes.data

  // 4) Skip kayıtları — tahmin merge'de bu (arac_id|tarih) çiftleri atlanır.
  // Migration 089/090 ile takvim popup'tan tahmin iptal edilince buraya yazılır.
  const skipRes = await timedStep('skip.select', async () =>
    admin
      .from('oto_yikama_gorev_skip')
      .select('arac_id, tarih')
      .eq('firma_id', firmaId)
      .gte('tarih', baslangic)
      .lte('tarih', bitis)
  )
  const skipRows = skipRes.data
  const skipler: { arac_id: string; tarih: string }[] = ((skipRows ?? []) as any[])
    .map(s => ({ arac_id: s.arac_id, tarih: s.tarih }))
  const araclar: TakvimArac[] = (aracRows ?? []).map((a: any) => ({
    id: a.id,
    plaka: a.plaka,
    departman: a.departman ?? null,
    varsayilan_lokasyon_id: a.varsayilan_lokasyon_id ?? null,
    yikama_frekans_tip: a.yikama_frekans_tip ?? null,
    yikama_frekans_aralik: a.yikama_frekans_aralik ?? null,
    yikama_referans_tarih: a.yikama_referans_tarih ?? null,
    yikama_gunleri: Array.isArray(a.yikama_gunleri) ? a.yikama_gunleri : null,
    aktif: a.aktif === true,
  }))

  // 4) Lookup map'leri — lokasyon adı + kullanıcı adı
  const lokIds = new Set<string>()
  const userIds = new Set<string>()
  for (const m of aktifMeta) {
    const g = gorevMap.get(m.gorev_id)
    if (g?.lokasyon_id) lokIds.add(g.lokasyon_id)
    if (g?.olusturan_id) userIds.add(g.olusturan_id)
    if (g?.islemi_yapan_id) userIds.add(g.islemi_yapan_id)
  }
  for (const r of arsivArr) {
    if (r.lokasyon_id) lokIds.add(r.lokasyon_id)
    if (r.olusturan_id) userIds.add(r.olusturan_id)
    if (r.islemi_yapan_id) userIds.add(r.islemi_yapan_id)
  }
  for (const a of araclar) {
    if (a.varsayilan_lokasyon_id) lokIds.add(a.varsayilan_lokasyon_id)
  }

  const [lokRes, userRes] = await timedStep(`lookups.parallel loks=${lokIds.size} users=${userIds.size}`, () =>
    Promise.all([
      lokIds.size > 0
        ? admin.from('lokasyonlar').select('id, tanim').in('id', [...lokIds])
        : Promise.resolve({ data: [] as any[] }),
      userIds.size > 0
        ? admin.from('users').select('id, isim_soyisim').in('id', [...userIds])
        : Promise.resolve({ data: [] as any[] }),
    ])
  )
  const lokasyonAdMap: Record<string, string> = {}
  for (const l of ((lokRes.data ?? []) as any[])) lokasyonAdMap[l.id] = l.tanim ?? '—'
  const kullaniciAdMap: Record<string, string> = {}
  for (const u of ((userRes.data ?? []) as any[])) kullaniciAdMap[u.id] = u.isim_soyisim ?? '—'

  // 5) Birleşik gercek listesi
  const gercek: TakvimGercekKayit[] = []
  for (const m of aktifMeta) {
    const g = gorevMap.get(m.gorev_id) ?? ({} as any)
    gercek.push({
      kaynak: 'aktif',
      gorev_id: m.gorev_id,
      arac_id: m.arac_id ?? null,
      plaka: m.plaka_snapshot ?? '—',
      hedef_tarih: m.hedef_tarih,
      durum: g.durum ?? null,
      ekstra: m.ekstra === true,
      lokasyon_id: g.lokasyon_id ?? null,
      baslatilma_tarihi: g.baslatilma_tarihi ?? null,
      tamamlanma_tarihi: g.tamamlanma_tarihi ?? null,
      tamamlanma_suresi_saniye: g.tamamlanma_suresi_saniye ?? null,
      km: m.km ?? null,
      notlar: m.notlar ?? null,
      iptal_sebep: g.iptal_sebep ?? null,
      olusturan_id: g.olusturan_id ?? null,
      islemi_yapan_id: g.islemi_yapan_id ?? null,
    })
  }
  for (const r of arsivArr) {
    gercek.push({
      kaynak: 'arsiv',
      gorev_id: r.gorev_id,
      arac_id: r.arac_id ?? null,
      plaka: r.plaka_snapshot ?? '—',
      hedef_tarih: r.hedef_tarih,
      durum: r.durum ?? null,
      ekstra: r.ekstra === true,
      lokasyon_id: r.lokasyon_id ?? null,
      baslatilma_tarihi: r.baslatilma_tarihi ?? null,
      tamamlanma_tarihi: r.tamamlanma_tarihi ?? null,
      tamamlanma_suresi_saniye: r.tamamlanma_suresi_saniye ?? null,
      km: r.km ?? null,
      notlar: r.notlar ?? null,
      iptal_sebep: r.iptal_sebep ?? null,
      olusturan_id: r.olusturan_id ?? null,
      islemi_yapan_id: r.islemi_yapan_id ?? null,
    })
  }

  const payload: TakvimResponse = { ok: true, gercek, araclar, skipler, lokasyonAdMap, kullaniciAdMap }
  // eslint-disable-next-line no-console
  console.log(`[TAKVIM] REQUEST OK total=${Date.now() - reqStart}ms gercek=${gercek.length} araclar=${araclar.length}`)
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    const errStr = serializeError(e)
    // eslint-disable-next-line no-console
    console.log(`[TAKVIM] REQUEST FAIL total=${Date.now() - reqStart}ms err=${errStr}`)
    // eslint-disable-next-line no-console
    console.log(`[TAKVIM] STACK:`, e?.stack ?? '(stack yok)')
    return NextResponse.json(
      { ok: false, error: errStr },
      { status: 500 }
    )
  }
}
