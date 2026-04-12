import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

// POST — Çevrimdışı kayıt yapıldı, sunucuya bildir
export async function POST(req: Request) {
  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) return NextResponse.json({ ok: false }, { status: 401, headers: CORS })

  const body = await req.json().catch(() => ({}))
  const { tip, zaman } = body // tip: 'mesai' | 'gorev', zaman: timestamp

  const admin = createAdminClient()

  // Device token'dan user_id bul
  const { data: tokenData } = await admin
    .from('device_tokens')
    .select('user_id, firma_id')
    .eq('device_token', deviceToken)
    .single()

  if (!tokenData) return NextResponse.json({ ok: false }, { status: 401, headers: CORS })

  // bekleyen_islemler tablosuna kaydet veya güncelle
  await admin.from('bekleyen_islemler').upsert({
    user_id: tokenData.user_id,
    firma_id: tokenData.firma_id,
    device_token: deviceToken,
    tip: tip || 'gorev',
    zaman: zaman ? new Date(zaman).toISOString() : new Date().toISOString(),
    bildirim_gonderildi: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'device_token' })

  return NextResponse.json({ ok: true }, { headers: CORS })
}

// DELETE — Queue işlendi, bekleyen kaydı temizle
export async function DELETE(req: Request) {
  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) return NextResponse.json({ ok: false }, { status: 401, headers: CORS })

  const admin = createAdminClient()
  await admin.from('bekleyen_islemler').delete().eq('device_token', deviceToken)

  return NextResponse.json({ ok: true }, { headers: CORS })
}
