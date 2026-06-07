import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token, X-Webhook-Secret',
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

export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })

  const admin = createAdminClient()
  // Mobil ekip talebi (2026-04-23): Push bildirimleri 8 saat sonra silinsin.
  // Lazy cleanup — her mobil GET'inde 8 saatten eski kayıtları sil (okundu farketmez).
  // Push bildirimler zaten anlık iletildiği için 8 saatlik geçmiş yeterli.
  const sekizSaatOnce = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString()

  await admin.from('bildirimler').delete().eq('alici_id', user.id).lt('tarih', sekizSaatOnce)

  const { data, error } = await admin
    .from('bildirimler')
    .select('*')
    .eq('alici_id', user.id)
    .gte('tarih', sekizSaatOnce)
    .order('tarih', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS })
  return NextResponse.json({ ok: true, bildirimler: data ?? [] }, { headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  const webhookSecret = req.headers.get('X-Webhook-Secret')
  const deviceToken = req.headers.get('X-Device-Token')

  // ── Supabase Webhook ──────────────────────────────────────────
  // ARTIK FCM ATMIYOR. Endpoint'ler bildirimler tablosuna INSERT yaparken
  // direkt sendFCMToUser çağırıyor (doğru kanal/channel ile). Webhook'tan
  // ikinci kez FCM atmak ÇİFT BİLDİRİM yaratıyordu (kullanıcı şikayeti
  // 2026-06-07). Endpoint güvenli boş cevap döner — geriye uyumluluk için.
  if (webhookSecret) {
    if (webhookSecret !== process.env.WEBHOOK_SECRET) {
      return NextResponse.json({ ok: false }, { status: 401, headers: CORS_HEADERS })
    }
    return NextResponse.json({ ok: true, mesaj: 'webhook devre dışı (çift bildirim önleme)' }, { headers: CORS_HEADERS })
  }

  // ── Mobil uygulama — okundu işaretle ─────────────────────────
  if (deviceToken) {
    const user = await getAuthUser(req)
    if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })

    const admin = createAdminClient()
    try {
      const body = await req.json()

      if (body.tumunu) {
        await admin
          .from('bildirimler')
          .update({ okundu: true })
          .eq('alici_id', user.id)
          .eq('okundu', false)
        return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
      }

      if (body.id) {
        await admin
          .from('bildirimler')
          .update({ okundu: true })
          .eq('id', body.id)
          .eq('alici_id', user.id)
        return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
      }

      return NextResponse.json({ ok: false, error: 'missing_params' }, { status: 400, headers: CORS_HEADERS })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS_HEADERS })
    }
  }

  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: CORS_HEADERS })
}
