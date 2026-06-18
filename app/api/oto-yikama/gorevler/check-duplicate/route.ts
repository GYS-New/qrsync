/**
 * POST /api/oto-yikama/gorevler/check-duplicate
 *
 * Ekstra görev oluşturmadan önce ön kontrol — verilen (arac_ids, tarihler)
 * kombinasyonlarından hangileri zaten oto_yikama_gorev_metadata'da var?
 *
 * Sayfada "şu plakalar şu tarihlerde planlı" uyarısı için kullanılır.
 *
 * Body:
 *   {
 *     firma_id: string,
 *     arac_ids: string[],
 *     tarihler: string[]   // 'YYYY-MM-DD'
 *   }
 *
 * Cevap:
 *   {
 *     ok: true,
 *     mevcut: [{ arac_id, plaka, hedef_tarih, durum }]
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const firmaId = body.firma_id
  const aracIds = (body.arac_ids ?? []) as string[]
  const tarihler = (body.tarihler ?? []) as string[]

  if (!firmaId || aracIds.length === 0 || tarihler.length === 0) {
    return NextResponse.json({ ok: true, mevcut: [] })
  }
  for (const t of tarihler) {
    if (!DATE_RE.test(t)) {
      return NextResponse.json({ ok: false, error: `Geçersiz tarih: ${t}` }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  const { data: metaRows } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, arac_id, plaka_snapshot, hedef_tarih')
    .in('arac_id', aracIds)
    .in('hedef_tarih', tarihler)

  const arr = (metaRows ?? []) as any[]
  if (arr.length === 0) return NextResponse.json({ ok: true, mevcut: [] })

  // Durum ve firma scope için gorevler tablosundan da al
  const gorevIds = arr.map(r => r.gorev_id).filter(Boolean)
  const { data: gorevler } = await admin
    .from('gorevler')
    .select('id, durum, firma_id')
    .in('id', gorevIds)
    .eq('firma_id', firmaId)
  const gMap = new Map(((gorevler ?? []) as any[]).map(g => [g.id, g]))

  const mevcut = arr
    .filter(r => gMap.has(r.gorev_id))
    .map(r => ({
      arac_id: r.arac_id,
      plaka: r.plaka_snapshot,
      hedef_tarih: r.hedef_tarih,
      durum: gMap.get(r.gorev_id)?.durum ?? null,
    }))

  return NextResponse.json({ ok: true, mevcut })
}
