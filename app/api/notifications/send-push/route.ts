import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

/**
 * POST /api/notifications/send-push
 * Client component'lerden FCM push bildirim göndermek için.
 * Auth gerekli — sadece oturum açmış kullanıcılar kullanabilir.
 */
export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { aliciId, title, message, channelId } = body

  if (!aliciId || !title || !message) {
    return NextResponse.json({ ok: false, error: 'aliciId, title, message zorunlu' }, { status: 400 })
  }

  try {
    await sendFCMToUser(aliciId, title, message, channelId ?? 'gorev_uyari')
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'FCM hatası' }, { status: 500 })
  }
}
