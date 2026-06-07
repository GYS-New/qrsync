import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getRequestMeta } from '@/lib/device/getRequestMeta'
import { auditLog } from '@/lib/audit/log'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

// Basit in-memory rate limit — token bazlı, 1dk içinde max 5 deneme.
// Railway tek process oldu����u için Map yeterli; scale-out olursa DB-backed
// limit'e geçilir.
const RL_MAX_DENEME = 5
const RL_PENCERE_MS = 60 * 1000
const denemeler = new Map<string, { sayi: number; pencereBitis: number }>()

function rateLimitOK(token: string): boolean {
  const now = Date.now()
  const rec = denemeler.get(token)
  if (!rec || rec.pencereBitis < now) {
    denemeler.set(token, { sayi: 1, pencereBitis: now + RL_PENCERE_MS })
    return true
  }
  if (rec.sayi >= RL_MAX_DENEME) return false
  rec.sayi += 1
  return true
}

/**
 * POST /api/app/device-deaktif
 *
 * Mobile fabrika ayarlarına dönmeden önce backend'e haber verir.
 * Endpoint cihazın device_tokens kaydını pasifleştirir (aktif=false, fcm_token=null).
 *
 * Spec: docs/MOBIL_EKIBE_DEVICE_DEAKTIF.md (07 Haz 2026)
 *
 * Header:
 *   X-Device-Token: <token>  (zorunlu)
 *
 * Body:
 *   { sebep: "fabrika_ayarlari" | "logout" | "yonetici" | ... }
 *
 * Davranış:
 *   - Token yoksa → 401
 *   - Token DB'de yoksa → 200 + noop (idempotent)
 *   - Bulunduysa → aktif=false, fcm_token=null, son_kullanim=now
 *   - Audit log: tip='device_deaktif_fabrika'
 */
export async function POST(req: Request) {
  try {
    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json(
        { ok: false, error: 'X-Device-Token gerekli' },
        { status: 401, headers: CORS_HEADERS },
      )
    }

    if (!rateLimitOK(deviceToken)) {
      return NextResponse.json(
        { ok: false, error: 'Çok fazla istek, lütfen biraz bekleyin.' },
        { status: 429, headers: CORS_HEADERS },
      )
    }

    let body: any = {}
    try { body = await req.json() } catch {}
    const sebepRaw = typeof body?.sebep === 'string' ? body.sebep.trim() : ''
    const sebep = sebepRaw && sebepRaw.length <= 64 ? sebepRaw : 'belirsiz'

    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    const { ip: reqIp, ua: reqUa } = getRequestMeta(req)

    // Token'ı bul + UPDATE aynı sorguda (idempotent — sadece aktif kayıt güncellenir)
    const { data: updated, error: updErr } = await admin
      .from('device_tokens')
      .update({
        aktif: false,
        fcm_token: null,
        son_kullanim: nowIso,
      })
      .eq('device_token', deviceToken)
      .eq('aktif', true)
      .select('id, device_id, user_id, firma_id')

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: 'Cihaz deaktif edilemedi' },
        { status: 500, headers: CORS_HEADERS },
      )
    }

    const kayit = updated?.[0]

    // Idempotent: token yok veya zaten pasif → noop OK
    if (!kayit) {
      return NextResponse.json(
        { ok: true, noop: true },
        { headers: CORS_HEADERS },
      )
    }

    void auditLog({
      tip: 'device_deaktif_fabrika',
      tablo: 'device_tokens',
      firma_id: kayit.firma_id ?? null,
      kullanici_id: kayit.user_id ?? null,
      detay: {
        sebep,
        device_token_id: kayit.id,
        device_id_prefix: typeof kayit.device_id === 'string' ? kayit.device_id.slice(0, 12) : null,
        ip: reqIp,
        ua: reqUa ? reqUa.slice(0, 120) : null,
      },
    })

    return NextResponse.json(
      { ok: true, deaktif: true },
      { headers: CORS_HEADERS },
    )
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Sunucu hatası' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
