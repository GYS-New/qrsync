import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { ardisikBaslatmaKontrol } from '@/lib/tasks/ardisikKontrol'
import { devamEdenGorevKontrol } from '@/lib/tasks/devamEdenGorevKontrol'
import { ekstraMukerrer5dkKontrol } from '@/lib/tasks/ekstraLokasyonKontrol'
import { vardiyaGunuHesapla, type VardiyaAyar } from '@/lib/gorev/vardiyaGunu'
import { getEffectiveVardiya } from '@/lib/vardiya/getEffective'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

/**
 * EKSTRA FREKANSİYEL GÖREV — BAŞLAT (mobil v1.0.28+ akışı)
 *
 * Spec: docs/MOBIL_EKIBE_EKSTRA_FREKANS.md (2026-06-02 revize, OYAK RENAULT talebi)
 *
 * Eski tek-tıkla kayıt akışında (POST /api/app/ekstra-frekans) personel
 * QR okutup tanım seçip "Kaydet" diyordu → görev anında TAMAMLANDI, süre=0.
 * Yeni akışta personel gerekçe yazıp "Başlat" diyor → durum=ISLEMDE,
 * baslatilma_tarihi=now. Tamamla çağrısı süreyi otomatik hesaplar.
 *
 * Kayıt: canli_gorevler — kural_id=NULL, durum='ISLEMDE', aciklama=gerekce
 *
 * Geriye uyumluluk: eski /api/app/ekstra-frekans endpoint'i v1.0.27 ve
 * öncesi için DOKUNULMADAN korunur (tek POST, TAMAMLANDI, süre=0).
 */
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

    const lokasyonId    = body?.lokasyon_id as string | undefined
    const gorevTanimRaw = body?.gorev_tanim
    const gorevTanim    = typeof gorevTanimRaw === 'string' ? gorevTanimRaw.trim() : ''
    const gerekceRaw    = body?.gerekce
    const gerekce       = typeof gerekceRaw === 'string' ? gerekceRaw.trim() : ''
    const scanTokenRaw  = body?.scan_token
    const scanToken     = typeof scanTokenRaw === 'string' ? scanTokenRaw.trim() : scanTokenRaw

    if (!lokasyonId) {
      return NextResponse.json({ ok: false, error: 'lokasyon_id gerekli' }, { status: 400, headers: CORS })
    }
    if (!gorevTanim || gorevTanim.length < 3) {
      return NextResponse.json(
        { ok: false, error: 'Görev tanımı zorunlu (en az 3 karakter)', code: 'GOREV_TANIM_GEREKLI' },
        { status: 400, headers: CORS }
      )
    }
    if (gorevTanim.length > 200) {
      return NextResponse.json(
        { ok: false, error: 'Görev tanımı en fazla 200 karakter olabilir', code: 'GOREV_TANIM_UZUN' },
        { status: 400, headers: CORS }
      )
    }
    if (!gerekce || gerekce.length < 10) {
      return NextResponse.json(
        { ok: false, error: 'Gerekçe zorunlu (en az 10 karakter). Lütfen ekstra görevi neden yaptığınızı yazın.', code: 'GEREKCE_KISA' },
        { status: 400, headers: CORS }
      )
    }
    if (gerekce.length > 1000) {
      return NextResponse.json(
        { ok: false, error: 'Gerekçe en fazla 1000 karakter olabilir', code: 'GEREKCE_UZUN' },
        { status: 400, headers: CORS }
      )
    }

    // Lokasyon kontrol + QR/NFC doğrulama hazırlığı
    const { data: lok } = await admin
      .from('lokasyonlar')
      .select('id, firma_id, proje_id, tanim, parent_id, tamamlama_qr_zorunlu, sureli_gorev_aktif, qr_veri, nfc_token, aktif')
      .eq('id', lokasyonId)
      .single()

    if (!lok) {
      return NextResponse.json({ ok: false, error: 'Lokasyon bulunamadı' }, { status: 404, headers: CORS })
    }
    if (lok.firma_id !== firmaId) {
      return NextResponse.json({ ok: false, error: 'Bu lokasyona erişim yetkiniz yok' }, { status: 403, headers: CORS })
    }
    if (lok.aktif === false) {
      return NextResponse.json({ ok: false, error: 'Lokasyon pasif durumda', code: 'LOKASYON_PASIF' }, { status: 409, headers: CORS })
    }

    // Oto yıkama üst lokasyonları yeni akıştan HARIÇ — onlar mevcut tek-POST
    // /api/app/ekstra-frekans'tan devam ediyor (plaka + KM + foto farklı UI).
    if (lok.parent_id) {
      const { data: ustLok } = await admin
        .from('lokasyonlar')
        .select('oto_yikama_lokasyon')
        .eq('id', lok.parent_id)
        .single()
      if ((ustLok as any)?.oto_yikama_lokasyon) {
        return NextResponse.json(
          { ok: false, error: 'Oto yıkama lokasyonları için bu endpoint kullanılmaz — eski /api/app/ekstra-frekans kullanın.', code: 'OTO_YIKAMA_ICIN_GECERSIZ' },
          { status: 400, headers: CORS }
        )
      }
    }

    // QR/NFC doğrulama — lokasyonda aktifse zorunlu
    if (lok.tamamlama_qr_zorunlu && lok.sureli_gorev_aktif) {
      if (!scanToken) {
        return NextResponse.json(
          { ok: false, error: 'Bu lokasyonda ekstra görev için QR veya NFC okutmanız gerekiyor.', code: 'QR_NFC_ZORUNLU' },
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

    // Aktif kural görevi kontrolü — sadece ACIK/ISLEMDE engeller.
    // BEKLEMEDE = vardiya geçmiş, PD cron'un ZG'ye çekeceği görev; personelin
    // tamamlama yükümlülüğü yok → ekstra görev başlatmayı engellememeli.
    // Atanan filtresi: başka kullanıcıya atanmış görev User B'nin ekstra
    // başlatmasını engellemesin (Mobile UI atanan_kullanici_id ile filtreliyor;
    // backend tutarlılığı için aynı mantık). Yani sadece atanmamış veya bu
    // kullanıcıya atanmış aktif görev varsa engelle.
    const { data: aktifKural } = await admin
      .from('canli_gorevler')
      .select('id, durum')
      .eq('lokasyon_id', lokasyonId)
      .not('kural_id', 'is', null)
      .in('durum', ['ACIK', 'ISLEMDE'])
      .or(`atanan_kullanici_id.is.null,atanan_kullanici_id.eq.${userId}`)
      .limit(1)

    if (aktifKural && aktifKural.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Bu lokasyonda tamamlanmamış frekans görevi var. Önce mevcut görevinizi tamamlayın.',
          code: 'AKTIF_KURAL_GOREV_VAR',
        },
        { status: 409, headers: CORS }
      )
    }

    // Görev tanımı doğrulama — lokasyonun aktif kurallarında olmalı
    const { data: lokKurallar } = await admin
      .from('gorev_kurallari')
      .select('tanim')
      .eq('lokasyon_id', lokasyonId)
      .eq('aktif', true)
    const izinliTanimlar = new Set(
      ((lokKurallar ?? []) as any[])
        .map((k: any) => (typeof k.tanim === 'string' ? k.tanim.trim() : ''))
        .filter(Boolean)
    )
    if (izinliTanimlar.size === 0) {
      return NextResponse.json(
        { ok: false, error: 'Bu lokasyonda tanımlı kural görevi yok — ekstra görev başlatılamaz.', code: 'KURAL_YOK' },
        { status: 409, headers: CORS }
      )
    }
    if (!izinliTanimlar.has(gorevTanim)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Görev tanımı bu lokasyonun tanımlı kural listesinden biri olmalı.',
          code: 'GOREV_TANIM_GECERSIZ',
          izinli_tanimlar: [...izinliTanimlar],
        },
        { status: 400, headers: CORS }
      )
    }

    // Lokasyon bazlı 5dk mükerrer engelleme (yeni akış için)
    const mukerrerHata = await ekstraMukerrer5dkKontrol(admin, userId, lokasyonId)
    if (mukerrerHata) {
      return NextResponse.json(
        { ok: false, error: mukerrerHata, code: 'MUKERRER_EKSTRA' },
        { status: 429, headers: CORS },
      )
    }

    // Ardışık başlatma süre kontrolü
    const ardisikHata = await ardisikBaslatmaKontrol(
      admin, userId, firmaId, lok.proje_id ?? personelProjeId ?? null,
    )
    if (ardisikHata) {
      return NextResponse.json(
        { ok: false, error: ardisikHata, code: 'ARDISIK_BEKLEME' },
        { status: 429, headers: CORS },
      )
    }

    // Aktif görev (ISLEMDE) kontrolü
    const devamEden = await devamEdenGorevKontrol(admin, userId, firmaId)
    if (devamEden) {
      return NextResponse.json({
        ok: false,
        error: `Aktif başka bir göreviniz var: "${devamEden.tanim ?? '—'}"${devamEden.lokasyon_tanim ? ` (${devamEden.lokasyon_tanim})` : ''}. Önce onu tamamlayın.`,
        code: 'DEVAM_EDEN_GOREV',
        aktifGorev: devamEden,
      }, { status: 409, headers: CORS })
    }

    const nowIso = new Date().toISOString()

    // vardiya_gunu hesabı — proje override > firma fallback (mig 094)
    const gorevProjeId = lok.proje_id ?? personelProjeId ?? null
    let vardiyaGunu: string
    try {
      const ev = await getEffectiveVardiya(admin, firmaId, gorevProjeId)
      const sayisi = ev.vardiya_sayisi ?? 3
      const set = ((ev.tum_vardiya_ayarlari ?? {})[String(sayisi)] ?? []) as VardiyaAyar[]
      vardiyaGunu = vardiyaGunuHesapla(Array.isArray(set) ? set : [], nowIso)
    } catch {
      vardiyaGunu = new Date(nowIso).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
    }

    const { data: insertedRows, error: insertErr } = await admin
      .from('canli_gorevler')
      .insert({
        firma_id:                firmaId,
        proje_id:                lok.proje_id ?? personelProjeId ?? null,
        lokasyon_id:             lokasyonId,
        tanim:                   gorevTanim,
        aciklama:                gerekce,
        kural_id:                null,
        gunluk_frekans_sayisi:   0,
        durum:                   'ISLEMDE',
        aktif_olma_tarihi:       nowIso,
        olusturma_tarihi:        nowIso,
        baslatilma_tarihi:       nowIso,
        durum_degisim_tarihi:    nowIso,
        olusturan_id:            userId,
        baslatan_kullanici_id:   userId,
        islemi_yapan_id:         userId,
        vardiya_gunu:            vardiyaGunu,
      } as any)
      .select('id, baslatilma_tarihi')

    if (insertErr || !insertedRows || insertedRows.length === 0) {
      // PG unique constraint (23505) — DB-level "personel ISLEMDE'de tek görev"
      // garantisi. devamEdenGorevKontrol race condition / atanan filtre nedeniyle
      // yakalayamamış olabilir. Kullanıcı dostu mesajla 409 dön.
      const isDuplicate =
        (insertErr as any)?.code === '23505' ||
        (insertErr?.message ?? '').includes('canli_gorevler_personel_islemde_uniq')
      if (isDuplicate) {
        return NextResponse.json({
          ok: false,
          error: 'Aktif başka bir göreviniz var. Önce onu tamamlayın, sonra ekstra görev başlatın.',
          code: 'DEVAM_EDEN_GOREV',
        }, { status: 409, headers: CORS })
      }
      console.error('[ekstra-frekans/baslat] insert error:', insertErr)
      return NextResponse.json(
        { ok: false, error: 'Ekstra görev başlatılamadı. Lütfen tekrar deneyin.' },
        { status: 500, headers: CORS }
      )
    }
    const yeniGorev = insertedRows[0] as any
    const yeniGorevId = yeniGorev.id as string

    // Device token son kullanım
    await admin
      .from('device_tokens')
      .update({ son_kullanim: nowIso })
      .eq('device_token', deviceToken)

    void auditLog({
      tip: 'ekstra_frekans_baslat',
      tablo: 'canli_gorevler',
      firma_id: firmaId,
      kullanici_id: userId,
      detay: {
        gorev_id: yeniGorevId,
        lokasyon_id: lokasyonId,
        lokasyon_tanim: lok.tanim ?? null,
        tanim: gorevTanim,
        gerekce_uzunluk: gerekce.length,
        kanal: 'MOBIL',
      },
    })

    return NextResponse.json({
      ok: true,
      mesaj: 'Ekstra görev başlatıldı',
      gorev_id: yeniGorevId,
      baslatilma_tarihi: yeniGorev.baslatilma_tarihi,
    }, { headers: CORS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
