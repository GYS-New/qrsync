/**
 * GET /api/pdks/qr-paket
 * PDKS Tablet — ileri tarihli token paketi.
 *
 * Header: X-Terminal-Token
 *
 * Basari (200): { ok:true, sunucu_zamani, pencere_saniye, paket_baslangic,
 *                 paket_bitis, terminal: { ad, firma_adi, proje_adi }, tokenlar: [...] }
 * Hata   (200): { ok:false, kod, hata }
 *
 * Amac: tabletin interneti ~10-20 dk kesilse bile QR donmeye devam etsin.
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

    // Son gorulme + firma/proje adi
    const [{ data: firma }, { data: proje }] = await Promise.all([
      admin.from('firmalar').select('firma_adi').eq('id', terminal.firma_id).maybeSingle(),
      admin.from('projeler').select('ad').eq('id', terminal.proje_id).maybeSingle(),
    ])

    await admin
      .from('pdks_terminalleri')
      .update({ son_gorulme: new Date().toISOString() })
      .eq('id', terminal.id)

    // Paket olustur: pencere_saniye 30, paket 30 dk => 60 token
    const nowMs = Date.now()
    const pencereMs = PENCERE_SANIYE * 1000
    const paketToken = Math.floor((PAKET_DAKIKA * 60 * 1000) / pencereMs)
    const basPencere = pencereNoBul(nowMs)
    // Paketin ilk penceresi = mevcut pencere (tablette zaman kaymasi olsa dahi
    // en yakin gecerli token buradan gelir)
    const basMs = basPencere * pencereMs

    const tokenlar = []
    for (let i = 0; i < paketToken; i++) {
      const pencereNo = basPencere + i
      const gecerliBaslangic = pencereNo * pencereMs
      const gecerliBitis = gecerliBaslangic + pencereMs
      const token = tokenUret(terminal.id, pencereNo, gecerliBitis)
      tokenlar.push({
        token,
        gecerli_baslangic: new Date(gecerliBaslangic).toISOString(),
        gecerli_bitis: new Date(gecerliBitis).toISOString(),
      })
    }

    return NextResponse.json({
      ok: true,
      sunucu_zamani: new Date(nowMs).toISOString(),
      pencere_saniye: PENCERE_SANIYE,
      paket_baslangic: new Date(basMs).toISOString(),
      paket_bitis: new Date(basMs + paketToken * pencereMs).toISOString(),
      terminal: {
        ad: terminal.ad,
        firma_adi: (firma as any)?.firma_adi ?? '',
        proje_adi: (proje as any)?.ad ?? '',
        tip: (terminal as any).tip,  // 'GIRIS' | 'CIKIS' | 'TOGGLE'
      },
      tokenlar,
    }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, kod: 'SUNUCU_HATASI', hata: err?.message ?? 'Sunucu hatasi' },
      { headers: CORS },
    )
  }
}
