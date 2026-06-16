/**
 * GET /api/app/yetkili-moduller
 *
 * Mobil — giriş yapmış cihazın kullanıcısı için yetkili modülleri listeler.
 * Auth: X-Device-Token (mevcut mobil auth pattern'i).
 *
 * Yanıt formatı: docs/MOBIL_EKIBE_MODUL_SISTEMI.md
 * { ok: true, moduller: [...], tek_modul: boolean, tek_modul_kodu: string|null }
 *
 * Geriye uyumluluk: Bu endpoint'i çağırmayan eski mobil sürümler etkilenmez —
 * mevcut GYS akışı aynen sürer.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getYetkiliModuller } from '@/lib/modul/yetkiliModuller'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: Request) {
  try {
    const admin = createAdminClient()

    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json(
        { ok: false, error: 'X-Device-Token gerekli', kod: 'ESLESMEDI' },
        { status: 401, headers: CORS_HEADERS },
      )
    }

    const { data: tokenData, error: tokenErr } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, aktif')
      .eq('device_token', deviceToken)
      .single()

    if (tokenErr || !tokenData || tokenData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Geçersiz cihaz token', kod: 'ESLESMEDI' },
        { status: 401, headers: CORS_HEADERS },
      )
    }

    // Kullanıcının rolünü çek (user.aktif=false ise modül listesi boş döner)
    const { data: userData } = await admin
      .from('users')
      .select('rol, aktif')
      .eq('id', tokenData.user_id)
      .single()

    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Kullanıcı pasif', kod: 'USER_PASIF' },
        { status: 403, headers: CORS_HEADERS },
      )
    }

    const yetkili = await getYetkiliModuller(userData.rol, tokenData.firma_id, tokenData.user_id)

    return NextResponse.json(
      {
        ok: true,
        moduller: yetkili.moduller,
        tek_modul: yetkili.tek_modul,
        tek_modul_kodu: yetkili.tek_modul_kodu,
      },
      { headers: CORS_HEADERS },
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Sunucu hatası' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
