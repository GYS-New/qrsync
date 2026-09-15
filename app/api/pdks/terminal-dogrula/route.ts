/**
 * POST /api/pdks/terminal-dogrula
 * PDKS Tablet — ilk kurulumda bir kez cagirilir.
 *
 * Body:  { terminal_key: string, cihaz_id: string, app_versiyon?: string }
 * Onemli: hatalarda da HTTP 200 + { ok:false, hata } dondururuz — mobil ekip
 * tarafi 404 gordugunde "sunucu hatasi 404" gosterip kullaniciyi yaniltiyordu.
 *
 * Basari: { ok:true, terminal_token, terminal: { ad, firma_adi, proje_adi } }
 * Hata:   { ok:false, hata }
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { terminalTokenUret } from '@/lib/pdks/token'

export const runtime = 'nodejs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function POST(req: Request) {
  try {
    const admin = createAdminClient()

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ ok: false, hata: 'Gecersiz JSON' }, { headers: CORS })
    }

    const terminalKey = typeof body?.terminal_key === 'string' ? body.terminal_key.trim() : ''
    const cihazId     = typeof body?.cihaz_id === 'string' ? body.cihaz_id.trim() : ''
    if (!terminalKey) return NextResponse.json({ ok: false, hata: 'terminal_key gerekli' }, { headers: CORS })
    if (!cihazId)     return NextResponse.json({ ok: false, hata: 'cihaz_id gerekli' }, { headers: CORS })

    const { data: terminal } = await admin
      .from('pdks_terminalleri')
      .select('id, ad, firma_id, proje_id, aktif, cihaz_id, terminal_token, tip, pin, ad_kisalt, ses_acik, ses_duzey, pilde_kis, liste_gizle, paket_dakika, liste_poll_sn, vurgu_sn, cikis_goster_sn')
      .eq('terminal_key', terminalKey)
      .maybeSingle()

    if (!terminal) {
      return NextResponse.json(
        { ok: false, hata: 'Terminal anahtari gecersiz veya pasif.' },
        { headers: CORS },
      )
    }
    if (!terminal.aktif) {
      return NextResponse.json(
        { ok: false, hata: 'Terminal anahtari gecersiz veya pasif.' },
        { headers: CORS },
      )
    }

    // Ilk dogrulama: cihaz_id ve yeni terminal_token yaz.
    // Sonraki dogrulamalar: farkli cihaz_id ise reddet — terminal_key kopyalanip
    // baska cihaza takilmasi engellenir. Ayni cihaz tekrar cagirirsa yeni token verilir.
    if (terminal.cihaz_id && terminal.cihaz_id !== cihazId) {
      return NextResponse.json(
        { ok: false, hata: 'Bu terminal baska bir cihaza tanimli. Yoneticinize basvurun.' },
        { headers: CORS },
      )
    }

    const yeniTerminalToken = terminalTokenUret()
    const { error: upErr } = await admin
      .from('pdks_terminalleri')
      .update({
        cihaz_id: cihazId,
        terminal_token: yeniTerminalToken,
        son_gorulme: new Date().toISOString(),
        guncelleme_tarihi: new Date().toISOString(),
      })
      .eq('id', terminal.id)

    if (upErr) {
      return NextResponse.json({ ok: false, hata: 'Kayit hatasi: ' + upErr.message }, { headers: CORS })
    }

    // Firma + proje adi
    const [{ data: firma }, { data: proje }] = await Promise.all([
      admin.from('firmalar').select('firma_adi').eq('id', terminal.firma_id).maybeSingle(),
      admin.from('projeler').select('ad').eq('id', terminal.proje_id).maybeSingle(),
    ])

    return NextResponse.json({
      ok: true,
      terminal_token: yeniTerminalToken,
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
    }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json({ ok: false, hata: err?.message ?? 'Sunucu hatasi' }, { headers: CORS })
  }
}
