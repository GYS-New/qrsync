/**
 * POST /api/app/oto-yikama/tanimsiz-baslat
 *
 * Mobil — tanımsız (kayıtsız) plaka yıkama başlat.
 *
 * Mobil ekip spec: parent_id 40a291f6-b400-4703-9326-b863c649165d (1.0.34).
 * Backend cevabı: onay_durumu = ONAY_BEKLIYOR ile yıkama başlatılır,
 * TAMAMLANDI'ya vardıktan sonra amir GYS'den onaylar veya reddeder.
 *
 * Headers:
 *   X-Device-Token
 *
 * Body:
 *   { lokasyon_id: uuid, plaka: string }
 *
 * Response (201):
 *   { ok: true, gorev_id, baslatilma_tarihi, durum: 'ISLEMDE',
 *     onay_durumu: 'ONAY_BEKLIYOR', plaka: <normalize>, amir_bildirildi: true }
 *
 * Hata kodları:
 *   400 PLAKA_GECERSIZ         — normalize sonrası boş / geçersiz
 *   400 AMIR_ATANMAMIS         — firma amirini atamamış (endpoint disabled)
 *   403 OTO_YIKAMA_YETKISI_YOK — personel istasyona yetkili değil
 *   403 ISTASYON_YETKI_YOK    — lokasyon_id personelin yetkili istasyonları arasında yok
 *   404 LOKASYON_YOK           — geçersiz lokasyon_id
 *   409 AYNI_PLAKA_ONAY_BEKLIYOR — aynı plaka için AKTIF bekleyen kayıt var
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserOtoYikamaUstIds } from '@/lib/oto-yikama/getUserOtoYikamaUstIds'
import { getPersonelIstasyonId } from '@/lib/oto-yikama/getPersonelIstasyonId'
import { normalizePlaka } from '@/lib/oto-yikama/plakaFuzzyMatch'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

function bugunTR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

export async function POST(req: Request) {
  try {
    const admin = createAdminClient()

    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401, headers: CORS })
    }

    const { data: tok } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, aktif')
      .eq('device_token', deviceToken)
      .single()
    if (!tok || !tok.aktif) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
    }
    const userId = tok.user_id as string
    const firmaId = tok.firma_id as string

    const body = await req.json().catch(() => ({}))
    const lokasyonId = typeof body?.lokasyon_id === 'string' ? body.lokasyon_id : ''
    const plakaRaw = typeof body?.plaka === 'string' ? body.plaka : ''

    if (!lokasyonId) {
      return NextResponse.json({ ok: false, error: 'lokasyon_id gerekli' }, { status: 400, headers: CORS })
    }

    const plaka = normalizePlaka(plakaRaw)
    if (!plaka || plaka.length < 4) {
      return NextResponse.json(
        { ok: false, code: 'PLAKA_GECERSIZ', error: 'Plaka geçersiz veya çok kısa' },
        { status: 400, headers: CORS },
      )
    }

    // Firma amiri atanmis mi?
    const { data: firma } = await admin
      .from('firmalar')
      .select('oto_yikama_onay_yetkilisi_id')
      .eq('id', firmaId)
      .single()
    const amirId = (firma as any)?.oto_yikama_onay_yetkilisi_id as string | null
    if (!amirId) {
      return NextResponse.json(
        { ok: false, code: 'AMIR_ATANMAMIS', error: 'Firmada oto yıkama onay yetkilisi atanmamış — tanımsız yıkama devre dışı' },
        { status: 400, headers: CORS },
      )
    }

    // Yıkama personeli yetkisi
    const yetkiliUstIds = await getUserOtoYikamaUstIds(admin, userId, firmaId)
    if (yetkiliUstIds.length === 0) {
      return NextResponse.json(
        { ok: false, code: 'OTO_YIKAMA_YETKISI_YOK', error: 'Oto Yıkama lokasyonuna yetkili değilsiniz' },
        { status: 403, headers: CORS },
      )
    }

    // Lokasyon geçerli ve personelin yetkili üst lokasyonlarına bağlı mı?
    const { data: lok } = await admin
      .from('lokasyonlar')
      .select('id, tanim, parent_id, firma_id, aktif')
      .eq('id', lokasyonId)
      .maybeSingle()
    if (!lok) {
      return NextResponse.json(
        { ok: false, code: 'LOKASYON_YOK', error: 'Lokasyon bulunamadı' },
        { status: 404, headers: CORS },
      )
    }
    if (lok.firma_id !== firmaId || !yetkiliUstIds.includes(lok.parent_id) || !lok.aktif) {
      return NextResponse.json(
        { ok: false, code: 'ISTASYON_YETKI_YOK', error: 'Bu istasyona yetkili değilsiniz' },
        { status: 403, headers: CORS },
      )
    }

    // Plaka DB'de zaten kayitli mi? Kullanici karari (2026-07-09):
    //   "Plaka okunur db kayit sorgusu yapilir ve kayitli degilse ekstra yazilir,
    //    kayitli ise zaten normal yikama davranisi gerceklesir."
    // Yani tanimsiz akis SADECE kayitsiz plaka icin. Kayitli plaka gelirse
    // mobil arama listesinden secmeli veya kayitli-plaka-ekstra-baslat kullanmali.
    // Bu guard fuzzy match bug'i (varsayilan_lokasyon_id fix'ten once) atlanan
    // vakalari da yakalar.
    const { data: mevcut } = await admin
      .from('araclar')
      .select('id, plaka, departman, kullanici_adi_soyadi')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .eq('plaka', plaka)
      .maybeSingle()
    if (mevcut) {
      return NextResponse.json(
        {
          ok: false,
          code: 'PLAKA_KAYITLI',
          error: `${plaka} plakası zaten sistemde kayıtlı. Arama listesinden seçip başlatın.`,
          arac: {
            id: (mevcut as any).id,
            plaka: (mevcut as any).plaka,
            departman: (mevcut as any).departman,
            kullanici_adi_soyadi: (mevcut as any).kullanici_adi_soyadi,
          },
        },
        { status: 409, headers: CORS },
      )
    }

    // Aynı plaka için AKTIF (ONAY_BEKLIYOR) kayıt var mı?
    // Chunk gerekmez — bugünlük az sayıda kayıt.
    const { data: bekleyen } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('gorev_id, plaka_snapshot')
      .eq('onay_durumu', 'ONAY_BEKLIYOR')
      .eq('plaka_snapshot', plaka)
      .limit(1)
    if ((bekleyen ?? []).length > 0) {
      return NextResponse.json(
        {
          ok: false,
          code: 'AYNI_PLAKA_ONAY_BEKLIYOR',
          error: `${plaka} plakası için zaten onay bekleyen bir yıkama var`,
        },
        { status: 409, headers: CORS },
      )
    }

    const now = new Date().toISOString()
    const hedefTarih = bugunTR()

    // Istasyon revizyonu (2026-07-09): "yikanan aracin istasyonu = islemi yapan
    // personelin kayitli istasyonu". Body'den gelen lokasyon_id sadece yetki
    // kontrolu icin kullanildi; INSERT edilecek deger personel'in birincili
    // (users.ust_lokasyon_id → KLY fallback). Personelin kayitli istasyonu
    // yoksa body'den geleni kullanan geri düs şartına duser.
    const personelIstasyon = await getPersonelIstasyonId(admin, userId, firmaId)
    const kayitLokasyonId = personelIstasyon ?? lokasyonId

    // 1) gorevler INSERT — durum ISLEMDE olarak baslar
    const { data: newGorev, error: gErr } = await admin
      .from('gorevler')
      .insert({
        tanim: `Oto Yıkama — Tanımsız plaka: ${plaka}`,
        durum: 'ISLEMDE',
        firma_id: firmaId,
        lokasyon_id: kayitLokasyonId,
        olusturan_id: userId,
        atanan_kullanici_id: userId,
        baslatan_kullanici_id: userId,
        baslatilma_tarihi: now,
        durum_degisim_tarihi: now,
      })
      .select('id, baslatilma_tarihi')
      .single()

    if (gErr || !newGorev) {
      return NextResponse.json(
        { ok: false, error: gErr?.message ?? 'Görev oluşturulamadı' },
        { status: 500, headers: CORS },
      )
    }

    // 2) metadata INSERT — arac_id NULL, ekstra=true, onay_durumu=ONAY_BEKLIYOR
    const { error: mErr } = await admin
      .from('oto_yikama_gorev_metadata')
      .insert({
        gorev_id: newGorev.id,
        arac_id: null,
        plaka_snapshot: plaka,
        hedef_tarih: hedefTarih,
        ekstra: true,
        onay_durumu: 'ONAY_BEKLIYOR',
      })
    if (mErr) {
      // Rollback: metadata yazamadıysak görevi de sil
      await admin.from('gorevler').delete().eq('id', newGorev.id)
      return NextResponse.json(
        { ok: false, error: mErr.message },
        { status: 500, headers: CORS },
      )
    }

    // 3) Amire bildirim — bildirimler tablosuna + FCM push (fire-and-forget)
    // Bildirim başarısız olsa bile yıkama tamamlanmalı; sessizce try/catch
    ;(async () => {
      try {
        // Personel bilgisi (mesajda göstermek için)
        const [{ data: personel }, { data: lokFull }] = await Promise.all([
          admin.from('users').select('isim_soyisim').eq('id', userId).maybeSingle(),
          admin.from('lokasyonlar').select('tanim').eq('id', lokasyonId).maybeSingle(),
        ])
        const personelAd = (personel as any)?.isim_soyisim ?? 'Bilinmeyen personel'
        const istasyonAd = (lokFull as any)?.tanim ?? 'Bilinmeyen istasyon'
        const baslik = `Tanımsız plaka onayı bekliyor`
        const mesaj = [
          `Plaka: ${plaka}`,
          `Personel: ${personelAd}`,
          `İstasyon: ${istasyonAd}`,
          `Yıkama başlatıldı — TAMAMLANDI olduğunda onay için hazır olacak`,
          `#gorev:${newGorev.id}`,
        ].join('\n')

        await admin.from('bildirimler').insert({
          alici_id: amirId,
          baslik,
          mesaj,
          tip: 'oto_yikama_onay',
        })
        // FCM push — server-side olduğu için sendFCMToUser'ı direkt çağırabiliriz
        const { sendFCMToUser } = await import('@/lib/fcm-sender')
        await sendFCMToUser(amirId, baslik, `${plaka} — ${personelAd}`, 'gorev_uyari')
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[tanimsiz-baslat] bildirim gönderilemedi:', err)
      }
    })()

    return NextResponse.json(
      {
        ok: true,
        gorev_id: newGorev.id,
        baslatilma_tarihi: newGorev.baslatilma_tarihi,
        durum: 'ISLEMDE',
        onay_durumu: 'ONAY_BEKLIYOR',
        plaka,
        amir_bildirildi: true,
      },
      { status: 201, headers: CORS },
    )
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[tanimsiz-baslat] hata:', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
