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
    const { taskId, taskType } = body

    if (!taskId || !taskType) {
      return NextResponse.json({ ok: false, error: 'taskId ve taskType gerekli' }, { status: 400, headers: CORS_HEADERS })
    }

    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    const tablo = taskType === 'canli_gorevler' ? 'canli_gorevler' : 'gorevler'

    // Görevi iptal et
    await admin
      .from(tablo)
      .update({ durum: 'IPTAL', durum_degisim_tarihi: nowIso })
      .eq('id', taskId)
      .eq('durum', 'ISLEMDE')

    // Kullanıcıya FCM bildirimi gönder
    await sendFCMToUser(
      user.id,
      '❌ Görev Süresi Doldu',
      'Maksimum süre aşıldığı için göreviniz iptal edildi.'
    )

    // Bildirim kaydı oluştur
    await admin.from('bildirimler').insert({
      alici_id: user.id,
      baslik: 'Görev Süresi Doldu',
      mesaj: 'Maksimum süre aşıldığı için göreviniz iptal edildi.',
      tip: 'sistem',
      okundu: false,
      tarih: nowIso,
    })

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS_HEADERS })
  }
}
