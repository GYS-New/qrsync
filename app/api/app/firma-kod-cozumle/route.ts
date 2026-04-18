import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

// Brute-force koruması — device_id (varsa) veya IP başına 5 yanlış = 15 dk kilit
const MAX_DENEME = 5
const KILIT_MS = 15 * 60 * 1000
const denemeler = new Map<string, { sayi: number; kilitBitis: number }>()

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

/**
 * POST /api/app/firma-kod-cozumle
 * Body: { kod: string, device_id?: string }
 * Response: { ok: true, firma_id, firma_adi, mod } | { ok: false, error }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const raw = String(body?.kod ?? '').trim().toUpperCase()
    const deviceId = String(body?.device_id ?? '')
    const clientKey = deviceId || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    if (!raw) {
      return NextResponse.json({ ok: false, error: 'Kod gerekli' }, { status: 400, headers: CORS_HEADERS })
    }
    if (raw.length !== 6) {
      return NextResponse.json({ ok: false, error: 'Kod 6 karakter olmalı' }, { status: 400, headers: CORS_HEADERS })
    }

    // Rate limit
    const now = Date.now()
    const rec = denemeler.get(clientKey)
    if (rec && rec.kilitBitis > now) {
      return NextResponse.json({
        ok: false,
        error: `Çok fazla yanlış deneme. ${Math.ceil((rec.kilitBitis - now) / 1000)} sn sonra tekrar deneyin.`,
        kilitli: true,
        kalan_sn: Math.ceil((rec.kilitBitis - now) / 1000),
      }, { status: 429, headers: CORS_HEADERS })
    }

    const admin = createAdminClient()
    const { data: firma, error } = await admin
      .from('firmalar')
      .select('id, firma_adi, ticari_unvan, aktif')
      .eq('mobil_firma_kodu', raw)
      .single()

    if (error || !firma) {
      // Yanlış deneme sayacını artır
      const cur = denemeler.get(clientKey) ?? { sayi: 0, kilitBitis: 0 }
      cur.sayi += 1
      if (cur.sayi >= MAX_DENEME) cur.kilitBitis = now + KILIT_MS
      denemeler.set(clientKey, cur)
      return NextResponse.json({ ok: false, error: 'Geçersiz firma kodu' }, { status: 404, headers: CORS_HEADERS })
    }
    if (!firma.aktif) {
      return NextResponse.json({ ok: false, error: 'Firma aktif değil' }, { status: 403, headers: CORS_HEADERS })
    }

    // Başarı — sayacı temizle
    denemeler.delete(clientKey)

    // Mod bilgisi için app_download_links'ten çek (varsa, değilse QR varsayılanı)
    const { data: linkData } = await admin
      .from('app_download_links')
      .select('mod')
      .eq('firma_id', firma.id)
      .eq('aktif', true)
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      firma_id: firma.id,
      firma_adi: firma.firma_adi ?? firma.ticari_unvan ?? '',
      mod: linkData?.mod ?? 'QR',
    }, { headers: CORS_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS_HEADERS })
  }
}
