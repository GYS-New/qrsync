import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { ardisikBaslatmaKontrol } from '@/lib/tasks/ardisikKontrol'

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

    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401, headers: CORS })
    }

    const { data: tokenData, error: tokenErr } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, isim_soyisim, proje_id')
      .eq('device_token', deviceToken)
      .single()

    if (tokenErr || !tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
    }

    const { user_id: userId, firma_id: firmaId, proje_id: personelProjeId } = tokenData

    // ── Kullanıcı aktif/pasif kontrolü ──────────────────────────────────────
    const { data: userData } = await admin.from('users').select('aktif').eq('id', userId).single()
    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF' },
        { status: 403, headers: CORS }
      )
    }

    // ── Personel takibi aktifse mesai kontrolü (sadece proje bazlı) ────────
    {
      let personelTakibiAktif = false
      if (personelProjeId) {
        const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', personelProjeId).single()
        personelTakibiAktif = proje?.personel_takibi_aktif === true
      }
      if (personelTakibiAktif) {
        const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const { data: mesai } = await admin
          .from('personel_mesai_kayitlari')
          .select('id')
          .eq('user_id', userId)
          .eq('kayit_tarihi', bugun)
          .is('cikis_saati', null)
          .maybeSingle()
        if (!mesai) {
          return NextResponse.json(
            { ok: false, error: 'Lütfen önce iş başı QR/NFC kodunu okutunuz.', code: 'MESAI_YOK' },
            { status: 403, headers: CORS }
          )
        }
      }
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400, headers: CORS })
    }

    const gorevId   = body?.gorev_id as string | undefined
    const gorevTipi = (body?.gorev_tipi as string | undefined) ?? 'gorevler'
    const maddeler  = body?.maddeler ?? []
    const scanToken = body?.scan_token as string | undefined  // QR/NFC token (mobil gönderir)

    if (!gorevId) {
      return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400, headers: CORS })
    }
    if (!['gorevler', 'canli_gorevler'].includes(gorevTipi)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz gorev_tipi' }, { status: 400, headers: CORS })
    }

    // ── QR/NFC TAMAMLAMA ZORUNLULUĞU (SİM bypass'tan önce çalışmalı) ──
    {
      const { data: gorevLokBilgi } = await admin
        .from(gorevTipi)
        .select('lokasyon_id')
        .eq('id', gorevId)
        .single()
      if (gorevLokBilgi?.lokasyon_id) {
        const { data: lokQr } = await admin
          .from('lokasyonlar')
          .select('tamamlama_qr_zorunlu, sureli_gorev_aktif, qr_veri, nfc_token')
          .eq('id', gorevLokBilgi.lokasyon_id)
          .single()
        if (lokQr?.tamamlama_qr_zorunlu && lokQr?.sureli_gorev_aktif) {
          if (!scanToken) {
            return NextResponse.json(
              { ok: false, error: 'Bu lokasyonda tamamlama için QR veya NFC okutmanız gerekiyor.', code: 'QR_NFC_ZORUNLU' },
              { status: 403, headers: CORS }
            )
          }
          const qrOk = lokQr.qr_veri && scanToken === lokQr.qr_veri
          const nfcOk = lokQr.nfc_token && scanToken === lokQr.nfc_token
          if (!qrOk && !nfcOk) {
            return NextResponse.json(
              { ok: false, error: 'Okutulan QR/NFC kodu bu lokasyonla eşleşmiyor.', code: 'QR_NFC_ESLESMEDI' },
              { status: 403, headers: CORS }
            )
          }
        }
      }
    }

    // ── SİMÜLASYON BYPASS: SİM aktifse ve görev kapsamındaysa VT'ye yazma ──
    if (gorevTipi === 'canli_gorevler') {
      const { data: gorevLok } = await admin
        .from('canli_gorevler')
        .select('lokasyon_id')
        .eq('id', gorevId)
        .single()
      if (gorevLok?.lokasyon_id) {
        // Görevin lokasyonunun üst lokasyonunu bul
        const { data: lokasyon } = await admin
          .from('lokasyonlar')
          .select('id, parent_id')
          .eq('id', gorevLok.lokasyon_id)
          .single()
        // Üst lokasyonu bul (root'a kadar çık)
        let ustLokId = lokasyon?.id ?? null
        if (lokasyon?.parent_id) {
          let curId: string | null = lokasyon.parent_id
          let guard = 0
          while (curId && guard < 10) {
            const { data: parent } = await admin.from('lokasyonlar').select('id, parent_id').eq('id', curId).single()
            if (!parent) break
            ustLokId = parent.id
            curId = parent.parent_id
            guard++
          }
        }
        // Bu üst lokasyon için aktif simülasyon var mı?
        if (ustLokId) {
          const { data: simAyar } = await admin
            .from('simulasyon_ayarlari')
            .select('id')
            .eq('firma_id', firmaId)
            .eq('ust_lokasyon_id', ustLokId)
            .eq('aktif', true)
            .maybeSingle()
          if (simAyar) {
            // SİM aktif — personele başarılı response dön ama VT'ye yazma
            return NextResponse.json({
              ok: true,
              mesaj: 'Görev başarıyla tamamlandı.',
              gorev_id: gorevId,
              gorev_tipi: gorevTipi,
              tamamlanma_tarihi: new Date().toISOString(),
            }, { headers: CORS })
          }
        }
      }
    }

    const nowIso = new Date().toISOString()

    const { data: gorev, error: gorevErr } = await admin
      .from(gorevTipi)
      .select('id, firma_id, durum, atanan_kullanici_id, baslatilma_tarihi, lokasyon_id')
      .eq('id', gorevId)
      .single()

    if (gorevErr || !gorev) {
      return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404, headers: CORS })
    }

    // Lokasyon bilgileri: checklist, QR/NFC zorunluluk
    let checklistSablonId: string | null = null
    let lokBilgi: any = null
    if (gorev.lokasyon_id) {
      const { data: lok } = await admin
        .from('lokasyonlar')
        .select('checklist_sablon_id, tamamlama_qr_zorunlu, sureli_gorev_aktif, qr_veri, nfc_token')
        .eq('id', gorev.lokasyon_id)
        .single()
      lokBilgi = lok
      if (maddeler?.length > 0) checklistSablonId = lok?.checklist_sablon_id ?? null
    }

    // QR/NFC tamamlama zorunluluğu: lokasyonda aktifse VE süreli görev aktifse kontrol et
    if (lokBilgi?.tamamlama_qr_zorunlu && lokBilgi?.sureli_gorev_aktif) {
      if (!scanToken) {
        return NextResponse.json(
          { ok: false, error: 'Bu lokasyonda tamamlama için QR veya NFC okutmanız gerekiyor.', code: 'QR_NFC_ZORUNLU' },
          { status: 403, headers: CORS }
        )
      }
      // Token doğrulama: QR veri veya NFC token ile eşleşmeli
      const qrMatch = lokBilgi.qr_veri && scanToken === lokBilgi.qr_veri
      const nfcMatch = lokBilgi.nfc_token && scanToken === lokBilgi.nfc_token
      if (!qrMatch && !nfcMatch) {
        return NextResponse.json(
          { ok: false, error: 'Okutulan QR/NFC kodu bu lokasyonla eşleşmiyor.', code: 'QR_NFC_ESLESMEDI' },
          { status: 403, headers: CORS }
        )
      }
    }

    if (gorev.firma_id !== firmaId) {
      return NextResponse.json({ ok: false, error: 'Bu göreve erişim yetkiniz yok' }, { status: 403, headers: CORS })
    }

    if (gorev.atanan_kullanici_id && gorev.atanan_kullanici_id !== userId) {
      return NextResponse.json({ ok: false, error: 'Bu görev size atanmış değil' }, { status: 403, headers: CORS })
    }

    const tamamlanabilir = gorevTipi === 'gorevler'
      ? ['ACIK', 'ISLEMDE'].includes(gorev.durum)
      : ['ACIK', 'ISLEMDE', 'BEKLEMEDE'].includes(gorev.durum)

    if (!tamamlanabilir) {
      return NextResponse.json({ ok: false, error: `Görev zaten ${gorev.durum} durumunda` }, { status: 409, headers: CORS })
    }

    // Ardışık başlatma kontrolü — henüz başlatılmamış (ACIK) görev tamamlanmaya çalışılırsa
    if (!gorev.baslatilma_tarihi) {
      const ardisikHata = await ardisikBaslatmaKontrol(admin, userId, firmaId, (gorev as any).proje_id)
      if (ardisikHata) {
        return NextResponse.json({ ok: false, error: ardisikHata, code: 'ARDISIK_BEKLEME' }, { status: 429, headers: CORS })
      }
    }

    // Çeklist: mobil uygulama checklist_cevaplari yazar; raporlar ise checklist_sonuc_basliklari okur
    // (QR/Web = scan/tamamla bu tablolara yazar). Her iki tabloyu da doldur ki Çeklist Raporu görünsün.
    if (maddeler && maddeler.length > 0 && checklistSablonId) {
      let templateVersion = 1
      const { data: sablonMeta } = await admin
        .from('checklist_sablonlari')
        .select('versiyon')
        .eq('id', checklistSablonId)
        .maybeSingle()
      templateVersion = sablonMeta?.versiyon ?? 1

      const sonucPayload: any = {
        lokasyon_id:      gorev.lokasyon_id,
        sablon_id:        checklistSablonId,
        template_version: templateVersion,
        kanal:            'MOBİL',
        kullanici_id:     userId,
      }
      if (gorevTipi === 'gorevler') sonucPayload.gorev_id = gorevId
      else sonucPayload.canli_gorev_id = gorevId

      const { data: sonucRow, error: sonucErr } = await admin
        .from('checklist_sonuc_basliklari')
        .insert(sonucPayload)
        .select('id')
        .single()

      if (sonucErr || !sonucRow) {
        console.error('[gorev-tamamla] checklist_sonuc_basliklari:', sonucErr)
        return NextResponse.json({ ok: false, error: 'Çeklist rapor kaydı oluşturulamadı: ' + (sonucErr?.message ?? '') }, { status: 500, headers: CORS })
      }

      const maddeRows = maddeler.map((m: any) => ({
        sonuc_id:       sonucRow.id,
        madde_id:       m.madde_id,
        secenek_degeri: m.secenek_degeri ?? null,
        aciklama:       typeof m.aciklama === 'string' ? m.aciklama.trim() || null : m.aciklama ?? null,
        gorsel_url:     m.gorsel_url ?? null,
      }))
      const { error: maddeErr } = await admin.from('checklist_sonuc_maddeleri').insert(maddeRows)
      if (maddeErr) {
        console.error('[gorev-tamamla] checklist_sonuc_maddeleri:', maddeErr)
        await admin.from('checklist_sonuc_basliklari').delete().eq('id', sonucRow.id)
        return NextResponse.json({ ok: false, error: 'Çeklist maddeleri kaydedilemedi: ' + maddeErr.message }, { status: 500, headers: CORS })
      }

      const cevaplar = maddeler.map((m: any) => ({
        gorev_id:        gorevId,
        gorev_tipi:      gorevTipi,
        sablon_id:       checklistSablonId,
        madde_id:        m.madde_id,
        secenek_degeri:  m.secenek_degeri ?? null,
        aciklama:        m.aciklama ?? null,
        gorsel_url:      m.gorsel_url ?? null,
        user_id:         userId,
        firma_id:        firmaId,
        yanitlayan_id:   userId,
      }))

      // checklist_cevaplari eski/yardımcı tablo; raporlar checklist_sonuc_basliklari okur.
      // Spesifik görevlerde FK kısıtı nedeniyle insert başarısız olabilir —
      // bu durumda rapor tablosunu geri silme, sadece logla.
      const { error: cevapErr } = await admin
        .from('checklist_cevaplari')
        .insert(cevaplar)
      if (cevapErr) {
        console.warn('[gorev-tamamla] checklist_cevaplari insert başarısız (kritik değil):', cevapErr.message)
      }
    }

    let sureSaniye: number | null = null
    if (gorev.baslatilma_tarihi) {
      const ms = new Date(nowIso).getTime() - new Date(gorev.baslatilma_tarihi).getTime()
      sureSaniye = Math.max(0, Math.floor(ms / 1000))
    }

    const { error: updateErr } = await admin
      .from(gorevTipi)
      .update({
        durum:                    'TAMAMLANDI',
        durum_degisim_tarihi:     nowIso,
        tamamlanma_tarihi:        nowIso,
        tamamlanma_suresi_saniye: sureSaniye,
        islemi_yapan_id:          userId,
        son_tamamlama_kanali:     'MOBIL',
      } as any)
      .eq('id', gorevId)

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500, headers: CORS })
    }

    await admin
      .from('device_tokens')
      .update({ son_kullanim: nowIso })
      .eq('device_token', deviceToken)

    return NextResponse.json({
      ok: true,
      mesaj: 'Görev başarıyla tamamlandı',
      gorev_id: gorevId,
      gorev_tipi: gorevTipi,
      tamamlanma_tarihi: nowIso,
    }, { headers: CORS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
