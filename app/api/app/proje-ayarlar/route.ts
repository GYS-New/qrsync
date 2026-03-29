import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function GET(req: Request) {
  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) return NextResponse.json({ ok: false }, { status: 401, headers: CORS })

  const admin = createAdminClient()

  // Device token'dan proje_id al
  const { data: tokenData } = await admin
    .from('device_tokens')
    .select('proje_id, firma_id')
    .eq('device_token', deviceToken)
    .single()

  if (!tokenData?.proje_id) {
    // Proje yoksa varsayılan — her şey aktif
    return NextResponse.json({
      ok: true,
      qr_aktif: true,
      nfc_aktif: true,
    }, { headers: CORS })
  }

  // Projeden QR/NFC ayarlarını çek
  const { data: proje } = await admin
    .from('projeler')
    .select('qr_sistemi_aktif, nfc_sistemi_aktif, ad')
    .eq('id', tokenData.proje_id)
    .single()

  return NextResponse.json({
    ok: true,
    qr_aktif: proje?.qr_sistemi_aktif !== false,
    nfc_aktif: proje?.nfc_sistemi_aktif !== false,
    proje_ad: proje?.ad || '',
  }, { headers: CORS })
}
