import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/arsiv/frekansiyel
 * Server-side paginated + filtered frekansiyel arşiv listesi
 *
 * Query params:
 *   firma_id, proje_id, page (1-based), limit (default 50)
 *   q (arama), durum, neden, from, to (tarih aralığı)
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
  const fromD = p.get('from') ?? ''
  const toD = p.get('to') ?? ''

  if (!firmaId) return NextResponse.json({ data: [], total: 0 })

  const admin = createAdminClient()

  // Count query
  let countQ = admin.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)
  if (projeId) countQ = countQ.eq('proje_id', projeId)
  if (durum) countQ = countQ.eq('durum', durum)
  if (neden) countQ = countQ.eq('arsiv_nedeni', neden)
  if (fromD) countQ = countQ.gte('arsiv_tarihi', fromD + 'T00:00:00')
  if (toD) countQ = countQ.lte('arsiv_tarihi', toD + 'T23:59:59')
  if (q) countQ = countQ.ilike('tanim', `%${q}%`)

  const { count: total } = await countQ

  // Data query
  const offset = (page - 1) * limit
  const sel = 'id,firma_id,proje_id,tanim,lokasyon_id,durum,arsiv_tarihi,arsiv_nedeni,aktif_olma_tarihi,olusturma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,atanan_kullanici_id,olusturan_id,tamamlayan_kullanici_id,iptal_eden_id,islemi_yapan_id,kural_id,gunluk_frekans_sayisi,son_tamamlama_kanali,simule_tamamlandi'

  let dataQ = admin.from('canli_gorevler_arsiv').select(sel).eq('firma_id', firmaId)
    .order('arsiv_tarihi', { ascending: false })
    .range(offset, offset + limit - 1)
  if (projeId) dataQ = dataQ.eq('proje_id', projeId)
  if (durum) dataQ = dataQ.eq('durum', durum)
  if (neden) dataQ = dataQ.eq('arsiv_nedeni', neden)
  if (fromD) dataQ = dataQ.gte('arsiv_tarihi', fromD + 'T00:00:00')
  if (toD) dataQ = dataQ.lte('arsiv_tarihi', toD + 'T23:59:59')
  if (q) dataQ = dataQ.ilike('tanim', `%${q}%`)

  const { data: rows, error } = await dataQ
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!rows?.length) return NextResponse.json({ data: [], total: total ?? 0 })

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

  return NextResponse.json({ data: enriched, total: total ?? 0, page, limit })
}
