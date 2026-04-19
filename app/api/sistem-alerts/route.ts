import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sistem-alerts?cozuldu=false&limit=100
 * Sadece SA görebilir.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const url = new URL(req.url)
  const cozulduParam = url.searchParams.get('cozuldu')
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 100))

  const admin = createAdminClient()
  let q = admin.from('sistem_alerts').select('*').order('tarih', { ascending: false }).limit(limit)
  if (cozulduParam === 'false') q = q.eq('cozuldu', false)
  if (cozulduParam === 'true') q = q.eq('cozuldu', true)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? [] })
}

/**
 * PATCH /api/sistem-alerts  → alert çözüldü olarak işaretle
 * body: { ids: number[] }
 */
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({} as any))
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: any) => typeof x === 'number') : []
  if (!ids.length) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('sistem_alerts').update({
    cozuldu: true, cozen_id: user.id, cozum_tarihi: new Date().toISOString(),
  }).in('id', ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, cozulen: ids.length })
}
