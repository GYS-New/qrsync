/**
 * GET /api/pdks/icerideki-personel
 * Tablet ekraninin sag paneli — is basi yapmis (acik) mesai kayitlari.
 *
 * Header: X-Terminal-Token
 *
 * Kurallar:
 *   - Kapsam: terminalin projesi
 *   - Acik kayitlar (cikis_saati IS NULL)
 *   - Siralama: giris_saati artan (eski ustte — mobil siralamiyor)
 *   - Tablet 8 sn'de bir cagirir; sorgu ucuz olmali
 *   - Basari: 200 + { ok:true, sunucu_zamani, personel: [...] }
 *   - Hata:   200 + { ok:false, kod, hata }
 *
 * ⚠️ KVKK: Yanit yalnizca ad_soyad + giris_saati icerir. Ekran tesis girisinde
 * herkese acik oldugu icin TC, telefon, e-posta, sicil no GONDERILMEZ.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
      .select('id, proje_id, firma_id, aktif, son_gorulme, pin, ad_kisalt, ses_acik, ses_duzey, pilde_kis, liste_gizle, paket_dakika, liste_poll_sn, vurgu_sn, cikis_goster_sn')
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
        { ok: false, kod: 'TERMINAL_PASIF', hata: 'Bu tablet pasif durumda.' },
        { headers: CORS },
      )
    }

    // son_gorulme guncelle — sadece 60 sn'den eski ise (yazma yukunu azalt).
    // Tablet 8 sn'de bir cagirir → dakikada 1 kez update yeter. Bkz. bug 141242b9.
    const sonGorulmeYas = terminal.son_gorulme ? Date.now() - new Date(terminal.son_gorulme).getTime() : Infinity
    if (sonGorulmeYas > 60000) {
      admin.from('pdks_terminalleri')
        .update({ son_gorulme: new Date().toISOString() })
        .eq('id', terminal.id)
        .then(() => {})  // fire-and-forget, response'u geciktirmesin
    }

    // liste_gizle=true ise (siki KVKK) hic sorgu bile yapma, bos liste don
    if ((terminal as any).liste_gizle === true) {
      return NextResponse.json({
        ok: true,
        sunucu_zamani: new Date().toISOString(),
        personel: [],
        ayarlar: {
          pin: (terminal as any).pin,
          ad_kisalt: (terminal as any).ad_kisalt,
          ses_acik: (terminal as any).ses_acik,
          ses_duzey: (terminal as any).ses_duzey,
          pilde_kis: (terminal as any).pilde_kis,
          liste_gizle: true,
          paket_dakika: (terminal as any).paket_dakika,
          liste_poll_sn: (terminal as any).liste_poll_sn,
          vurgu_sn: (terminal as any).vurgu_sn,
          cikis_goster_sn: (terminal as any).cikis_goster_sn,
        },
      }, { headers: CORS })
    }

    // Acik mesai kayitlari — terminalin projesi
    const { data: kayitlar, error } = await admin
      .from('personel_mesai_kayitlari')
      .select('id, user_id, giris_saati')
      .eq('proje_id', terminal.proje_id)
      .is('cikis_saati', null)
      .order('giris_saati', { ascending: true })
      .limit(200)  // makul ust sinir; tesis kalabaligi asamaz

    if (error) {
      return NextResponse.json(
        { ok: false, kod: 'SUNUCU_HATASI', hata: error.message },
        { headers: CORS },
      )
    }

    const userIds = [...new Set((kayitlar ?? []).map(k => k.user_id).filter(Boolean))] as string[]
    const { data: users } = userIds.length > 0
      ? await admin.from('users').select('id, isim_soyisim').in('id', userIds)
      : { data: [] as any[] }
    const userMap = new Map((users ?? []).map((u: any) => [u.id, u.isim_soyisim]))

    // KVKK: sadece ad_soyad + giris_saati
    const personel = (kayitlar ?? []).map(k => ({
      kayit_id: k.id,
      user_id: k.user_id,
      ad_soyad: userMap.get(k.user_id) ?? '—',
      giris_saati: k.giris_saati,
    }))

    return NextResponse.json({
      ok: true,
      sunucu_zamani: new Date().toISOString(),
      personel,
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
    return NextResponse.json(
      { ok: false, kod: 'SUNUCU_HATASI', hata: err?.message ?? 'Sunucu hatasi' },
      { headers: CORS },
    )
  }
}
