/**
 * POST /api/app/mesai-okut
 * Mobil uygulama — QR veya NFC okutulduğunda mesai giriş/çıkışı kaydeder.
 *
 * Header: X-Device-Token  — kayıtlı cihaz token'ı (zorunlu)
 * Body:   { token: string }  — mesai QR/NFC kodu
 *
 * Yanıt:
 *   { ok: true,  sonuc: 'giris'|'cikis', isim: string, tip: 'GIRIS'|'CIKIS' }
 *   { ok: false, error: string }
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function POST(req: Request) {
  try {
    const admin = createAdminClient()

    // ── 1. Cihaz doğrulama ────────────────────────────────────────────────────
    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json(
        { ok: false, error: 'X-Device-Token gerekli' },
        { status: 401, headers: CORS }
      )
    }

    const { data: tokenData, error: tokenErr } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, isim_soyisim')
      .eq('device_token', deviceToken)
      .single()

    if (tokenErr || !tokenData) {
      return NextResponse.json(
        { ok: false, error: 'Geçersiz veya eşleştirilmemiş cihaz' },
        { status: 401, headers: CORS }
      )
    }

    const { user_id: userId, firma_id: firmaId, isim_soyisim: isim } = tokenData

    // ── 2. Body: mesai QR/NFC token ───────────────────────────────────────────
    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json(
        { ok: false, error: 'Geçersiz JSON' },
        { status: 400, headers: CORS }
      )
    }

    const mesaiToken = body?.token as string | undefined
    if (!mesaiToken) {
      return NextResponse.json(
        { ok: false, error: 'token alanı gerekli' },
        { status: 400, headers: CORS }
      )
    }

    // ── 3. Mesai QR/NFC kaydını bul ───────────────────────────────────────────
    const { data: qrByToken } = await admin
      .from('mesai_qr_kodlari')
      .select('id, firma_id, proje_id, tip, aktif')
      .eq('token', mesaiToken)
      .maybeSingle()

    const { data: qrByNfc } = !qrByToken
      ? await admin
          .from('mesai_qr_kodlari')
          .select('id, firma_id, proje_id, tip, aktif')
          .eq('nfc_token', mesaiToken)
          .maybeSingle()
      : { data: null }

    const qr = qrByToken ?? qrByNfc

    if (!qr) {
      return NextResponse.json(
        { ok: false, error: 'Geçersiz mesai kodu' },
        { status: 404, headers: CORS }
      )
    }

    if (!qr.aktif) {
      return NextResponse.json(
        { ok: false, error: 'Bu mesai kodu artık aktif değil' },
        { status: 403, headers: CORS }
      )
    }

    // ── 4. Firma eşleşmesi ────────────────────────────────────────────────────
    if (qr.firma_id !== firmaId) {
      return NextResponse.json(
        { ok: false, error: 'Bu mesai kodu firmanıza ait değil' },
        { status: 403, headers: CORS }
      )
    }

    // Firma personel takibi aktif mi?
    const { data: firma } = await admin
      .from('firmalar')
      .select('personel_takibi_aktif')
      .eq('id', qr.firma_id)
      .single()

    if (!firma?.personel_takibi_aktif) {
      return NextResponse.json(
        { ok: false, error: 'Bu firma için personel takibi aktif değil' },
        { status: 403, headers: CORS }
      )
    }

    // Proje personel takibi aktif mi?
    if (qr.proje_id) {
      const { data: proje } = await admin
        .from('projeler')
        .select('personel_takibi_aktif')
        .eq('id', qr.proje_id)
        .single()

      if (!proje?.personel_takibi_aktif) {
        return NextResponse.json(
          { ok: false, error: 'Bu proje için personel takibi aktif değil' },
          { status: 403, headers: CORS }
        )
      }
    }

    // ── 5. TRT bugün ──────────────────────────────────────────────────────────
    const trtNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
    const bugun  = trtNow.toISOString().split('T')[0]
    const simdi  = new Date().toISOString()

    // ── 6. Bugünkü açık kayıt ─────────────────────────────────────────────────
    let mevQ = admin
      .from('personel_mesai_kayitlari')
      .select('id, giris_saati, cikis_saati')
      .eq('user_id', userId)
      .eq('kayit_tarihi', bugun)
      .eq('arsivlendi', false)

    if (qr.proje_id) mevQ = (mevQ as any).eq('proje_id', qr.proje_id)

    const { data: mevcut } = await mevQ.maybeSingle()

    // ── 7. Giriş ─────────────────────────────────────────────────────────────
    if (qr.tip === 'GIRIS') {
      if (mevcut && !mevcut.cikis_saati) {
        return NextResponse.json(
          { ok: false, error: 'Bugün için zaten iş başı yapıldı', durum: 'zaten_acik' },
          { status: 409, headers: CORS }
        )
      }
      const { error } = await admin.from('personel_mesai_kayitlari').insert({
        user_id:      userId,
        firma_id:     firmaId,
        proje_id:     qr.proje_id ?? null,
        kayit_tarihi: bugun,
        giris_saati:  simdi,
        giris_tipi:   'MOBIL',
      })
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS })
      }

      // Cihaz son kullanım güncelle
      await admin.from('device_tokens')
        .update({ son_kullanim: simdi })
        .eq('device_token', deviceToken)

      return NextResponse.json(
        { ok: true, sonuc: 'giris', tip: 'GIRIS', isim },
        { headers: CORS }
      )
    }

    // ── 8. Çıkış ─────────────────────────────────────────────────────────────
    if (qr.tip === 'CIKIS') {
      if (!mevcut || mevcut.cikis_saati) {
        return NextResponse.json(
          { ok: false, error: 'Açık iş başı kaydı bulunamadı', durum: 'kayit_yok' },
          { status: 409, headers: CORS }
        )
      }
      const { error } = await admin
        .from('personel_mesai_kayitlari')
        .update({ cikis_saati: simdi, cikis_tipi: 'MOBIL' })
        .eq('id', mevcut.id)
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS })
      }

      await admin.from('device_tokens')
        .update({ son_kullanim: simdi })
        .eq('device_token', deviceToken)

      return NextResponse.json(
        { ok: true, sonuc: 'cikis', tip: 'CIKIS', isim },
        { headers: CORS }
      )
    }

    return NextResponse.json(
      { ok: false, error: 'Bilinmeyen mesai kodu tipi' },
      { status: 400, headers: CORS }
    )

  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Sunucu hatası' },
      { status: 500, headers: CORS }
    )
  }
}
