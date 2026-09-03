/**
 * GET /api/simulasyon/tamamlamalar
 * SIM cron tarafindan tamamlanmis/iptal edilmis gorevlerin listesi.
 * Sadece SA (super_admin / alt_super_admin) erisebilir.
 *
 * Query params:
 *   firma_id?: string
 *   proje_id?: string
 *   ust_lokasyon_id?: string  (grup uyesi lokasyonlar uzerinden filtrelenir)
 *   start_date?: YYYY-MM-DD   (TR tarih, tamamlanma_tarihi >= start 00:00 TR)
 *   end_date?: YYYY-MM-DD     (TR tarih, tamamlanma_tarihi <= end 23:59 TR)
 *   limit?: number = 200
 *
 * Response:
 *   { ok: true, count, data: Array<{
 *       id, tanim, durum, lokasyon, ust_lokasyon,
 *       baslatan, tamamlayan, tamamlanma_tarihi,
 *       tamamlanma_suresi_saniye, kanal
 *   }>}
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', authUser.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Bu sayfaya erisim yetkiniz yok' }, { status: 403 })
  }

  const admin = createAdminClient()
  const url = new URL(req.url)
  const firmaId = url.searchParams.get('firma_id') || undefined
  const projeId = url.searchParams.get('proje_id') || undefined
  const ustLokId = url.searchParams.get('ust_lokasyon_id') || undefined
  const startDate = url.searchParams.get('start_date') || undefined
  const endDate = url.searchParams.get('end_date') || undefined
  const limit = Math.min(Number(url.searchParams.get('limit') || 200), 500)

  // Baz sorgu — simule_tamamlandi=true olan TAMAMLANDI/IPTAL kayitlar
  let q = admin
    .from('canli_gorevler')
    .select('id, tanim, durum, lokasyon_id, baslatan_kullanici_id, tamamlayan_kullanici_id, tamamlanma_tarihi, tamamlanma_suresi_saniye, son_tamamlama_kanali, firma_id, proje_id')
    .eq('simule_tamamlandi', true)
    .in('durum', ['TAMAMLANDI', 'IPTAL'])
    .order('tamamlanma_tarihi', { ascending: false })
    .limit(limit)

  if (firmaId) q = q.eq('firma_id', firmaId)
  if (projeId) q = q.eq('proje_id', projeId)
  if (startDate) q = q.gte('tamamlanma_tarihi', `${startDate}T00:00:00+03:00`)
  if (endDate)   q = q.lte('tamamlanma_tarihi', `${endDate}T23:59:59+03:00`)

  // Ust lokasyon filtresi: bu ust_lokasyon altindaki lokasyonlar
  if (ustLokId) {
    const { data: altLoklar } = await admin
      .from('lokasyonlar')
      .select('id')
      .eq('parent_id', ustLokId)
    const altIds = (altLoklar ?? []).map((l: any) => l.id)
    if (altIds.length === 0) return NextResponse.json({ ok: true, count: 0, data: [] })
    q = q.in('lokasyon_id', altIds)
  }

  const { data: rows, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Lokasyon + kullanici isimleri
  const lokIds = [...new Set((rows ?? []).map((r: any) => r.lokasyon_id).filter(Boolean))]
  const userIds = [...new Set(
    (rows ?? []).flatMap((r: any) => [r.baslatan_kullanici_id, r.tamamlayan_kullanici_id]).filter(Boolean)
  )]

  const [lokRes, userRes] = await Promise.all([
    lokIds.length > 0
      ? admin.from('lokasyonlar').select('id, tanim, parent_id').in('id', lokIds)
      : Promise.resolve({ data: [] as any[] }),
    userIds.length > 0
      ? admin.from('users').select('id, isim_soyisim').in('id', userIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const lokMap = new Map<string, any>()
  for (const l of (lokRes.data ?? [])) lokMap.set(l.id, l)
  const userMap = new Map<string, string>()
  for (const u of (userRes.data ?? [])) userMap.set(u.id, u.isim_soyisim)

  // Parent lokasyonlar (ust_lokasyon adi icin)
  const parentIds = [...new Set([...lokMap.values()].map(l => l.parent_id).filter(Boolean))]
  const parentMap = new Map<string, string>()
  if (parentIds.length > 0) {
    const { data: parents } = await admin.from('lokasyonlar').select('id, tanim').in('id', parentIds)
    for (const p of (parents ?? [])) parentMap.set(p.id, p.tanim)
  }

  const data = (rows ?? []).map((r: any) => {
    const lok = lokMap.get(r.lokasyon_id)
    return {
      id: r.id,
      tanim: r.tanim,
      durum: r.durum,
      lokasyon: lok?.tanim ?? null,
      ust_lokasyon: lok?.parent_id ? (parentMap.get(lok.parent_id) ?? null) : null,
      baslatan: r.baslatan_kullanici_id ? (userMap.get(r.baslatan_kullanici_id) ?? null) : null,
      tamamlayan: r.tamamlayan_kullanici_id ? (userMap.get(r.tamamlayan_kullanici_id) ?? null) : null,
      tamamlanma_tarihi: r.tamamlanma_tarihi,
      tamamlanma_suresi_saniye: r.tamamlanma_suresi_saniye,
      kanal: r.son_tamamlama_kanali,
    }
  })

  return NextResponse.json({ ok: true, count: data.length, data })
}
