/**
 * POST /api/app/mesai-okut
 * Mobil uygulama — QR veya NFC okutulduğunda mesai giriş/çıkışı kaydeder.
 *
 * Header: X-Device-Token  — kayıtlı cihaz token'ı (zorunlu)
 * Body:   { token: string }  — mesai QR/NFC kodu
 *
 * Yanıt:
 *   GIRIS: { ok: true, sonuc: 'giris', tip: 'GIRIS', isim, mesai: { mesai_kayit_id, kayit_tarihi, giris_saati } }
 *   CIKIS: { ok: true, sonuc: 'cikis', tip: 'CIKIS', isim, mesai: null }
 *   Hata:  { ok: false, error: string }
 *
 * Not: mesai objesi offline-snapshot response'undaki mesai ile aynı formattadır.
 * Mobil, iş başı sonrası bu alanı lokal snapshot'a patch edebilir → offline'da
 * "önce iş başı" uyarısı almamak için snapshot'ı tekrar online indirmek gerekmez.
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
      .select('user_id, firma_id, isim_soyisim, proje_id')
      .eq('device_token', deviceToken)
      .single()

    if (tokenErr || !tokenData) {
      return NextResponse.json(
        { ok: false, error: 'Geçersiz veya eşleştirilmemiş cihaz' },
        { status: 401, headers: CORS }
      )
    }

    const { user_id: userId, firma_id: firmaId, isim_soyisim: isim, proje_id: personelProjeId } = tokenData

    // ── 1b. Kullanıcı aktif/pasif kontrolü ────────────────────────────────────
    const { data: userData } = await admin.from('users').select('aktif').eq('id', userId).single()
    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF' },
        { status: 403, headers: CORS }
      )
    }

    // ── 2. Body: mesai QR/NFC token ───────────────────────────────────────────
    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json(
        { ok: false, error: 'Geçersiz JSON' },
        { status: 400, headers: CORS }
      )
    }

    // iOS bazı QR/NFC okuyucular token sonuna \n veya boşluk ekleyebilir — trim şart
    const mesaiTokenRaw = body?.token as string | undefined
    const mesaiToken = typeof mesaiTokenRaw === 'string' ? mesaiTokenRaw.trim() : mesaiTokenRaw
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
        { ok: false, error: 'Geçersiz mesai kodu', durum: 'mesai_kodu_degil' },
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

    // ── 4b. Proje eşleşmesi ───────────────────────────────────────────────────
    // QR'ın proje_id'si varsa, personelin kayıtlı olduğu projeyle eşleşmeli
    if (qr.proje_id && personelProjeId && qr.proje_id !== personelProjeId) {
      return NextResponse.json(
        { ok: false, error: 'Bu mesai kodu projenize ait değil', durum: 'proje_eslesmedi' },
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

    // ── 5. TR bugün ve dün (V3 sarkan mesai icin) ────────────────────────────
    // BUG FIX 26.08.2026: Onceki kod sadece kayit_tarihi=bugun arıyordu.
    // V3 calisani (16:00-24:00) 25.08 17:00 giris (kayit=25.08), 26.08 00:10
    // cikis QR okuttugunda sistem 26.08 kayit aradiği icin bulamiyor:
    //   - CIKIS ise: "Acik kayit yok" 409 hatasi
    //   - GIRIS ise: yeni kayit acar (25.08 NULL kalir, cift kayit)
    // Fix: son 2 TR gunundeki (bugun VEYA dun) acik kaydi da yakala.
    const bugun  = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
    const simdi  = new Date().toISOString()
    const dun    = new Date(Date.now() + 3 * 3600 * 1000 - 24 * 3600 * 1000).toISOString().slice(0, 10)

    // ── 6. Son 2 TR gunundeki en son acik kayit ─────────────────────────────
    let mevQ = admin
      .from('personel_mesai_kayitlari')
      .select('id, kayit_tarihi, giris_saati, cikis_saati')
      .eq('user_id', userId)
      .in('kayit_tarihi', [bugun, dun])
      .is('cikis_saati', null)
      .order('giris_saati', { ascending: false })
      .limit(1)

    if (qr.proje_id) mevQ = (mevQ as any).eq('proje_id', qr.proje_id)

    const { data: mevcutList } = await mevQ
    const mevcut = mevcutList?.[0] ?? null

    // ── 7. Giriş ─────────────────────────────────────────────────────────────
    if (qr.tip === 'GIRIS') {
      if (mevcut && !mevcut.cikis_saati) {
        return NextResponse.json(
          { ok: false, error: 'Bugün için zaten iş başı yapıldı', durum: 'zaten_acik' },
          { status: 409, headers: CORS }
        )
      }
      const { data: yeniMesai, error } = await admin.from('personel_mesai_kayitlari').insert({
        user_id:      userId,
        firma_id:     firmaId,
        proje_id:     qr.proje_id ?? null,
        kayit_tarihi: bugun,
        giris_saati:  simdi,
        giris_tipi:   'MOBIL',
      }).select('id, kayit_tarihi, giris_saati').single()
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS })
      }

      await admin.from('device_tokens')
        .update({ son_kullanim: simdi })
        .eq('device_token', deviceToken)

      // mesai objesi: offline-snapshot response'undaki mesai alanıyla AYNI format.
      // Mobil bunu lokal snapshot.mesai'ye patch edip uçak moduna geçince
      // "önce iş başı" uyarısı almaz — snapshot'ı tekrar online indirmeye gerek kalmaz.
      return NextResponse.json(
        {
          ok: true, sonuc: 'giris', tip: 'GIRIS', isim,
          mesai: yeniMesai
            ? { mesai_kayit_id: yeniMesai.id, kayit_tarihi: yeniMesai.kayit_tarihi, giris_saati: yeniMesai.giris_saati }
            : null,
        },
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

      // Çıkışta mobil lokal snapshot.mesai'yi temizlesin — null gönderiyoruz.
      return NextResponse.json(
        { ok: true, sonuc: 'cikis', tip: 'CIKIS', isim, mesai: null },
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
