import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

async function getAuthUser(req: Request) {
  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('device_tokens')
    .select('user_id, aktif')
    .eq('device_token', deviceToken)
    .single()
  if (data?.aktif) return { id: data.user_id }
  return null
}

export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })

  const admin = createAdminClient()

  // 3 günden eski bildirimleri sil
  const ucGunOnce = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
  await admin
    .from('bildirimler')
    .delete()
    .eq('alici_id', user.id)
    .eq('okundu', true)
    .lt('tarih', ucGunOnce)

  // Son 3 günün bildirimlerini getir
  const { data, error } = await admin
    .from('bildirimler')
    .select('*')
    .eq('alici_id', user.id)
    .gte('tarih', ucGunOnce)
    .order('tarih', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS })

  return NextResponse.json({ ok: true, bildirimler: data ?? [] }, { headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })

  const body = await req.json().catch(() => ({}))
  const { id, tumunu } = body
  const admin = createAdminClient()

  if (tumunu) {
    await admin.from('bildirimler').update({ okundu: true }).eq('alici_id', user.id).eq('okundu', false)
  } else if (id) {
    await admin.from('bildirimler').update({ okundu: true }).eq('id', id).eq('alici_id', user.id)
  }

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
}
