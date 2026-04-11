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

  const body = await req.json().catch(() => ({}))
  const { fcm_token, ses_kanali } = body
  if (!fcm_token) return NextResponse.json({ ok: false }, { status: 400, headers: CORS_HEADERS })

  const admin = createAdminClient()
  const update: any = { fcm_token }
  if (ses_kanali === 'custom' || ses_kanali === 'default') update.ses_kanali = ses_kanali
  await admin.from('device_tokens').update(update).eq('device_token', deviceToken)

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
}
