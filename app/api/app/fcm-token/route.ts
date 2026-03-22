import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) return NextResponse.json({ ok: false }, { status: 401, headers: CORS_HEADERS })

  const { fcm_token } = await req.json().catch(() => ({}))
  if (!fcm_token) return NextResponse.json({ ok: false }, { status: 400, headers: CORS_HEADERS })

  const admin = createAdminClient()
  await admin.from('device_tokens').update({ fcm_token }).eq('device_token', deviceToken)

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
}
