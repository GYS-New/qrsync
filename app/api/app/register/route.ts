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

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { firma_token, device_id, user_id, isim_soyisim } = body

    if (!firma_token || !device_id || !user_id || !isim_soyisim) {
      return NextResponse.json({ ok: false, error: 'Eksik parametreler' }, { status: 400, headers: CORS_HEADERS })
    }

    const admin = createAdminClient()

    const { data: linkData, error: linkErr } = await admin
      .from('app_download_links')
      .select('firma_id, aktif, mod')
      .eq('link_token', firma_token)
      .single()

    if (linkErr || !linkData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz firma linki' }, { status: 404, headers: CORS_HEADERS })
    }

    if (!linkData.aktif) {
      return NextResponse.json({ ok: false, error: 'Bu link artık aktif değil' }, { status: 403, headers: CORS_HEADERS })
    }

    const { data: kullanici, error: kullaniciErr } = await admin
      .from('users')
      .select('id, isim_soyisim, firma_id, aktif')
      .eq('id', user_id)
      .eq('firma_id', linkData.firma_id)
      .single()

    if (kullaniciErr || !kullanici) {
      return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 404, headers: CORS_HEADERS })
    }

    if (!kullanici.aktif) {
      return NextResponse.json({ ok: false, error: 'Hesabınız aktif değil' }, { status: 403, headers: CORS_HEADERS })
    }

    const { data: mevcutKayit } = await admin
      .from('device_tokens')
      .select('id, device_token')
      .eq('device_id', device_id)
      .single()

    let deviceToken: string

    if (mevcutKayit) {
      deviceToken = mevcutKayit.device_token
      await admin
        .from('device_tokens')
        .update({
          user_id,
          firma_id: linkData.firma_id,
          isim_soyisim: kullanici.isim_soyisim,
          aktif: true,
          son_kullanim: new Date().toISOString(),
        })
        .eq('id', mevcutKayit.id)
    } else {
      const { data: yeniKayit, error: insertErr } = await admin
        .from('device_tokens')
        .insert({
          device_id,
          user_id,
          firma_id: linkData.firma_id,
          isim_soyisim: kullanici.isim_soyisim,
          aktif: true,
          kayit_tarihi: new Date().toISOString(),
        })
        .select('device_token')
        .single()

      if (insertErr || !yeniKayit) {
        return NextResponse.json({ ok: false, error: 'Kayıt oluşturulamadı: ' + insertErr?.message }, { status: 500, headers: CORS_HEADERS })
      }

      deviceToken = yeniKayit.device_token
    }

    return NextResponse.json({
      ok: true,
      device_token: deviceToken,
      user_id,
      isim_soyisim: kullanici.isim_soyisim,
      firma_id: linkData.firma_id,
      mod: linkData.mod || 'QR',
    }, { headers: CORS_HEADERS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS_HEADERS })
  }
}
