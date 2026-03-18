import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const deviceToken = req.headers.get('X-Device-Token')

    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'Token gerekli' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: tokenData, error } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, isim_soyisim, aktif, son_kullanim')
      .eq('device_token', deviceToken)
      .single()

    if (error || !tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz token' }, { status: 401 })
    }

    if (!tokenData.aktif) {
      return NextResponse.json({ ok: false, error: 'Cihaz devre dışı' }, { status: 403 })
    }

    // Son kullanım zamanını güncelle
    await admin
      .from('device_tokens')
      .update({ son_kullanim: new Date().toISOString() })
      .eq('device_token', deviceToken)

    return NextResponse.json({
      ok: true,
      user: {
        id: tokenData.user_id,
        isim_soyisim: tokenData.isim_soyisim,
        firma_id: tokenData.firma_id,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
