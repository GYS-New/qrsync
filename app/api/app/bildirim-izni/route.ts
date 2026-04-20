import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/app/bildirim-izni
 * Mobil uygulama açılışında (veya izin değişiminde) bildirim iznini raporlar.
 *
 * Body: {
 *   user_id: string           // kullanıcı UUID'si (zorunlu)
 *   device_token: string      // cihazın kendi DB'deki device_token değeri (zorunlu)
 *   bildirim_izni: boolean    // true = izin açık, false = kapalı (zorunlu)
 * }
 *
 * NOT: Auth header yerine user_id + device_token eşleşmesi kontrol edilir.
 * Bu endpoint'i mobil app'ın register akışı ile aynı pattern'de çalışır (public).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any))
  const userId: string | undefined = body.user_id
  const deviceToken: string | undefined = body.device_token
  const bildirimIzni = body.bildirim_izni
  const ua = req.headers.get('user-agent') ?? ''

  // Hafif log — mobilin entegrasyonu doğrulanıyor. Tüm çağrılar loglanır, hata olsa bile.
  console.log('[bildirim-izni]', JSON.stringify({
    user_id: userId ? userId.slice(0, 8) + '…' : null,
    device_token: deviceToken ? deviceToken.slice(0, 8) + '…' : null,
    bildirim_izni: bildirimIzni,
    body_keys: Object.keys(body ?? {}),
    ua: ua.slice(0, 80),
  }))

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'user_id gerekli' }, { status: 400 })
  }
  if (!deviceToken || typeof deviceToken !== 'string') {
    return NextResponse.json({ error: 'device_token gerekli' }, { status: 400 })
  }
  if (typeof bildirimIzni !== 'boolean') {
    return NextResponse.json({ error: 'bildirim_izni boolean olmalı' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Cihazı bulup kullanıcı eşleşmesini doğrula
  const { data: dt } = await admin
    .from('device_tokens')
    .select('id,user_id,aktif')
    .eq('user_id', userId)
    .eq('device_token', deviceToken)
    .maybeSingle()

  if (!dt) {
    console.warn('[bildirim-izni] eşleşen cihaz YOK — user_id/device_token tutmuyor olabilir')
    return NextResponse.json({ error: 'Cihaz bulunamadı' }, { status: 404 })
  }

  const { error } = await admin
    .from('device_tokens')
    .update({
      bildirim_izni: bildirimIzni,
      bildirim_izni_son_kontrol: new Date().toISOString(),
    })
    .eq('id', dt.id)

  if (error) {
    console.error('[bildirim-izni] update hata:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, bildirim_izni: bildirimIzni })
}
