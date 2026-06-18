/**
 * POST /api/app/oto-yikama/plaka-ocr
 *
 * Mobil cihazdan multipart/form-data ile plaka fotoğrafı alır, ayrı bir
 * Python OCR servisine (OpenCV + EasyOCR) iletir, sonucu firma araçlarıyla
 * fuzzy match yaparak döner.
 *
 * Headers:  X-Device-Token: <cihaz_token>
 * Body (multipart):
 *   - file: image/jpeg | image/png | image/webp (max 5 MB)
 *   - lokasyon_id?: string — varsa fuzzy match o üst lokasyon altındaki
 *     araçlarla sınırlı tutulur (false-positive azalır)
 *
 * Cevap (200):
 *   {
 *     ok: true,
 *     okunan_plaka: "16BGB710" | null,
 *     ham_metin: "16BGB 710 TR",
 *     guvenilirlik: 0.92,
 *     kesin_eslesme: { id, plaka, ... } | null,
 *     olasi_adaylar: [...],
 *     hata_kodu?: "PLAKA_TESPIT_EDILEMEDI" | "OCR_BOS_DONDU",
 *     islem_ms: 850
 *   }
 *
 * Hata kodları (400/500):
 *   DOSYA_YOK, DOSYA_BOYUTU_ASILDI, DOSYA_TIPI_GECERSIZ, INTERNAL_OCR_HATASI
 *
 * OCR servisi URL'i: env OCR_SERVIS_URL (ör. http://ocr.railway.internal:5000/oku)
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { plakaFuzzyMatch } from '@/lib/oto-yikama/plakaFuzzyMatch'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

const MAX_DOSYA_BYTES = 5 * 1024 * 1024
const KABUL_EDILEN_TIPLER = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function POST(req: Request) {
  const t0 = Date.now()
  try {
    const admin = createAdminClient()
    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json(
        { ok: false, error: 'X-Device-Token gerekli' },
        { status: 401, headers: CORS },
      )
    }

    const { data: tok } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, aktif')
      .eq('device_token', deviceToken)
      .single()
    if (!tok || !tok.aktif) {
      return NextResponse.json(
        { ok: false, error: 'Geçersiz cihaz token' },
        { status: 401, headers: CORS },
      )
    }

    // Multipart parse
    const form = await req.formData()
    const file = form.get('file')
    const lokasyon_id = (form.get('lokasyon_id') as string | null) || undefined

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: 'file alanı gerekli', hata_kodu: 'DOSYA_YOK' },
        { status: 400, headers: CORS },
      )
    }
    if (file.size > MAX_DOSYA_BYTES) {
      return NextResponse.json(
        { ok: false, error: 'Dosya çok büyük (max 5 MB)', hata_kodu: 'DOSYA_BOYUTU_ASILDI' },
        { status: 400, headers: CORS },
      )
    }
    if (!KABUL_EDILEN_TIPLER.includes((file.type || '').toLowerCase())) {
      return NextResponse.json(
        { ok: false, error: 'sadece jpg/png/webp', hata_kodu: 'DOSYA_TIPI_GECERSIZ' },
        { status: 400, headers: CORS },
      )
    }

    const ocrUrl = process.env.OCR_SERVIS_URL
    if (!ocrUrl) {
      return NextResponse.json(
        { ok: false, error: 'OCR servisi konfigüre değil (OCR_SERVIS_URL)', hata_kodu: 'INTERNAL_OCR_HATASI' },
        { status: 500, headers: CORS },
      )
    }

    // Python OCR servisine ilet
    const ocrForm = new FormData()
    ocrForm.append('file', file)

    let ocrJson: any
    try {
      const ocrRes = await fetch(ocrUrl, {
        method: 'POST',
        body: ocrForm,
        // 20 saniye timeout — EasyOCR cold start için pay var
        signal: AbortSignal.timeout(20_000),
      })
      if (!ocrRes.ok) {
        const text = await ocrRes.text().catch(() => '')
        return NextResponse.json(
          { ok: false, error: `OCR servisi ${ocrRes.status}: ${text.slice(0, 200)}`, hata_kodu: 'INTERNAL_OCR_HATASI' },
          { status: 502, headers: CORS },
        )
      }
      ocrJson = await ocrRes.json()
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: `OCR servisi erişilemez: ${err?.message ?? 'unknown'}`, hata_kodu: 'INTERNAL_OCR_HATASI' },
        { status: 502, headers: CORS },
      )
    }

    const okunan_plaka: string | null = ocrJson?.okunan_plaka ?? null
    const ham_metin: string = ocrJson?.ham_metin ?? ''
    const guvenilirlik: number = typeof ocrJson?.guvenilirlik === 'number' ? ocrJson.guvenilirlik : 0

    if (!okunan_plaka) {
      return NextResponse.json(
        {
          ok: true,
          okunan_plaka: null,
          ham_metin,
          guvenilirlik,
          kesin_eslesme: null,
          olasi_adaylar: [],
          hata_kodu: ocrJson?.hata_kodu || 'PLAKA_TESPIT_EDILEMEDI',
          islem_ms: Date.now() - t0,
        },
        { headers: CORS },
      )
    }

    // Fuzzy match
    const { kesin, adaylar } = await plakaFuzzyMatch(admin, tok.firma_id, okunan_plaka, lokasyon_id)

    return NextResponse.json(
      {
        ok: true,
        okunan_plaka,
        ham_metin,
        guvenilirlik,
        kesin_eslesme: kesin,
        olasi_adaylar: adaylar,
        islem_ms: Date.now() - t0,
      },
      { headers: CORS },
    )
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Sunucu hatası', hata_kodu: 'INTERNAL_OCR_HATASI', islem_ms: Date.now() - t0 },
      { status: 500, headers: CORS },
    )
  }
}
