import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { gorevDurumPayload } from '@/lib/gorev/durum-degistir'
import { ardisikBaslatmaKontrol } from '@/lib/tasks/ardisikKontrol'
import { devamEdenGorevKontrol } from '@/lib/tasks/devamEdenGorevKontrol'
import { vardiyaGunuHesapla, type VardiyaAyar } from '@/lib/gorev/vardiyaGunu'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

/**
 * EKSTRA FREKANSİYEL GÖREV KAYDI
 *
 * Operatör lokasyonun QR/NFC kodunu okutup, kural tarafından üretilen
 * görevlerden fazla yaptığı frekansiyel işi sisteme kaydeder.
 *
 * Kayıt: canli_gorevler — kural_id=NULL, durum='TAMAMLANDI'
 *
 * Rapor tarafında:
 *  - Hedef hesabına GİRMEZ
 *  - Tamamlanan'a eklenir → başarı oranı %100'ü geçebilir (örn %115)
 *  - "Frekans Dışı Çalışmalar (Ekstra Frekansiyel)" bölümünde listelenir
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

    const lokasyonId     = body?.lokasyon_id as string | undefined
    const gorevTanimRaw  = body?.gorev_tanim
    const gorevTanim     = typeof gorevTanimRaw === 'string' ? gorevTanimRaw.trim() : ''
    const scanTokenRaw   = body?.scan_token
    const scanToken      = typeof scanTokenRaw === 'string' ? scanTokenRaw.trim() : scanTokenRaw

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

    // ── Oto Yıkama dal: lokasyonun üst lokasyonu oto_yikama_lokasyon=true ise
    //   "ekstra görev" plaka bazlı çalışır. Kural kontrolü atlanır, canli_gorevler
    //   yerine gorevler + oto_yikama_gorev_metadata yazılır.
    let ustOtoYikama = false
    if (lok.parent_id) {
      const { data: ustLok } = await admin
        .from('lokasyonlar')
        .select('oto_yikama_lokasyon')
        .eq('id', lok.parent_id)
        .single()
      ustOtoYikama = !!(ustLok as any)?.oto_yikama_lokasyon
    }

    if (ustOtoYikama) {
      // gorev_tanim = plaka. Araç firmaya ait + aktif olmalı.
      const { data: arac } = await admin
        .from('araclar')
        .select('id, plaka, aktif')
        .eq('firma_id', firmaId)
        .eq('plaka', gorevTanim)
        .maybeSingle()

      if (!arac || arac.aktif === false) {
        return NextResponse.json(
          { ok: false, error: 'Bu plaka sistemde kayıtlı/aktif değil.', code: 'PLAKA_GECERSIZ' },
          { status: 400, headers: CORS }
        )
      }

      // Ardışık başlatma + devam eden görev
      const ardisikHata = await ardisikBaslatmaKontrol(
        admin, userId, firmaId, lok.proje_id ?? personelProjeId ?? null,
      )
      if (ardisikHata) {
        return NextResponse.json(
          { ok: false, error: ardisikHata, code: 'ARDISIK_BEKLEME' },
          { status: 429, headers: CORS },
        )
      }
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
      // TR saatine göre tarih — server UTC olsa bile Europe/Istanbul takvim günü
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())

      // gorevler INSERT: direkt TAMAMLANDI (ekstra = tek tıkla kayıt akışı)
      const { data: insertedGorev, error: gorevErr } = await admin
        .from('gorevler')
        .insert({
          firma_id: firmaId,
          proje_id: lok.proje_id ?? personelProjeId ?? null,
          tanim: `Oto Yıkama - ${arac.plaka} (Ekstra)`,
          lokasyon_id: lokasyonId,
          atanan_kullanici_id: null,
          durum: 'TAMAMLANDI',
          olusturan_id: userId,
          islemi_yapan_id: userId,
          tamamlanma_tarihi: nowIso,
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

      // Opsiyonel km/foto/notlar — mobil yıkama akışı için
      const km = Number.isFinite(Number(body?.km)) ? Math.floor(Number(body.km)) : null
      const fotoOnce = typeof body?.foto_oncesi_url === 'string' ? body.foto_oncesi_url.trim() : null
      const fotoSonra = typeof body?.foto_sonrasi_url === 'string' ? body.foto_sonrasi_url.trim() : null
      const notlar = typeof body?.notlar === 'string' ? body.notlar.trim() : null

      // KM gerileme uyarısı
      let kmUyarisi: string | null = null
      if (km != null) {
        const { data: maxRow } = await admin
          .from('oto_yikama_gorev_metadata')
          .select('km')
          .eq('arac_id', arac.id)
          .not('km', 'is', null)
          .order('km', { ascending: false })
          .limit(1)
          .maybeSingle()
        const oncekiMax = (maxRow as any)?.km ?? null
        if (oncekiMax != null && km < oncekiMax) {
          kmUyarisi = `KM girilen (${km}) önceki yıkamadaki KM'den (${oncekiMax}) düşük — kayıt yine de yapıldı.`
        }
      }

      const { error: metaErr } = await admin
        .from('oto_yikama_gorev_metadata')
        .insert({
          gorev_id: yeniGorevId,
          arac_id: arac.id,
          plaka_snapshot: arac.plaka,
          hedef_tarih: today,
          ekstra: true,
          km,
          foto_oncesi_url: fotoOnce,
          foto_sonrasi_url: fotoSonra,
          notlar,
        })
      if (metaErr) {
        await admin.from('gorevler').delete().eq('id', yeniGorevId)
        return NextResponse.json(
          { ok: false, error: 'metadata yazılamadı: ' + metaErr.message },
          { status: 500, headers: CORS }
        )
      }

      await admin.from('device_tokens').update({ son_kullanim: nowIso }).eq('device_token', deviceToken)

      void auditLog({
        tip: 'oto_yikama_ekstra',
        tablo: 'gorevler',
        firma_id: firmaId,
        kullanici_id: userId,
        detay: {
          gorev_id: yeniGorevId, lokasyon_id: lokasyonId, lokasyon_tanim: lok.tanim,
          arac_id: arac.id, plaka: arac.plaka, hedef_tarih: today, kanal: 'MOBIL',
        },
      })

      return NextResponse.json({
        ok: true,
        mesaj: 'Ekstra yıkama kaydedildi',
        gorev_id: yeniGorevId,
        plaka: arac.plaka,
        lokasyon_id: lokasyonId,
        tamamlanma_tarihi: nowIso,
        uyari: kmUyarisi,
      }, { headers: CORS })
    }

    // ── Frekansiyel dal (klasik akış) ────────────────────────────────────────
    // Aktif kural görevi kontrolü — sadece ACIK/ISLEMDE engeller.
    // BEKLEMEDE = vardiya geçmiş, PD cron'un ZG'ye çekeceği görev; personelin
    // tamamlama yükümlülüğü yok → ekstra görev başlatmayı engellememeli.
    const { data: aktifKural } = await admin
      .from('canli_gorevler')
      .select('id, durum')
      .eq('lokasyon_id', lokasyonId)
      .not('kural_id', 'is', null)
      .in('durum', ['ACIK', 'ISLEMDE'])
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

    // Görev tanımı doğrulama: lokasyonun aktif kurallarında var olan bir tanım olmalı.
    // Ekstra görev = mevcut kural görevinin tekrarı; serbest metin kabul edilmez.
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
        {
          ok: false,
          error: 'Bu lokasyonda tanımlı kural görevi yok — ekstra görev başlatılamaz.',
          code: 'KURAL_YOK',
        },
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

    // Ardışık başlatma süre kontrolü — kullanıcının son tamamlanan görevinden
    // bu yana yeterli süre geçti mi (firma/proje ayarı). Ekstra görev de
    // normal görev gibi bu kuralı uygular; yoksa kullanıcı kural görevini
    // ekstra olarak tekrarlayıp süreyi bypass edebilirdi.
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

    // Aktif görev kontrolü — kullanıcının halen ISLEMDE bir görevi varsa
    // ekstra görev oluşturamaz (doğal akış: aynı anda iki görev yürütülmez).
    const devamEden = await devamEdenGorevKontrol(admin, userId, firmaId)
    if (devamEden) {
      return NextResponse.json({
        ok: false,
        error: `Aktif başka bir göreviniz var: "${devamEden.tanim ?? '—'}"${devamEden.lokasyon_tanim ? ` (${devamEden.lokasyon_tanim})` : ''}. Önce onu tamamlayın.`,
        code: 'DEVAM_EDEN_GOREV',
        aktifGorev: devamEden,
      }, { status: 409, headers: CORS })
    }

    // Kayıt oluştur
    const nowIso = new Date().toISOString()

    // vardiya_gunu hesabı — sarkan vardiya desteğiyle
    let vardiyaGunu: string
    try {
      const { data: firma } = await admin
        .from('firmalar').select('vardiya_sayisi, tum_vardiya_ayarlari').eq('id', firmaId).single()
      const sayisi = (firma as any)?.vardiya_sayisi ?? 3
      const set = ((firma as any)?.tum_vardiya_ayarlari?.[String(sayisi)] ?? []) as VardiyaAyar[]
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
        kural_id:                null,
        gunluk_frekans_sayisi:   0,
        aktif_olma_tarihi:       nowIso,
        olusturma_tarihi:        nowIso,
        tamamlanma_tarihi:       nowIso,
        baslatilma_tarihi:       nowIso,
        olusturan_id:            userId,
        baslatan_kullanici_id:   userId,
        islemi_yapan_id:         userId,
        tamamlayan_kullanici_id: userId,
        tamamlanma_suresi_saniye: 0,
        vardiya_gunu:            vardiyaGunu,
        ...gorevDurumPayload('TAMAMLANDI', 'MOBIL', { at: nowIso }),
      } as any)
      .select('id')

    if (insertErr || !insertedRows || insertedRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: insertErr?.message ?? 'Ekstra görev oluşturulamadı' },
        { status: 500, headers: CORS }
      )
    }
    const yeniGorevId = (insertedRows[0] as any).id as string

    // Device token son kullanım
    await admin
      .from('device_tokens')
      .update({ son_kullanim: nowIso })
      .eq('device_token', deviceToken)

    await auditLog({
      tip: 'ekstra_frekans',
      tablo: 'canli_gorevler',
      firma_id: firmaId,
      kullanici_id: userId,
      detay: {
        gorev_id: yeniGorevId,
        lokasyon_id: lokasyonId,
        lokasyon_tanim: lok.tanim ?? null,
        tanim: gorevTanim,
        kanal: 'MOBIL',
      },
    })

    return NextResponse.json({
      ok: true,
      mesaj: 'Ekstra frekansiyel görev kaydedildi',
      gorev_id: yeniGorevId,
      tanim: gorevTanim,
      lokasyon_id: lokasyonId,
      tamamlanma_tarihi: nowIso,
    }, { headers: CORS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
