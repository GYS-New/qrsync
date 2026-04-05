import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })

  try {
    const body = await req.json()
    const { lokasyonAdi, beklemeSaniye } = body

    if (beklemeSaniye && beklemeSaniye > 0) {
      // Belirtilen süre kadar bekleyip bildirim gönder
      // Railway sunucusu bu isteği açık tutar (streaming response)
      await new Promise(resolve => setTimeout(resolve, beklemeSaniye * 1000))
    }

    await sendFCMToUser(
      user.id,
      '✅ Görevi Tamamlayabilirsiniz!',
      `${lokasyonAdi || 'Lokasyon'} için minimum süre doldu. Görevi tamamlamak için uygulamaya dönün.`,
      'gorev_tamamla'
    )

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS_HEADERS })
  }
}
