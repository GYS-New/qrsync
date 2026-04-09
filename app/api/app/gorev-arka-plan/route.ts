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
    const { lokasyonAdi, minSureKaldi, maxSureUyari } = body

    if (maxSureUyari) {
      await sendFCMToUser(
        user.id,
        '🚨 Göreviniz Devam Ediyor!',
        `${lokasyonAdi || 'Lokasyon'} için görev devam ediyor. En kısa sürede bitirmelisiniz. İşiniz bittiğinde buraya tıklayarak tamamlamayı unutmayın!`,
        'gorev_uyari'
      )
    } else if (minSureKaldi && minSureKaldi > 0) {
      const dakika = Math.floor(minSureKaldi / 60)
      const saniye = minSureKaldi % 60
      const kalan = dakika > 0 ? `${dakika} dk ${saniye} sn` : `${saniye} sn`
      await sendFCMToUser(
        user.id,
        '⏱ Göreviniz Devam Ediyor!',
        `${lokasyonAdi || 'Lokasyon'} için görev devam ediyor. En erken ${kalan} içerisinde bitirmelisiniz. İşiniz bittiğinde buraya tıklayarak tamamlamayı unutmayın!`,
        'gorev_uyari'
      )
    } else {
      await sendFCMToUser(
        user.id,
        '⏱ Göreviniz Devam Ediyor!',
        `${lokasyonAdi || 'Lokasyon'} için görev devam ediyor. En kısa sürede bitirmelisiniz. İşiniz bittiğinde buraya tıklayarak tamamlamayı unutmayın!`,
        'gorev_uyari'
      )
    }

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS_HEADERS })
  }
}
