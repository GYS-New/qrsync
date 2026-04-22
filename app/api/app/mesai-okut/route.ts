/**
 * POST /api/app/mesai-okut
 * Mobil uygulama — QR veya NFC okutulduğunda mesai giriş/çıkışı kaydeder.
 *
 * Header: X-Device-Token  — kayıtlı cihaz token'ı (zorunlu)
 * Body:
 *   token: string                   — mesai QR/NFC kodu
 *   offline?: true                  — çevrimdışı kuyruktan geliyorsa
 *   yerel_zaman?: ISO string        — cihazın okutma anındaki zamanı (offline'da giris/cikis_saati
 *                                     ve kayit_tarihi bu zamana göre yazılır)
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

    // Offline queue senkronu — cihaz çevrimdışıyken okutulan mesai sonradan geliyorsa.
    // `yerel_zaman` cihazın okutma anındaki ISO damgası; kayit_tarihi ve giris/cikis_saati
    // bu damgaya göre yazılır. Clock skew için 5dk future, 7 gün past tolerans.
    const offlineSenkron = body?.offline === true
    const yerelZamanRaw = typeof body?.yerel_zaman === 'string' ? body.yerel_zaman : null
    const yerelZamanValid = (() => {
      if (!yerelZamanRaw) return null
      const t = new Date(yerelZamanRaw).getTime()
      if (!Number.isFinite(t)) return null
      const now = Date.now()
      if (t > now + 5 * 60 * 1000) return null
      if (t < now - 7 * 24 * 60 * 60 * 1000) return null
      return new Date(t).toISOString()
    })()

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

    // ── 5. Olay zamanı ve TR günü ─────────────────────────────────────────────
    // Offline senkronda cihazın yerel zamanı kullanılır (ağ geldiğinde gönderim
    // anı değil, gerçek okutma anı). TR günü bu zamana göre hesaplanır ki
    // çevrimdışı kayıtlar doğru güne yazılsın.
    const simdi  = new Date().toISOString()
    const eventIso = (offlineSenkron && yerelZamanValid) ? yerelZamanValid : simdi
    const eventTrDay = new Date(eventIso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
    const kanal = offlineSenkron ? 'MOBIL_OFFLINE' : 'MOBIL'

    // ── 6. İlgili güne ait en son açık kayıt ─────────────────────────────────
    let mevQ = admin
      .from('personel_mesai_kayitlari')
      .select('id, giris_saati, cikis_saati')
      .eq('user_id', userId)
      .eq('kayit_tarihi', eventTrDay)
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
      const { error } = await admin.from('personel_mesai_kayitlari').insert({
        user_id:      userId,
        firma_id:     firmaId,
        proje_id:     qr.proje_id ?? null,
        kayit_tarihi: eventTrDay,
        giris_saati:  eventIso,
        giris_tipi:   kanal,
      })
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS })
      }

      // Cihaz son kullanım güncelle — server now, offline olsa bile gerçek temas anı
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
        .update({ cikis_saati: eventIso, cikis_tipi: kanal })
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
