/**
 * GET /api/pdks/qr-paket
 * PDKS Tablet — ileri tarihli token paketi.
 *
 * Header: X-Terminal-Token
 * Query:
 *   ?dakika=<n>       (opsiyonel) — paket uzunlugu. Default 30, max 1440 (24 saat).
 *                     Tablet offline dayaniklilik icin (vardiya boyu ~720 dk).
 *
 * Basari (200): { ok:true, sunucu_zamani, pencere_saniye, paket_baslangic,
 *                 paket_bitis, terminal: { ad, firma_adi, proje_adi, tip },
 *                 tokenlar_kompakt: [...] }
 * Hata   (200): { ok:false, kod, hata }
 *
 * KOMPAKT GOVDE (14.09.2026 — bug 314eaedb):
 *   Once token basina objede token + gecerli_baslangic + gecerli_bitis vardi
 *   (~145 byte/token). Pencereler bitisik ve paket_baslangic'e hizali → damgalar
 *   turetilebilir. Yeni response'ta yalnizca `tokenlar_kompakt: string[]` var.
 *   Kural: i. token = paket_baslangic + i × pencere_saniye anında baslar,
 *   bir pencere gecerlidir. 12 saatlik pakette gövde 204 KB → 65 KB.
 *   Mobil ekip her iki semayi da destekliyor.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { tokenUret, pencereNoBul, PENCERE_SANIYE, PAKET_DAKIKA } from '@/lib/pdks/token'

export const runtime = 'nodejs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Terminal-Token',
}

const PAKET_MAX_DAKIKA = 1440  // ust sinir: 24 saat

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function GET(req: Request) {
  try {
    const admin = createAdminClient()

    const terminalToken = req.headers.get('X-Terminal-Token')
    if (!terminalToken) {
      return NextResponse.json(
        { ok: false, kod: 'TERMINAL_GECERSIZ', hata: 'X-Terminal-Token gerekli' },
        { headers: CORS },
      )
    }

    const { data: terminal } = await admin
      .from('pdks_terminalleri')
      .select('id, ad, firma_id, proje_id, aktif, tip')
      .eq('terminal_token', terminalToken)
      .maybeSingle()

    if (!terminal) {
      return NextResponse.json(
        { ok: false, kod: 'TERMINAL_GECERSIZ', hata: 'Tablet yeniden tanimlanmali.' },
        { headers: CORS },
      )
    }
    if (!terminal.aktif) {
      return NextResponse.json(
        { ok: false, kod: 'TERMINAL_PASIF', hata: 'Bu tablet pasif durumda. Yoneticinize basvurun.' },
        { headers: CORS },
      )
    }

    // Paket uzunlugu — istemci ?dakika ile talep eder, backend max ile kirpar
    const url = new URL(req.url)
    const dakikaRaw = url.searchParams.get('dakika')
    const dakikaTalep = dakikaRaw ? Math.max(1, parseInt(dakikaRaw, 10) || 0) : PAKET_DAKIKA
    const paketDakika = Math.min(dakikaTalep, PAKET_MAX_DAKIKA)

    // Son gorulme + firma/proje adi
    const [{ data: firma }, { data: proje }] = await Promise.all([
      admin.from('firmalar').select('firma_adi').eq('id', terminal.firma_id).maybeSingle(),
      admin.from('projeler').select('ad').eq('id', terminal.proje_id).maybeSingle(),
    ])

    await admin
      .from('pdks_terminalleri')
      .update({ son_gorulme: new Date().toISOString() })
      .eq('id', terminal.id)

    // Paket olustur
    const nowMs = Date.now()
    const pencereMs = PENCERE_SANIYE * 1000
    const paketToken = Math.floor((paketDakika * 60 * 1000) / pencereMs)
    const basPencere = pencereNoBul(nowMs)
    const basMs = basPencere * pencereMs

    // Kompakt gövde: sadece token string'i. Damgalar tabletin tarafında türetilir:
    //   i. token = paket_baslangic + i × pencere_saniye × 1000 anında geçerli.
    const tokenlar_kompakt: string[] = []
    for (let i = 0; i < paketToken; i++) {
      tokenlar_kompakt.push(tokenUret(terminal.id, basPencere + i))
    }

    return NextResponse.json({
      ok: true,
      sunucu_zamani: new Date(nowMs).toISOString(),
      pencere_saniye: PENCERE_SANIYE,
      paket_baslangic: new Date(basMs).toISOString(),
      paket_bitis: new Date(basMs + paketToken * pencereMs).toISOString(),
      paket_dakika: paketDakika,
      terminal: {
        ad: terminal.ad,
        firma_adi: (firma as any)?.firma_adi ?? '',
        proje_adi: (proje as any)?.ad ?? '',
        tip: (terminal as any).tip,  // 'GIRIS' | 'CIKIS' | 'TOGGLE'
      },
      tokenlar_kompakt,
    }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, kod: 'SUNUCU_HATASI', hata: err?.message ?? 'Sunucu hatasi' },
      { headers: CORS },
    )
  }
}
