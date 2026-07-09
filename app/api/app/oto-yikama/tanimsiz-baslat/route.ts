/**
 * POST /api/app/oto-yikama/tanimsiz-baslat
 *
 * Mobil — plakayı OCR ile okuduğunda plakanın kayıtlı olup olmamasına
 * bakmaksızın bu endpoint'e gönderir. Backend plakayı araclar tablosunda
 * arar ve ÜÇ senaryodan birini uygular:
 *
 *   1) Plaka KAYITLI + bugün için PLANLI görev VAR:
 *      - Yeni görev oluşturulmaz; mevcut görev ISLEMDE'ye çekilir
 *        (planli-baslat mantığı: baslatilma_tarihi, baslatan_kullanici_id,
 *         atanan_kullanici_id set edilir).
 *      - plan_tipi='PLANLI', onay_durumu='ONAYSIZ' (metadata degismez)
 *
 *   2) Plaka KAYITLI + bugün için PLANLI görev YOK:
 *      - Yeni görev INSERT: arac_id=mevcut, ekstra=true, onay_durumu='ONAYSIZ'
 *      - Amir onayı GEREKMEZ, bildirim gönderilmez
 *      - plan_tipi='PLANSIZ'
 *
 *   3) Plaka KAYITSIZ:
 *      - Yeni görev INSERT: arac_id=null, ekstra=true, onay_durumu='ONAY_BEKLIYOR'
 *      - Amire bildirim + FCM push
 *      - plan_tipi='EKSTRA'
 *
 * Üç senaryoda da response.plan_tipi ile hangi dallanmaya girildiği net döner.
 * Mobil aynı isteği yollar (mobilin karar mekanizması yok, backend otomatik).
 *
 * Karar kaynağı: kullanıcı 2026-07-09 — "plaka kayıtlı ise mobil UI bir
 * uyarı göstermez, doğrudan planlı ya da plansız kabul eder. Mobilin
 * yapması gereken bir şey yok, backend halletsin."
 *
 * Mobil ekip spec: parent_id 40a291f6-b400-4703-9326-b863c649165d (1.0.34).
 *
 * Headers:
 *   X-Device-Token
 *
 * Body:
 *   { lokasyon_id: uuid, plaka: string }
 *
 * Response (200 planli-devam / 201 yeni-kayit):
 *   { ok: true, gorev_id, baslatilma_tarihi, durum: 'ISLEMDE',
 *     plan_tipi: 'PLANLI' | 'PLANSIZ' | 'EKSTRA',
 *     onay_durumu: 'ONAYSIZ' | 'ONAY_BEKLIYOR',
 *     plaka: <normalize>, kayitli: boolean, amir_bildirildi: boolean }
 *
 * Hata kodları:
 *   400 PLAKA_GECERSIZ         — normalize sonrası boş / geçersiz
 *   400 AMIR_ATANMAMIS         — SADECE kayıtsız plaka için — firma amiri atanmamış
 *   403 OTO_YIKAMA_YETKISI_YOK — personel istasyona yetkili değil
 *   403 ISTASYON_YETKI_YOK    — lokasyon_id personelin yetkili istasyonları arasında yok
 *   404 LOKASYON_YOK           — geçersiz lokasyon_id
 *   409 AYNI_PLAKA_ONAY_BEKLIYOR — kayıtsız plakada aynı plaka için AKTIF bekleyen kayıt
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserOtoYikamaUstIds } from '@/lib/oto-yikama/getUserOtoYikamaUstIds'
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

    // Firma amiri atanmis mi? (Amir SADECE kayitsiz plaka onay akisi icin gerekli;
    // kayitli plakada zaten onay istenmiyor. Yine de bilgiyi cek — kayitsiz case'de
    // guard uygulanacak.)
    const { data: firma } = await admin
      .from('firmalar')
      .select('oto_yikama_onay_yetkilisi_id')
      .eq('id', firmaId)
      .single()
    const amirId = (firma as any)?.oto_yikama_onay_yetkilisi_id as string | null

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

    // Plaka DB'de kayitli mi? Karar noktasi — kayitli ise ONAYSIZ (PLANSIZ,
    // amir onayi yok), degilse ONAY_BEKLIYOR (EKSTRA, amir onayi).
    // Kullanici karari (2026-07-09): mobil UI karar vermez, backend halleder.
    const { data: mevcut } = await admin
      .from('araclar')
      .select('id, plaka, departman, kullanici_adi_soyadi')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .eq('plaka', plaka)
      .maybeSingle()
    const kayitliArac = mevcut as { id: string; plaka: string; departman: string | null; kullanici_adi_soyadi: string | null } | null

    // Sadece KAYITSIZ plaka icin amir + AYNI_PLAKA_ONAY_BEKLIYOR kontrolleri
    if (!kayitliArac) {
      if (!amirId) {
        return NextResponse.json(
          { ok: false, code: 'AMIR_ATANMAMIS', error: 'Firmada oto yıkama onay yetkilisi atanmamış — kayıtsız plaka yıkaması devre dışı' },
          { status: 400, headers: CORS },
        )
      }
      // Ayni plaka icin AKTIF (ONAY_BEKLIYOR) kayit var mi?
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
    }

    const now = new Date().toISOString()
    const hedefTarih = bugunTR()

    // Kayit lokasyonu: mobil'in gonderdigi body.lokasyon_id (personel'in bulundugu
    // istasyon — child). Onceki commit'lerdeki getPersonelIstasyonId revizyonu
    // iptal edildi cunku users.ust_lokasyon_id parent (ARAC YIKAMA) donuyordu.
    const kayitLokasyonId = lokasyonId

    // ==== DAL 1: Kayitli plaka + bugun PLANLI gorev VAR ise mevcut gorevi ISLEMDE'ye cek ====
    // Kullanici kurali (2026-07-09): Plaka kayitli ise ve bugun yikama plani var ise
    // backend planli doner (yeni gorev olusturmaz, mevcut planli gorevi baslatir).
    // Bu sayede mukerrer kayit engellenir — 16CAH315 senaryosu.
    if (kayitliArac) {
      const { data: planliMeta } = await admin
        .from('oto_yikama_gorev_metadata')
        .select('gorev_id, gorev:gorevler!inner(id, durum, firma_id, atanan_kullanici_id, lokasyon_id)')
        .eq('arac_id', kayitliArac.id)
        .eq('hedef_tarih', hedefTarih)
        .eq('ekstra', false)
        .eq('gorev.firma_id', firmaId)
        .in('gorev.durum', ['HAZIR', 'ACIK'])
        .limit(1)
        .maybeSingle()

      const planliGorev = (planliMeta as any)?.gorev
      if (planliGorev) {
        const patch: Record<string, any> = {
          durum: 'ISLEMDE',
          baslatilma_tarihi: now,
          durum_degisim_tarihi: now,
          baslatan_kullanici_id: userId,
        }
        if (planliGorev.atanan_kullanici_id == null) {
          patch.atanan_kullanici_id = userId
        }
        // NOT: onceki "istasyon revizyonu" iptal edildi (2026-07-09) —
        // parent lokasyon dondugu icin gorevin lokasyonu bozuluyordu.
        // Planli gorevin mevcut lokasyon_id'si (araca varsayilan child) korunur.
        // Optimistic lock: durum HAZIR/ACIK degistiyse (race), update etkisiz
        const { data: updated, error: upErr } = await admin
          .from('gorevler')
          .update(patch)
          .eq('id', planliGorev.id)
          .in('durum', ['HAZIR', 'ACIK'])
          .select('id, baslatilma_tarihi')
          .maybeSingle()
        if (upErr) {
          return NextResponse.json(
            { ok: false, error: upErr.message },
            { status: 500, headers: CORS },
          )
        }
        if (updated) {
          return NextResponse.json(
            {
              ok: true,
              gorev_id: planliGorev.id,
              baslatilma_tarihi: (updated as any).baslatilma_tarihi,
              durum: 'ISLEMDE',
              plan_tipi: 'PLANLI',
              onay_durumu: 'ONAYSIZ',
              plaka,
              kayitli: true,
              amir_bildirildi: false,
            },
            { status: 200, headers: CORS },
          )
        }
        // Race: baska biri baslatmis olabilir → PLANSIZ INSERT'e dus (asagida)
      }
    }

    // ==== DAL 2 (kayitli, planli yok) veya DAL 3 (kayitsiz): YENI INSERT ====
    // 1) gorevler INSERT — durum ISLEMDE olarak baslar
    // Tanim: kayitli plaka icin "Plansiz yikama", kayitsiz icin "Tanimsiz plaka".
    const gorevTanim = kayitliArac
      ? `Oto Yıkama — Plansız yıkama: ${plaka}`
      : `Oto Yıkama — Tanımsız plaka: ${plaka}`
    const { data: newGorev, error: gErr } = await admin
      .from('gorevler')
      .insert({
        tanim: gorevTanim,
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

    // 2) metadata INSERT — kayitli plaka: arac_id + ONAYSIZ; kayitsiz: null + ONAY_BEKLIYOR
    const metaOnay: 'ONAYSIZ' | 'ONAY_BEKLIYOR' = kayitliArac ? 'ONAYSIZ' : 'ONAY_BEKLIYOR'
    const { error: mErr } = await admin
      .from('oto_yikama_gorev_metadata')
      .insert({
        gorev_id: newGorev.id,
        arac_id: kayitliArac?.id ?? null,
        plaka_snapshot: plaka,
        hedef_tarih: hedefTarih,
        ekstra: true,
        onay_durumu: metaOnay,
      })
    if (mErr) {
      // Rollback: metadata yazamadıysak görevi de sil
      await admin.from('gorevler').delete().eq('id', newGorev.id)
      return NextResponse.json(
        { ok: false, error: mErr.message },
        { status: 500, headers: CORS },
      )
    }

    // 3) Amire bildirim — SADECE kayitsiz plaka icin (kayitli plakada onay istenmiyor).
    // Bildirim başarısız olsa bile yıkama tamamlanmalı; sessizce try/catch
    let amirBildirildi = false
    if (!kayitliArac && amirId) {
      amirBildirildi = true
      ;(async () => {
        try {
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
          const { sendFCMToUser } = await import('@/lib/fcm-sender')
          await sendFCMToUser(amirId, baslik, `${plaka} — ${personelAd}`, 'gorev_uyari')
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[tanimsiz-baslat] bildirim gönderilemedi:', err)
        }
      })()
    }

    return NextResponse.json(
      {
        ok: true,
        gorev_id: newGorev.id,
        baslatilma_tarihi: newGorev.baslatilma_tarihi,
        durum: 'ISLEMDE',
        plan_tipi: kayitliArac ? 'PLANSIZ' : 'EKSTRA',
        onay_durumu: metaOnay,
        plaka,
        kayitli: kayitliArac !== null,
        amir_bildirildi: amirBildirildi,
      },
      { status: 201, headers: CORS },
    )
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('[tanimsiz-baslat] hata:', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
