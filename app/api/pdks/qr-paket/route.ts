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
import { tokenUret, pencereNoBul } from '@/lib/pdks/token'

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
      .select('id, ad, firma_id, proje_id, aktif, tip, pencere_saniye, paket_dakika, pin, ad_kisalt, ses_acik, ses_duzey, pilde_kis, liste_gizle, liste_poll_sn, vurgu_sn, cikis_goster_sn')
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

    // Paket uzunlugu — istemci ?dakika ile talep eder, aksi halde terminal ayari
    // (paket_dakika) kullanilir. Backend max ile kirpar.
    const url = new URL(req.url)
    const dakikaRaw = url.searchParams.get('dakika')
    const terminalPaketDakika = (terminal as any).paket_dakika ?? 720
    const dakikaTalep = dakikaRaw ? Math.max(1, parseInt(dakikaRaw, 10) || 0) : terminalPaketDakika
    const paketDakika = Math.min(dakikaTalep, PAKET_MAX_DAKIKA)

    // Rotasyon penceresi — terminal bazli (migration 116)
    const pencereSaniye = (terminal as any).pencere_saniye ?? 30

    // Son gorulme + firma/proje adi
    const [{ data: firma }, { data: proje }] = await Promise.all([
      admin.from('firmalar').select('firma_adi').eq('id', terminal.firma_id).maybeSingle(),
      admin.from('projeler').select('ad').eq('id', terminal.proje_id).maybeSingle(),
    ])

    await admin
      .from('pdks_terminalleri')
      .update({ son_gorulme: new Date().toISOString() })
      .eq('id', terminal.id)

    // Paket olustur (terminal-bazli pencere_saniye)
    const nowMs = Date.now()
    const pencereMs = pencereSaniye * 1000
    const paketToken = Math.floor((paketDakika * 60 * 1000) / pencereMs)
    const basPencere = pencereNoBul(nowMs, pencereSaniye)
    const basMs = basPencere * pencereMs

    const tokenlar_kompakt: string[] = []
    for (let i = 0; i < paketToken; i++) {
      tokenlar_kompakt.push(tokenUret(terminal.id, basPencere + i))
    }

    return NextResponse.json({
      ok: true,
      sunucu_zamani: new Date(nowMs).toISOString(),
      pencere_saniye: pencereSaniye,
      paket_baslangic: new Date(basMs).toISOString(),
      paket_bitis: new Date(basMs + paketToken * pencereMs).toISOString(),
      paket_dakika: paketDakika,
      terminal: {
        ad: terminal.ad,
        firma_adi: (firma as any)?.firma_adi ?? '',
        proje_adi: (proje as any)?.ad ?? '',
        tip: (terminal as any).tip,  // 'GIRIS' | 'CIKIS' | 'TOGGLE'
      },
      ayarlar: {
        pin: (terminal as any).pin,
        ad_kisalt: (terminal as any).ad_kisalt,
        ses_acik: (terminal as any).ses_acik,
        ses_duzey: (terminal as any).ses_duzey,
        pilde_kis: (terminal as any).pilde_kis,
        liste_gizle: (terminal as any).liste_gizle,
        paket_dakika: (terminal as any).paket_dakika,
        liste_poll_sn: (terminal as any).liste_poll_sn,
        vurgu_sn: (terminal as any).vurgu_sn,
        cikis_goster_sn: (terminal as any).cikis_goster_sn,
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
