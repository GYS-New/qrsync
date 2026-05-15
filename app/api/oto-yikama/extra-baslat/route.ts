/**
 * POST /api/oto-yikama/extra-baslat
 *
 * Mobilden personel "Ekstra Yıkama" başlatır. Planlanmamış bir araç yıkanır.
 * Kayıt:
 *   - gorevler: tanim = "Oto Yıkama - PLAKA (Ekstra)", durum=ISLEMDE,
 *     baslatilma_tarihi=now, baslatan_kullanici_id=user
 *   - oto_yikama_gorev_metadata: ekstra=true, hedef_tarih=today
 *
 * Doğrulamalar:
 *   - X-Device-Token geçerli
 *   - Lokasyon Oto Yıkama altında (üst lokasyon.oto_yikama_lokasyon=true)
 *   - QR/NFC zorunluysa scan_token eşleşir
 *   - Araç firmaya ait + aktif
 *   - Ardışık başlatma süresi geçti
 *   - Kullanıcının açık başka görevi yok
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { ardisikBaslatmaKontrol } from '@/lib/tasks/ardisikKontrol'
import { devamEdenGorevKontrol } from '@/lib/tasks/devamEdenGorevKontrol'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

function todayLocalDate(): string {
  const now = new Date()
  const tz = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - tz).toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  try {
    const admin = createAdminClient()

    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401, headers: CORS })
    }

    const { data: tokenData } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, proje_id')
      .eq('device_token', deviceToken)
      .single()

    if (!tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
    }

    const { user_id: userId, firma_id: firmaId, proje_id: personelProjeId } = tokenData

    const { data: userData } = await admin.from('users').select('aktif').eq('id', userId).single()
    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF' },
        { status: 403, headers: CORS }
      )
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400, headers: CORS })
    }

    const lokasyonId = typeof body?.lokasyon_id === 'string' ? body.lokasyon_id : null
    const aracId     = typeof body?.arac_id === 'string' ? body.arac_id : null
    const scanTokenRaw = body?.scan_token
    const scanToken = typeof scanTokenRaw === 'string' ? scanTokenRaw.trim() : null

    if (!lokasyonId) return NextResponse.json({ ok: false, error: 'lokasyon_id gerekli' }, { status: 400, headers: CORS })
    if (!aracId)     return NextResponse.json({ ok: false, error: 'arac_id gerekli' }, { status: 400, headers: CORS })

    // Lokasyon + üst lokasyon kontrolü (Oto Yıkama altı olmalı)
    const { data: lok } = await admin
      .from('lokasyonlar')
      .select('id, firma_id, proje_id, tanim, parent_id, tamamlama_qr_zorunlu, sureli_gorev_aktif, qr_veri, nfc_token, aktif')
      .eq('id', lokasyonId)
      .single()

    if (!lok) return NextResponse.json({ ok: false, error: 'Lokasyon bulunamadı' }, { status: 404, headers: CORS })
    if (lok.firma_id !== firmaId) {
      return NextResponse.json({ ok: false, error: 'Bu lokasyona erişim yetkiniz yok' }, { status: 403, headers: CORS })
    }
    if (lok.aktif === false) {
      return NextResponse.json({ ok: false, error: 'Lokasyon pasif durumda', code: 'LOKASYON_PASIF' }, { status: 409, headers: CORS })
    }

    // Üst lokasyon Oto Yıkama mı?
    if (!lok.parent_id) {
      return NextResponse.json(
        { ok: false, error: 'Bu lokasyon Oto Yıkama alt lokasyonu değil (üst lokasyon olmalı).', code: 'OTO_YIKAMA_LOKASYON_DEGIL' },
        { status: 400, headers: CORS }
      )
    }
    const { data: ustLok } = await admin
      .from('lokasyonlar')
      .select('oto_yikama_lokasyon')
      .eq('id', lok.parent_id)
      .single()
    if (!ustLok?.oto_yikama_lokasyon) {
      return NextResponse.json(
        { ok: false, error: 'Bu lokasyon Oto Yıkama lokasyonu değil.', code: 'OTO_YIKAMA_LOKASYON_DEGIL' },
        { status: 400, headers: CORS }
      )
    }

    // QR/NFC doğrulama
    if (lok.tamamlama_qr_zorunlu && lok.sureli_gorev_aktif) {
      if (!scanToken) {
        return NextResponse.json(
          { ok: false, error: 'Bu lokasyonda ekstra yıkama için QR veya NFC okutmanız gerekiyor.', code: 'QR_NFC_ZORUNLU' },
          { status: 403, headers: CORS }
        )
      }
      const qrOk  = lok.qr_veri && scanToken === lok.qr_veri
      const nfcOk = lok.nfc_token && scanToken === lok.nfc_token
      if (!qrOk && !nfcOk) {
        return NextResponse.json(
          { ok: false, error: 'Okutulan QR/NFC kodu bu lokasyonla eşleşmiyor.', code: 'QR_NFC_ESLESMEDI' },
          { status: 403, headers: CORS }
        )
      }
    }

    // Araç doğrulama
    const { data: arac } = await admin
      .from('araclar')
      .select('id, firma_id, plaka, aktif')
      .eq('id', aracId)
      .single()
    if (!arac) return NextResponse.json({ ok: false, error: 'Araç bulunamadı' }, { status: 404, headers: CORS })
    if (arac.firma_id !== firmaId) {
      return NextResponse.json({ ok: false, error: 'Araç farklı firmaya ait' }, { status: 403, headers: CORS })
    }
    if (arac.aktif === false) {
      return NextResponse.json({ ok: false, error: 'Araç pasif durumda', code: 'ARAC_PASIF' }, { status: 409, headers: CORS })
    }

    // Ardışık başlatma süresi
    const ardisikHata = await ardisikBaslatmaKontrol(
      admin,
      userId,
      firmaId,
      lok.proje_id ?? personelProjeId ?? null,
    )
    if (ardisikHata) {
      return NextResponse.json(
        { ok: false, error: ardisikHata, code: 'ARDISIK_BEKLEME' },
        { status: 429, headers: CORS },
      )
    }

    // Devam eden görev kontrolü
    const devamEden = await devamEdenGorevKontrol(admin, userId, firmaId)
    if (devamEden) {
      return NextResponse.json({
        ok: false,
        error: `Aktif başka bir göreviniz var: "${devamEden.tanim ?? '—'}"${devamEden.lokasyon_tanim ? ` (${devamEden.lokasyon_tanim})` : ''}. Önce onu tamamlayın.`,
        code: 'DEVAM_EDEN_GOREV',
        aktifGorev: devamEden,
      }, { status: 409, headers: CORS })
    }

    const today = todayLocalDate()
    const nowIso = new Date().toISOString()

    // 1) gorevler INSERT — direkt ISLEMDE (başlatılmış)
    const { data: insertedGorev, error: gorevErr } = await admin
      .from('gorevler')
      .insert({
        firma_id: firmaId,
        proje_id: lok.proje_id ?? personelProjeId ?? null,
        tanim: `Oto Yıkama - ${arac.plaka} (Ekstra)`,
        lokasyon_id: lokasyonId,
        atanan_kullanici_id: null,
        durum: 'ISLEMDE',
        olusturan_id: userId,
        baslatan_kullanici_id: userId,
        baslatilma_tarihi: nowIso,
        islemi_yapan_id: userId,
        durum_degisim_tarihi: nowIso,
      })
      .select('id')
      .single()

    if (gorevErr || !insertedGorev) {
      return NextResponse.json(
        { ok: false, error: gorevErr?.message ?? 'Görev oluşturulamadı' },
        { status: 500, headers: CORS }
      )
    }
    const yeniGorevId = insertedGorev.id

    // 2) metadata INSERT — ekstra=true
    const { error: metaErr } = await admin
      .from('oto_yikama_gorev_metadata')
      .insert({
        gorev_id: yeniGorevId,
        arac_id: aracId,
        plaka_snapshot: arac.plaka,
        hedef_tarih: today,
        ekstra: true,
      })

    if (metaErr) {
      // Rollback gorev
      await admin.from('gorevler').delete().eq('id', yeniGorevId)
      return NextResponse.json(
        { ok: false, error: 'metadata yazılamadı: ' + metaErr.message },
        { status: 500, headers: CORS }
      )
    }

    // Device token son kullanım
    await admin.from('device_tokens').update({ son_kullanim: nowIso }).eq('device_token', deviceToken)

    void auditLog({
      tip: 'oto_yikama_ekstra_baslat',
      tablo: 'gorevler',
      firma_id: firmaId,
      kullanici_id: userId,
      detay: {
        gorev_id: yeniGorevId,
        lokasyon_id: lokasyonId,
        lokasyon_tanim: lok.tanim,
        arac_id: aracId,
        plaka: arac.plaka,
        hedef_tarih: today,
      },
    })

    return NextResponse.json({
      ok: true,
      mesaj: 'Ekstra yıkama başlatıldı',
      gorev_id: yeniGorevId,
      plaka: arac.plaka,
      lokasyon_id: lokasyonId,
      baslatilma_tarihi: nowIso,
    }, { headers: CORS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
