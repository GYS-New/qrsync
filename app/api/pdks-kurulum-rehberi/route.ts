/**
 * /api/pdks-kurulum-rehberi
 *
 * GET  → { ok, data: { versiyon, tarih, icerik, guncelleme_tarihi } }
 * PUT  → { versiyon, tarih, icerik } — SA-only
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('pdks_kurulum_rehberi')
    .select('versiyon, tarih, icerik, guncelleme_tarihi')
    .eq('id', 1)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: true, data: { versiyon: '', tarih: '', icerik: '', guncelleme_tarihi: null } })
  return NextResponse.json({ ok: true, data })
}

export async function PUT(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Sadece SA duzenleyebilir' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Gecersiz JSON' }, { status: 400 })
  }

  const versiyon = typeof body?.versiyon === 'string' ? body.versiyon.trim().slice(0, 40) : ''
  const tarih    = typeof body?.tarih === 'string' ? body.tarih.trim().slice(0, 60) : ''
  const icerik   = typeof body?.icerik === 'string' ? body.icerik : ''
  if (!versiyon || !tarih || !icerik) {
    return NextResponse.json({ ok: false, error: 'versiyon, tarih, icerik gerekli' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('pdks_kurulum_rehberi')
    .upsert({ id: 1, versiyon, tarih, icerik, guncelleyen_id: user.id, guncelleme_tarihi: new Date().toISOString() })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
