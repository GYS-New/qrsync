import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { ardisikBaslatmaKontrol } from '@/lib/tasks/ardisikKontrol'
import { devamEdenGorevKontrol } from '@/lib/tasks/devamEdenGorevKontrol'
import { resolveLiveCompletionStatusByTask } from '@/lib/tasks/liveStatus'
import { gorevDurumPayload } from '@/lib/gorev/durum-degistir'

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
    // iOS bazı QR okuyucular token sonuna \n, \r veya boşluk ekleyebilir — trim şart
    const scanTokenRaw = body?.scan_token as string | undefined
    const scanToken = typeof scanTokenRaw === 'string' ? scanTokenRaw.trim() : scanTokenRaw

    if (!gorevId) {
      return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400, headers: CORS })
    }
    if (!['gorevler', 'canli_gorevler'].includes(gorevTipi)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz gorev_tipi' }, { status: 400, headers: CORS })
    }

    // ── Oto Yıkama görevi için KM zorunluluğu ──
    // gorevler tablosundaysa ve metadata varsa = Oto Yıkama. KM girilmesi zorunlu.
    // Eski APK'lar KM göndermeden tamamlama yapamaz; 1.0.30+ KM input ekrana eklendi.
    if (gorevTipi === 'gorevler') {
      const { data: otoYikamaMeta } = await admin
        .from('oto_yikama_gorev_metadata')
        .select('gorev_id')
        .eq('gorev_id', gorevId)
        .maybeSingle()
      if (otoYikamaMeta) {
        const kmNum = Number(body?.km)
        if (!Number.isFinite(kmNum) || kmNum <= 0) {
          return NextResponse.json({
            ok: false,
            error: 'Yıkamayı tamamlamak için aracın güncel KM değeri zorunludur.',
            code: 'KM_GEREKLI',
          }, { status: 400, headers: CORS })
        }
      }
    }

    // ── QR/NFC TAMAMLAMA ZORUNLULUĞU (SİM bypass'tan önce çalışmalı) ──
    {
      console.log('[gorev-tamamla] QR/NFC kontrol başlıyor', { gorevId, gorevTipi, scanToken: scanToken ?? 'YOK' })
      const { data: gorevLokBilgi, error: glErr } = await admin
        .from(gorevTipi)
        .select('lokasyon_id')
        .eq('id', gorevId)
        .single()
      console.log('[gorev-tamamla] gorevLokBilgi:', { lokasyon_id: gorevLokBilgi?.lokasyon_id, err: glErr?.message })
      if (gorevLokBilgi?.lokasyon_id) {
        const { data: lokQr } = await admin
          .from('lokasyonlar')
          .select('tamamlama_qr_zorunlu, qr_veri, nfc_token')
          .eq('id', gorevLokBilgi.lokasyon_id)
          .single()
        console.log('[gorev-tamamla] lokQr:', { tamamlama_qr_zorunlu: lokQr?.tamamlama_qr_zorunlu })
        if (lokQr?.tamamlama_qr_zorunlu) {
          console.log('[gorev-tamamla] QR/NFC ZORUNLU — scanToken:', scanToken ?? 'YOK')
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

    // SİMÜLASYON HİBRİT MODU: bypass kaldırıldı.
    //   Eskiden sim aktif üst lokasyondaki gerçek tamamlamalar sahte success
    //   alır, DB'ye yazılmazdı. Artık sim + gerçek paralel çalışır:
    //     • Gerçek personel görev tamamlar → normal akış DB'ye yazar.
    //     • Sim cron sadece halen 'ACIK'/'ISLEMDE' duranları tamamlar (durum
    //       guard'ı simulasyon/calistir'da var) — race olduğunda kim önce
    //       yaparsa o yazılır, diğeri no-op.
    //   3 frekanslı görev senaryosu: bir frekansı canlı tamamlanırsa sim
    //   diğer frekansları yapar; sim biri yaparsa kalanı canlı yapabilir.


    const nowIso = new Date().toISOString()

    // canli_gorevler'a özel kolonlar (acik_bekleme_saat, aktif_olma_tarihi) sadece o tabloda var.
    // resolveLiveCompletionStatusByTask kural-bazlı eşik için gerekli.
    // Dinamik select string TS tip çıkarımıyla uyuşmadığı için sonuç any cast'lendi.
    const gorevSelectCols = gorevTipi === 'canli_gorevler'
      ? 'id, firma_id, durum, atanan_kullanici_id, baslatilma_tarihi, lokasyon_id, aktif_olma_tarihi, acik_bekleme_saat'
      : 'id, firma_id, durum, atanan_kullanici_id, baslatilma_tarihi, lokasyon_id'
    const { data: gorevRaw, error: gorevErr } = await (admin as any)
      .from(gorevTipi)
      .select(gorevSelectCols)
      .eq('id', gorevId)
      .single()
    const gorev: any = gorevRaw

    if (gorevErr || !gorev) {
      return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404, headers: CORS })
    }

    // Lokasyon bilgileri: checklist, QR/NFC zorunluluk
    let checklistSablonId: string | null = null
    let lokBilgi: any = null
    if (gorev.lokasyon_id) {
      const { data: lok } = await admin
        .from('lokasyonlar')
        .select('checklist_sablon_id, tamamlama_qr_zorunlu, qr_veri, nfc_token')
        .eq('id', gorev.lokasyon_id)
        .single()
      lokBilgi = lok
      if (maddeler?.length > 0) checklistSablonId = lok?.checklist_sablon_id ?? null
    }

    // QR/NFC tamamlama zorunluluğu: lokasyonda aktifse kontrol et (süreli görev ayarından bağımsız)
    if (lokBilgi?.tamamlama_qr_zorunlu) {
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

    // Tamamlama kanalı: scan_token gönderildiyse gerçek kaynağa göre QR/NFC,
    // yoksa MOBIL (mobil app'ten direkt "Tamamla" tuşu — qr_zorunlu olmadığı durum).
    // qr_zorunlu olsa bile mobil app QR okutmadan buraya gelemez (yukarıda 403).
    let tamamlamaKanali: 'QR' | 'NFC' | 'MOBIL' = 'MOBIL'
    if (scanToken && lokBilgi) {
      if (lokBilgi.qr_veri && scanToken === lokBilgi.qr_veri) tamamlamaKanali = 'QR'
      else if (lokBilgi.nfc_token && scanToken === lokBilgi.nfc_token) tamamlamaKanali = 'NFC'
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

    // Aktif görev kontrolü — kullanıcının başka bir ISLEMDE görevi varsa
    // yeni görev tamamlayamaz (doğal akış: bir personel aynı anda iki görev
    // yürütemez). exceptId ile şu anki görev hariç tutulur — eğer bu görev
    // zaten ISLEMDE ise kendi sahibi olduğu için engellenmez.
    const devamEden = await devamEdenGorevKontrol(admin, userId, firmaId, { excludeTaskId: gorevId })
    if (devamEden) {
      return NextResponse.json({
        ok: false,
        error: `Aktif başka bir göreviniz var: "${devamEden.tanim ?? '—'}"${devamEden.lokasyon_tanim ? ` (${devamEden.lokasyon_tanim})` : ''}. Önce onu tamamlayın.`,
        code: 'DEVAM_EDEN_GOREV',
        aktifGorev: devamEden,
      }, { status: 409, headers: CORS })
    }

    // Proje ayarı kapalıysa çeklist maddelerini sessizce ihmal et
    // (mobil eski snapshot'la geç gelmiş olabilir)
    const ceklistAyarKolonu = gorevTipi === 'gorevler' ? 'spesifik_ceklist_aktif' : 'frekansiyel_ceklist_aktif'
    const [firmaCfg2, projeCfg2] = await Promise.all([
      admin.from('firmalar').select(ceklistAyarKolonu).eq('id', firmaId).single(),
      personelProjeId
        ? admin.from('projeler').select(ceklistAyarKolonu).eq('id', personelProjeId).single()
        : Promise.resolve({ data: null }),
    ])
    const projeAyar = (projeCfg2.data as any)?.[ceklistAyarKolonu]
    const firmaAyar2 = (firmaCfg2.data as any)?.[ceklistAyarKolonu]
    const ceklistAktif = projeAyar != null ? !!projeAyar : (firmaAyar2 != null ? !!firmaAyar2 : true)
    if (!ceklistAktif && maddeler && maddeler.length > 0) {
      console.log(`[gorev-tamamla] Çeklist ayarı kapalı (${ceklistAyarKolonu}=false) — gönderilen ${maddeler.length} madde ihmal edildi`)
    }

    // Çeklist: mobil uygulama checklist_cevaplari yazar; raporlar ise checklist_sonuc_basliklari okur
    // (QR/Web = scan/tamamla bu tablolara yazar). Her iki tabloyu da doldur ki Çeklist Raporu görünsün.
    if (ceklistAktif && maddeler && maddeler.length > 0 && checklistSablonId) {
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
        kanal:            tamamlamaKanali,
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

    const tamamlanmaIso = nowIso

    let sureSaniye: number | null = null
    if (gorev.baslatilma_tarihi) {
      const ms = new Date(tamamlanmaIso).getTime() - new Date(gorev.baslatilma_tarihi).getTime()
      sureSaniye = Math.max(0, Math.floor(ms / 1000))
    }

    // canli_gorevler için süreli/sapma kontrolü: aktifleşmeden 8 saat geçtiyse
    // veya BEKLEMEDE durumdaysa → ZAMANINDA_YAPILAMAYAN; gorevler (spesifik) için
    // süre kontrolü yok, direkt TAMAMLANDI.
    const nextDurum = gorevTipi === 'canli_gorevler'
      ? resolveLiveCompletionStatusByTask(gorev as any, tamamlanmaIso)
      : 'TAMAMLANDI'

    const { error: updateErr } = await admin
      .from(gorevTipi)
      .update(gorevDurumPayload(nextDurum as any, tamamlamaKanali, {
        at: tamamlanmaIso,
        ek: {
          tamamlanma_tarihi:        tamamlanmaIso,
          tamamlanma_suresi_saniye: sureSaniye,
          islemi_yapan_id:          userId,
          ...(gorevTipi === 'canli_gorevler' ? { tamamlayan_kullanici_id: userId } : {}),
        },
      }) as any)
      .eq('id', gorevId)

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500, headers: CORS })
    }

    // Oto Yıkama görevi için opsiyonel km/foto/notlar metadata'ya yazılır.
    // (Görev gorevler tablosundaysa + body'de bu alanlar varsa)
    let kmUyarisi: string | null = null
    if (gorevTipi === 'gorevler') {
      const km = Number.isFinite(Number(body?.km)) ? Math.floor(Number(body.km)) : null
      const fotoOnce = typeof body?.foto_oncesi_url === 'string' ? body.foto_oncesi_url.trim() : null
      const fotoSonra = typeof body?.foto_sonrasi_url === 'string' ? body.foto_sonrasi_url.trim() : null
      const notlar = typeof body?.notlar === 'string' ? body.notlar.trim() : null
      if (km != null || fotoOnce || fotoSonra || notlar) {
        // Metadata var mı kontrolü (Oto Yıkama görevi mi)
        const { data: meta } = await admin
          .from('oto_yikama_gorev_metadata')
          .select('gorev_id, arac_id')
          .eq('gorev_id', gorevId)
          .maybeSingle()
        if (meta) {
          // KM gerileme kontrolü
          if (km != null) {
            const { data: maxRow } = await admin
              .from('oto_yikama_gorev_metadata')
              .select('km')
              .eq('arac_id', (meta as any).arac_id)
              .not('km', 'is', null)
              .order('km', { ascending: false })
              .limit(1)
              .maybeSingle()
            const oncekiMax = (maxRow as any)?.km ?? null
            if (oncekiMax != null && km < oncekiMax) {
              kmUyarisi = `KM girilen (${km}) önceki yıkamadaki KM'den (${oncekiMax}) düşük — kayıt yine de yapıldı.`
            }
          }
          const update: any = {}
          if (km != null) update.km = km
          if (fotoOnce) update.foto_oncesi_url = fotoOnce
          if (fotoSonra) update.foto_sonrasi_url = fotoSonra
          if (notlar) update.notlar = notlar
          await admin.from('oto_yikama_gorev_metadata').update(update).eq('gorev_id', gorevId)
        }
      }
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
      uyari: kmUyarisi,
    }, { headers: CORS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
