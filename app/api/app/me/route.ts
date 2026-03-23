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

export async function GET(req: Request) {
  try {
    const deviceToken = req.headers.get('X-Device-Token')

    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'Token gerekli' }, { status: 401, headers: CORS_HEADERS })
    }

    const admin = createAdminClient()

    const { data: tokenData, error } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, isim_soyisim, aktif, son_kullanim')
      .eq('device_token', deviceToken)
      .single()

    if (error || !tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz token' }, { status: 401, headers: CORS_HEADERS })
    }

    if (!tokenData.aktif) {
      return NextResponse.json({ ok: false, error: 'Cihaz devre dışı' }, { status: 403, headers: CORS_HEADERS })
    }

    await admin
      .from('device_tokens')
      .update({ son_kullanim: new Date().toISOString() })
      .eq('device_token', deviceToken)

    // users tablosundan güncel bilgileri al
    const { data: userData } = await admin
      .from('users')
      .select('id, isim_soyisim, rol, firma_id, proje_id, email')
      .eq('id', tokenData.user_id)
      .single()

    return NextResponse.json({
      ok: true,
      user: {
        id: tokenData.user_id,
        isim_soyisim: userData?.isim_soyisim ?? tokenData.isim_soyisim,
        firma_id: userData?.firma_id ?? tokenData.firma_id,
        proje_id: userData?.proje_id ?? null,
        rol: userData?.rol ?? 'tenant_user',
        email: userData?.email ?? null,
      },
    }, { headers: CORS_HEADERS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS_HEADERS })
  }
}
