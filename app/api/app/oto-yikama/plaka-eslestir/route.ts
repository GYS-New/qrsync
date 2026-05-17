/**
 * POST /api/app/oto-yikama/plaka-eslestir
 *
 * Mobil OCR'nin okuduğu plakayı sistemdeki bir araçla eşleştirir.
 * Levenshtein mesafesi ile en yakın adayları döner.
 *
 * Body:
 *   { okunan_plaka: "16BGB7I0" }  // OCR'ın yaklaşık okuduğu
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
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

function normalize(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Iterative Levenshtein — küçük string'ler için yeterince hızlı */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const m = a.length, n = b.length
  const prev = new Array(n + 1)
  const curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      )
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j]
  }
  return prev[n]
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
    const okunanNorm = normalize(okunan)
    if (!okunanNorm) {
      return NextResponse.json({ ok: false, error: 'okunan_plaka gerekli' }, { status: 400, headers: CORS })
    }

    const { data: araclar } = await admin
      .from('araclar')
      .select('id, plaka, marka, model, departman, kullanici_adi_soyadi')
      .eq('firma_id', tok.firma_id)
      .eq('aktif', true)

    if (!araclar || araclar.length === 0) {
      return NextResponse.json({ ok: true, kesin_eslesme: null, olasi_adaylar: [] }, { headers: CORS })
    }

    // Tam eşleşme önce dene
    const kesin = araclar.find((a: any) => normalize(a.plaka) === okunanNorm)
    if (kesin) {
      return NextResponse.json({
        ok: true,
        kesin_eslesme: {
          id: kesin.id, plaka: kesin.plaka, marka: kesin.marka, model: kesin.model,
          departman: kesin.departman, kullanici_adi_soyadi: kesin.kullanici_adi_soyadi, fark: 0,
        },
        olasi_adaylar: [],
      }, { headers: CORS })
    }

    // Levenshtein ile en yakın 5 aday
    const adaylar = araclar
      .map((a: any) => ({
        id: a.id, plaka: a.plaka, marka: a.marka, model: a.model,
        departman: a.departman, kullanici_adi_soyadi: a.kullanici_adi_soyadi,
        fark: levenshtein(okunanNorm, normalize(a.plaka)),
      }))
      .filter(a => a.fark <= 2)
      .sort((a, b) => a.fark - b.fark)
      .slice(0, 5)

    return NextResponse.json({
      ok: true,
      kesin_eslesme: null,
      olasi_adaylar: adaylar,
    }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
