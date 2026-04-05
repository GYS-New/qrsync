import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET — üst lokasyon bazlı bildirim alıcılarını listele */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const firmaId = p.get('firmaId')
  const projeId = p.get('projeId') ?? null
  if (!firmaId) return NextResponse.json({ error: 'firmaId gerekli' }, { status: 400 })

  const admin = createAdminClient()
  let q = admin.from('personel_takip_alicilar').select('*').eq('firma_id', firmaId)
  if (projeId) q = (q as any).eq('proje_id', projeId)
  const { data } = await q

  return NextResponse.json(data ?? [])
}

/** POST — alıcı ekle/güncelle (üst lokasyon bazlı) */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const { firmaId, projeId, ust_lokasyon_id, alici_user_ids } = body
  if (!firmaId || !ust_lokasyon_id) return NextResponse.json({ error: 'firmaId ve ust_lokasyon_id gerekli' }, { status: 400 })

  const admin = createAdminClient()

  // Mevcut eşleştirmeleri sil
  let delQ = admin.from('personel_takip_alicilar').delete().eq('firma_id', firmaId).eq('ust_lokasyon_id', ust_lokasyon_id)
  if (projeId) delQ = (delQ as any).eq('proje_id', projeId)
  else delQ = delQ.is('proje_id', null)
  await delQ

  // Yenilerini ekle
  const ids = Array.isArray(alici_user_ids) ? alici_user_ids.filter(Boolean) : []
  if (ids.length > 0) {
    const rows = ids.map((uid: string) => ({
      firma_id: firmaId,
      proje_id: projeId ?? null,
      ust_lokasyon_id,
      alici_user_id: uid,
    }))
    const { error } = await admin.from('personel_takip_alicilar').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: ids.length })
}
