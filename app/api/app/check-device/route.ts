import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const deviceId   = searchParams.get('device_id')
    const firmaToken = searchParams.get('firma')

    if (!deviceId || !firmaToken) {
      return NextResponse.json({ ok: false, error: 'Eksik parametreler' }, { status: 400, headers: CORS_HEADERS })
    }

    const admin = createAdminClient()

    // Firma token ile firma_id bul
    const { data: linkData, error: linkErr } = await admin
      .from('app_download_links')
      .select('firma_id, aktif')
      .eq('link_token', firmaToken)
      .single()

    if (linkErr || !linkData || !linkData.aktif) {
      return NextResponse.json({ ok: false, error: 'Geçersiz firma linki' }, { status: 404, headers: CORS_HEADERS })
    }

    // Bu device_id ile daha önce kayıt var mı?
    const { data: mevcutKayit } = await admin
      .from('device_tokens')
      .select('user_id, isim_soyisim, proje_id, device_token')
      .eq('device_id', deviceId)
      .eq('firma_id', linkData.firma_id)
      .single()

    if (!mevcutKayit) {
      // Kayıt yok, normal kurulum devam etsin
      return NextResponse.json({ ok: true, eskiKayit: null }, { headers: CORS_HEADERS })
    }

    // Kullanıcı hâlâ aktif mi?
    const { data: kullanici } = await admin
      .from('users')
      .select('id, isim_soyisim, aktif')
      .eq('id', mevcutKayit.user_id)
      .single()

    if (!kullanici?.aktif) {
      return NextResponse.json({ ok: true, eskiKayit: null }, { headers: CORS_HEADERS })
    }

    return NextResponse.json({
      ok: true,
      eskiKayit: {
        user_id: mevcutKayit.user_id,
        isim_soyisim: mevcutKayit.isim_soyisim,
        proje_id: mevcutKayit.proje_id,
      },
    }, { headers: CORS_HEADERS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS_HEADERS })
  }
}
