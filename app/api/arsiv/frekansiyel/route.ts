import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/arsiv/frekansiyel
 * Server-side paginated + filtered frekansiyel arşiv listesi
 *
 * Query params:
 *   firma_id, proje_id, page (1-based), limit (default 50)
 *   q (arama), durum, neden,
 *   from, to (görevin aktif_olma_tarihi'nin TR günü — frontend tarih filtresiyle uyumlu),
 *   vardiya (v1/v2/v3 — aktif_olma_tarihi TR saatine göre)
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const firmaId = p.get('firma_id')
  const projeId = p.get('proje_id')
  const page = Math.max(1, parseInt(p.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(10, parseInt(p.get('limit') ?? '50')))
  const q = p.get('q')?.trim().toLowerCase() ?? ''
  const durum = p.get('durum') ?? ''
  const neden = p.get('neden') ?? ''
  const fromD = p.get('from') ?? ''   // 'YYYY-MM-DD' (TR günü)
  const toD = p.get('to') ?? ''       // 'YYYY-MM-DD' (TR günü)
  const vardiya = p.get('vardiya') ?? 'all'  // all | v1 | v2 | v3
  const lokasyonId = p.get('lokasyon_id') ?? ''
  // Virgülle ayrılmış lokasyon ID listesi (üst lokasyon + tüm torunları için).
  // Frontend "MONTAJ" gibi üst seviye seçildiğinde descendant set'ini iletir.
  const lokasyonIdsRaw = p.get('lokasyon_ids') ?? ''
  const lokasyonIds = lokasyonIdsRaw ? lokasyonIdsRaw.split(',').map(s => s.trim()).filter(Boolean) : []
  const atananId = p.get('atanan_id') ?? ''

  if (!firmaId) return NextResponse.json({ data: [], total: 0 })

  const admin = createAdminClient()

  // Tarih filtresi: TR günü bazlı (UTC dönüşümlü), aktif_olma_tarihi üzerinden.
  // Frontend "Aktif Olma Tarihi" etiketi ile bu kolonu bekliyor — eskiden arsiv_tarihi
  // üzerinde uygulanıyordu (BUG: 11 May aktif olan görev 12 May arşivlendiğinde
  // 11 May filtresi boş dönüyordu).
  const fromUTC = fromD ? new Date(fromD + 'T00:00:00+03:00').toISOString() : null
  const toUTC   = toD   ? new Date(toD + 'T23:59:59.999+03:00').toISOString() : null

  // Count query
  let countQ = admin.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)
  if (projeId) countQ = countQ.eq('proje_id', projeId)
  if (durum) countQ = countQ.eq('durum', durum)
  if (neden) countQ = countQ.eq('arsiv_nedeni', neden)
  if (fromUTC) countQ = countQ.gte('aktif_olma_tarihi', fromUTC)
  if (toUTC) countQ = countQ.lte('aktif_olma_tarihi', toUTC)
  if (q) countQ = countQ.ilike('tanim', `%${q}%`)
  if (lokasyonIds.length > 0) countQ = countQ.in('lokasyon_id', lokasyonIds)
  else if (lokasyonId) countQ = countQ.eq('lokasyon_id', lokasyonId)
  if (atananId) countQ = countQ.eq('atanan_kullanici_id', atananId)

  let totalRaw: number | null = null
  if (vardiya === 'all') {
    const { count } = await countQ
    totalRaw = count ?? 0
  }
  // Vardiya filter'ı varken count post-fetch hesaplanır (DB-side TR saat extract yok)

  // Data query
  const offset = (page - 1) * limit
  const sel = 'id,firma_id,proje_id,tanim,lokasyon_id,durum,arsiv_tarihi,arsiv_nedeni,aktif_olma_tarihi,olusturma_tarihi,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,durum_degisim_tarihi,atanan_kullanici_id,olusturan_id,tamamlayan_kullanici_id,iptal_eden_id,islemi_yapan_id,kural_id,gunluk_frekans_sayisi,son_tamamlama_kanali,simule_tamamlandi'

  let dataQ = admin.from('canli_gorevler_arsiv').select(sel).eq('firma_id', firmaId)
    .order('aktif_olma_tarihi', { ascending: false })
  if (projeId) dataQ = dataQ.eq('proje_id', projeId)
  if (durum) dataQ = dataQ.eq('durum', durum)
  if (neden) dataQ = dataQ.eq('arsiv_nedeni', neden)
  if (fromUTC) dataQ = dataQ.gte('aktif_olma_tarihi', fromUTC)
  if (toUTC) dataQ = dataQ.lte('aktif_olma_tarihi', toUTC)
  if (q) dataQ = dataQ.ilike('tanim', `%${q}%`)
  if (lokasyonIds.length > 0) dataQ = dataQ.in('lokasyon_id', lokasyonIds)
  else if (lokasyonId) dataQ = dataQ.eq('lokasyon_id', lokasyonId)
  if (atananId) dataQ = dataQ.eq('atanan_kullanici_id', atananId)

  // Vardiya yokken normal pagination; varken filter sonrası slice yapacağız
  if (vardiya === 'all') {
    dataQ = dataQ.range(offset, offset + limit - 1)
  } else {
    // Filter post-fetch olduğundan yeterince fetch et (max 5000 — pratikte bir gün için aşılmaz)
    dataQ = dataQ.range(0, 4999)
  }

  const { data: rowsRaw, error } = await dataQ
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let rows = rowsRaw ?? []

  // Vardiya post-filter (TR saati)
  if (vardiya !== 'all') {
    const range = vardiya === 'v1' ? { from: 0, to: 8 } : vardiya === 'v2' ? { from: 8, to: 16 } : { from: 16, to: 24 }
    rows = rows.filter(r => {
      if (!r.aktif_olma_tarihi) return false
      const h = Number(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false,
      }).format(new Date(r.aktif_olma_tarihi)))
      return h >= range.from && h < range.to
    })
    totalRaw = rows.length
    rows = rows.slice(offset, offset + limit)
  }

  const total = totalRaw ?? 0
  if (!rows.length) return NextResponse.json({ data: [], total })

  // Enrich: lokasyon, user, kural — paralel
  const lokIds = [...new Set(rows.map(r => r.lokasyon_id).filter(Boolean))]
  const userIds = [...new Set(rows.flatMap(r => [r.atanan_kullanici_id, r.olusturan_id, r.tamamlayan_kullanici_id, r.iptal_eden_id, r.islemi_yapan_id]).filter(Boolean))]
  const kuralIds = [...new Set(rows.map(r => r.kural_id).filter(Boolean))]

  const [lokRes, userRes, kuralRes] = await Promise.all([
    lokIds.length ? admin.from('lokasyonlar').select('id,tanim').in('id', lokIds) : { data: [] },
    userIds.length ? admin.from('users').select('id,isim_soyisim').in('id', userIds) : { data: [] },
    kuralIds.length ? admin.from('gorev_kurallari').select('id,tanim').in('id', kuralIds) : { data: [] },
  ])

  const lokMap: Record<string, any> = {}
  for (const l of lokRes.data ?? []) lokMap[l.id] = l
  const userMap: Record<string, any> = {}
  for (const u of userRes.data ?? []) userMap[u.id] = u
  const kuralMap: Record<string, any> = {}
  for (const k of kuralRes.data ?? []) kuralMap[k.id] = k

  const enriched = rows.map(r => ({
    ...r,
    lokasyonlar: lokMap[r.lokasyon_id] ?? null,
    atanan: userMap[r.atanan_kullanici_id] ?? null,
    olusturan: userMap[r.olusturan_id] ?? null,
    tamamlayan: userMap[r.tamamlayan_kullanici_id] ?? null,
    iptalEden: userMap[r.iptal_eden_id] ?? null,
    islemi_yapan: userMap[r.islemi_yapan_id] ?? null,
    kural: kuralMap[r.kural_id] ?? null,
  }))

  return NextResponse.json({ data: enriched, total, page, limit })
}
