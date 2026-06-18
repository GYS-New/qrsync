/**
 * POST /api/app/oto-yikama/plaka-eslestir
 *
 * Mobil OCR'nin okuduğu plakayı sistemdeki bir araçla eşleştirir.
 * Levenshtein mesafesi ile en yakın adayları döner.
 *
 * Body:
 *   { okunan_plaka: "16BGB7I0", lokasyon_id?: "..." }
 *
 * Cevap:
 *   {
 *     ok: true,
 *     kesin_eslesme: { id, plaka, ... } | null,   // fark=0 ise dolu
 *     olasi_adaylar: [{ id, plaka, fark, departman, kullanici_adi_soyadi }]
 *   }
 *
 * - fark <= 2 → aday listesi (max 5, fark ASC)
 * - fark > 2 → boş döner
 *
 * Asıl eşleştirme mantığı lib/oto-yikama/plakaFuzzyMatch.ts'te; aynı helper
 * /api/app/oto-yikama/plaka-ocr endpoint'i tarafından da kullanılır.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { plakaFuzzyMatch } from '@/lib/oto-yikama/plakaFuzzyMatch'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function POST(req: Request) {
  try {
    const admin = createAdminClient()
    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401, headers: CORS })
    }

    const { data: tok } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, aktif')
      .eq('device_token', deviceToken)
      .single()
    if (!tok || !tok.aktif) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
    }

    const body = await req.json().catch(() => ({}))
    const okunan = typeof body?.okunan_plaka === 'string' ? body.okunan_plaka : ''
    const lokasyon_id = typeof body?.lokasyon_id === 'string' ? body.lokasyon_id : undefined
    if (!okunan.trim()) {
      return NextResponse.json({ ok: false, error: 'okunan_plaka gerekli' }, { status: 400, headers: CORS })
    }

    const { kesin, adaylar } = await plakaFuzzyMatch(admin, tok.firma_id, okunan, lokasyon_id)
    return NextResponse.json({ ok: true, kesin_eslesme: kesin, olasi_adaylar: adaylar }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
