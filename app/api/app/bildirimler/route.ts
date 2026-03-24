import { NextResponse } from 'next/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token, X-Webhook-Secret',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

// Supabase webhook — yeni bildirim eklenince çağrılır
export async function POST(req: Request) {
  try {
    const secret = req.headers.get('X-Webhook-Secret')
    if (secret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 401, headers: CORS_HEADERS })
    }

    const body = await req.json()
    const record = body.record // Supabase webhook yeni kaydı buraya koyar

    if (!record?.alici_id || !record?.baslik) {
      return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
    }

    const mesajKisa = (record.mesaj || '').split('\n').slice(0, 2).join(' ').substring(0, 100)
    await sendFCMToUser(record.alici_id, record.baslik, mesajKisa)

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS_HEADERS })
  }
}

// Mevcut GET ve mobil bildirim POST endpoint'leri
import { createAdminClient } from '@/lib/supabase/server'

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
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required', kod: 'ESLESMEDI' }, { status: 401, headers: CORS_HEADERS })

  const admin = createAdminClient()
  const ucGunOnce = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

  await admin.from('bildirimler').delete().eq('alici_id', user.id).eq('okundu', true).lt('tarih', ucGunOnce)

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
