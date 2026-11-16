import { NextRequest, NextResponse } from 'next/server'
import { isValidPhoneNumber } from 'libphonenumber-js/min'
import { createAdminClient } from '@/lib/supabase/server'
import { getRequestMeta } from '@/lib/device/getRequestMeta'
import { auditLog } from '@/lib/audit/log'
import { musteriDegerlendirmeBildir } from '@/lib/notify/musteriDegerlendirmeBildir'

export const runtime = 'nodejs'

// Eşleşmiş cihaz tespit penceresi: son N dakika içinde aynı IP'den device_token aktivitesi
// varsa, gelen değerlendirme aynı çalışan tarafından yapılıyor say.
//
// 30 gün penceresi: app yüklü ve son 30 gün içinde mobil aktivite olan
// cihazların değerlendirme göndermesi engellenir. Pasifleşmiş cihazlar
// (aktif=true filtresiyle) zaten dışlanır — kullanıcı app'i silip token
// pasifleştirildiyse blok olmaz.
//
// Tarihsel: 60dk idi → bazı personeller offline çalışıp 4-16 saat app'e
// girmediği için kaçıyordu. 30 gün'e çıkarıldı; CGNAT yanlış pozitif
// riskinin az artması kabul edilen trade-off (her blok audit_log'a yazılır).
const ESLESME_PENCERESI_DK = 60 * 24 * 30  // 30 gün = 43.200 dk

// Token'dan lokasyonu bul — QR (qr_veri) veya NFC (nfc_token) fark etmez
async function lokasyonBul(admin: any, token: string) {
  // Önce QR dene
  const { data: byQr } = await admin
    .from('lokasyonlar')
    .select('id,tanim,firma_id,proje_id,aktif,parent_id')
    .eq('qr_veri', token)
    .maybeSingle()
  if (byQr) return { lok: byQr, kanal: 'QR' as const }

  // Sonra NFC dene
  const { data: byNfc } = await admin
    .from('lokasyonlar')
    .select('id,tanim,firma_id,proje_id,aktif,parent_id')
    .eq('nfc_token', token)
    .maybeSingle()
  if (byNfc) return { lok: byNfc, kanal: 'NFC' as const }

  return { lok: null, kanal: null }
}

// Firma kısıt kontrolü
async function firmaKontrol(admin: any, firmaId: string, kanal: 'QR' | 'NFC') {
  const { data: firma } = await admin
    .from('firmalar')
    .select('aktif,lisans_gecerlilik_tarihi,qr_sistemi_aktif,nfc_sistemi_aktif,firma_adi,ticari_unvan')
    .eq('id', firmaId)
    .single()

  if (!firma)              return { ok: false, hata: 'Firma bulunamadı', firma: null }
  if (!firma.aktif)        return { ok: false, hata: 'Sistem şu an aktif değil', firma: null }

  if (firma.lisans_gecerlilik_tarihi && new Date(firma.lisans_gecerlilik_tarihi) < new Date()) {
    return { ok: false, hata: 'Sistem lisansı geçersiz', firma: null }
  }

  if (kanal === 'QR'  && firma.qr_sistemi_aktif === false) return { ok: false, hata: 'QR sistemi aktif değil', firma: null }
  if (kanal === 'NFC' && firma.nfc_sistemi_aktif === false) return { ok: false, hata: 'NFC sistemi aktif değil', firma: null }

  return { ok: true, hata: null, firma }
}

// GET: sayfa ilk yüklenince bilgileri döndür
export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const admin = createAdminClient()
  const { lok, kanal } = await lokasyonBul(admin, params.token)

  if (!lok)        return NextResponse.json({ ok: false, error: 'Lokasyon bulunamadı' }, { status: 404 })
  if (!lok.aktif)  return NextResponse.json({ ok: false, error: 'Lokasyon aktif değil' }, { status: 403 })

  const { ok, hata, firma } = await firmaKontrol(admin, lok.firma_id, kanal!)
  if (!ok) return NextResponse.json({ ok: false, error: hata }, { status: 403 })

  // Üst lokasyon adı
  let ustTanim: string | null = null
  if (lok.parent_id) {
    const { data: ust } = await admin.from('lokasyonlar').select('tanim').eq('id', lok.parent_id).single()
    ustTanim = ust?.tanim ?? null
  }

  // Bu lokasyonun son temizlenme (TAMAMLANDI) zamani — 4 kaynak (canli, spesifik,
  // ve arsiv karsiliklari). En yeni olan alinir. Musteriye "X once temizlendi"
  // bilgisi vermek icin.
  async function sonTamamlanma(tablo: string): Promise<string | null> {
    try {
      const { data } = await admin.from(tablo)
        .select('tamamlanma_tarihi')
        .eq('lokasyon_id', lok.id)
        .eq('durum', 'TAMAMLANDI')
        .order('tamamlanma_tarihi', { ascending: false })
        .limit(1)
        .maybeSingle()
      return (data as any)?.tamamlanma_tarihi ?? null
    } catch { return null }
  }
  const tarihler = (await Promise.all([
    sonTamamlanma('canli_gorevler'),
    sonTamamlanma('gorevler'),
    sonTamamlanma('canli_gorevler_arsiv'),
    sonTamamlanma('gorevler_arsiv'),
  ])).filter((t): t is string => typeof t === 'string' && t.length > 0)
  const sonTemizlik: string | null = tarihler.length > 0
    ? tarihler.reduce((max: string, t: string) => t > max ? t : max)
    : null

  return NextResponse.json({
    ok: true,
    lokasyon: { id: lok.id, tanim: lok.tanim, ust_tanim: ustTanim, son_temizlik: sonTemizlik },
    firma:    { adi: firma.firma_adi || firma.ticari_unvan },
    kanal,
  })
}

// POST: değerlendirme kaydet
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const admin = createAdminClient()

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Geçersiz istek' }, { status: 400 })
  }

  const { yildiz, yorum, ad_soyad, gsm, gorsel_url, kvkk_onay } = body

  if (!yildiz || yildiz < 1 || yildiz > 5) {
    return NextResponse.json({ ok: false, error: 'Geçerli bir değerlendirme puanı seçin (1-5)' }, { status: 400 })
  }

  // GSM opsiyonel — verilirse libphonenumber-js ile format dogrulamasi.
  // Uluslararasi ('+' ile baslar) veya TR default (05..., 5...). '1234567890',
  // '0000000000' gibi gecersiz format sekilleri reddedilir. SMS OTP degil.
  let gsmClean: string | null = null
  if (typeof gsm === 'string' && gsm.trim()) {
    const raw = gsm.trim()
    let valid = false
    try {
      valid = isValidPhoneNumber(raw, 'TR')
    } catch {
      valid = false
    }
    if (!valid) {
      return NextResponse.json({ ok: false, error: 'Geçerli bir cep telefonu numarası girin' }, { status: 400 })
    }
    gsmClean = raw.slice(0, 40)  // aşırı uzun payload'a karşı kalkan
  }

  // KVKK onay: sadece telefon paylasilmis ise anlamli. Telefon yoksa false.
  const kvkkOnayBool: boolean = gsmClean !== null && kvkk_onay === true

  const { lok, kanal } = await lokasyonBul(admin, params.token)
  if (!lok?.aktif) return NextResponse.json({ ok: false, error: 'Lokasyon bulunamadı' }, { status: 404 })

  const { ok, hata } = await firmaKontrol(admin, lok.firma_id, kanal!)
  if (!ok) return NextResponse.json({ ok: false, error: hata }, { status: 403 })

  const { ip, ua } = getRequestMeta(req)

  // ── FAZ 1: EŞLEŞMİŞ CİHAZ KONTROLÜ (IP/UA) ───────────────────────────────
  // getRequestMeta artık CF-Connecting-IP önceliklidir — gerçek client IP.
  // Önce mevcut akış: aktif device_token + 30 gün IP veya UA eşleşmesi → BLOCK.
  if (ip || ua) {
    const pencereIso = new Date(Date.now() - ESLESME_PENCERESI_DK * 60 * 1000).toISOString()
    const baseQ = admin
      .from('device_tokens')
      .select('id, user_id, isim_soyisim, son_kullanim, son_ip, son_user_agent')
      .eq('firma_id', lok.firma_id)
      .eq('aktif', true)
      .gte('son_kullanim', pencereIso)

    let paired: any = null
    let eslesmeYontemi: 'IP' | 'UA' | null = null
    if (ip) {
      const { data } = await baseQ.eq('son_ip', ip).limit(1).maybeSingle()
      if (data) { paired = data; eslesmeYontemi = 'IP' }
    }
    if (!paired && ua) {
      const { data } = await baseQ.eq('son_user_agent', ua).limit(1).maybeSingle()
      if (data) { paired = data; eslesmeYontemi = 'UA' }
    }

    if (paired) {
      await auditLog({
        tip: 'cihaz_eslesmis_eval_block',
        tablo: 'musteri_degerlendirmeleri',
        firma_id: lok.firma_id,
        proje_id: lok.proje_id ?? null,
        detay: {
          lokasyon_id: lok.id,
          gelen_ip: ip,
          gelen_ua: ua,
          eslesme_yontemi: eslesmeYontemi,
          eslesen_token_id: paired.id,
          eslesen_user_id: paired.user_id,
          eslesen_isim: paired.isim_soyisim,
          eslesen_son_kullanim: paired.son_kullanim,
          eslesen_son_ip: paired.son_ip,
          eslesen_son_ua: paired.son_user_agent,
          pencere_dk: ESLESME_PENCERESI_DK,
        },
      })
      return NextResponse.json({
        ok: false,
        error: 'Bu cihaz sistemde çalışan kullanıcısı olarak kayıtlı. Müşteri değerlendirmesi gönderilemez.',
        code: 'CIHAZ_ESLESMIS',
      }, { status: 403 })
    }
  }

  // ── FAZ 2: KİMLİK EŞLEŞMESİ (ad_soyad / gsm users tablosuyla) ────────────
  // Personel kendini belli ediyor → BLOCK. Placeholder telefonlar (55555...)
  // ve tek-isim eşleşmeleri (örn "oktay") false-positive yaratabildiği için
  // GSM exact match + ad_soyad normalize (case/space-insensitive) exact match.
  const normAd = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const normTel = (s: string) => s.replace(/[^0-9]/g, '')
  const PLACEHOLDER_TELS = new Set(['05555555555', '05550000000', '5555555555', '5550000000'])

  const kimlikEslesen: { kaynak: 'GSM' | 'AD_SOYAD'; user_id: string; isim: string } | null = await (async () => {
    // GSM eşleşmesi (placeholder değilse)
    if (gsmClean) {
      const gsmNormalized = normTel(gsmClean)
      if (gsmNormalized.length >= 10 && !PLACEHOLDER_TELS.has(gsmNormalized)) {
        const { data } = await admin
          .from('users')
          .select('id, isim_soyisim, telefon')
          .eq('firma_id', lok.firma_id)
          .eq('aktif', true)
          .not('telefon', 'is', null)
          .limit(500)
        const match = (data ?? []).find((u: any) => normTel(u.telefon ?? '') === gsmNormalized)
        if (match) return { kaynak: 'GSM', user_id: match.id, isim: match.isim_soyisim ?? '' }
      }
    }
    // ad_soyad exact match (normalize)
    const adRaw = (ad_soyad ?? '').toString().trim()
    if (adRaw.length >= 3) {
      const adNormalized = normAd(adRaw)
      // Çok kısa tek-isimler (örn "Ali") false-positive yapar; iki kelime şartı.
      if (adNormalized.includes(' ')) {
        const { data } = await admin
          .from('users')
          .select('id, isim_soyisim')
          .eq('firma_id', lok.firma_id)
          .eq('aktif', true)
          .not('isim_soyisim', 'is', null)
          .limit(500)
        const match = (data ?? []).find((u: any) => normAd(u.isim_soyisim ?? '') === adNormalized)
        if (match) return { kaynak: 'AD_SOYAD', user_id: match.id, isim: match.isim_soyisim ?? '' }
      }
    }
    return null
  })()

  if (kimlikEslesen) {
    await auditLog({
      tip: 'kimlik_eslesen_eval_block',
      tablo: 'musteri_degerlendirmeleri',
      firma_id: lok.firma_id,
      proje_id: lok.proje_id ?? null,
      detay: {
        lokasyon_id: lok.id,
        gelen_ip: ip,
        gelen_ua: ua,
        kaynak: kimlikEslesen.kaynak,
        eslesen_user_id: kimlikEslesen.user_id,
        eslesen_isim: kimlikEslesen.isim,
        girilen_ad_soyad: ad_soyad ?? null,
        girilen_gsm: gsmClean,
      },
    })
    return NextResponse.json({
      ok: false,
      error: 'Belirtilen kimlik bilgileri firma personeline ait. Müşteri değerlendirmesi gönderilemez.',
      code: 'KIMLIK_ESLESMIS',
    }, { status: 403 })
  }

  // ── FAZ 2b: LOKASYON-PERSONEL SİNYALİ (soft — sadece audit) ──────────────
  // Değerlendirme yapılan lokasyonun ÜST lokasyonunda aktif device_token'li
  // personel çalışıyorsa → şüpheli (BLOCK DEĞİL, sadece audit_log'a işaretle).
  // Müşteri raporda şüpheli badge görür, karar verir.
  try {
    // Lokasyonun ÜST lokasyonunu bul (root ancestor)
    let ustLokId: string | null = lok.id
    for (let i = 0; i < 10; i++) {
      const { data: cur } = await admin.from('lokasyonlar').select('parent_id').eq('id', ustLokId!).maybeSingle()
      if (!cur?.parent_id) break
      ustLokId = cur.parent_id
    }
    if (ustLokId) {
      // Bu üst lokasyona yetkili aktif device_token'li personel var mı?
      const { data: users } = await admin
        .from('users')
        .select('id, isim_soyisim')
        .eq('firma_id', lok.firma_id)
        .eq('aktif', true)
        .eq('ust_lokasyon_id', ustLokId)
        .limit(1)
      if (users && users.length > 0) {
        const uIds = users.map((u: any) => u.id)
        const { data: dts } = await admin
          .from('device_tokens')
          .select('user_id')
          .eq('aktif', true)
          .in('user_id', uIds)
          .limit(1)
        if (dts && dts.length > 0) {
          await auditLog({
            tip: 'lokasyon_personelli_eval_suspheli',
            tablo: 'musteri_degerlendirmeleri',
            firma_id: lok.firma_id,
            proje_id: lok.proje_id ?? null,
            detay: {
              lokasyon_id: lok.id,
              ust_lokasyon_id: ustLokId,
              gelen_ip: ip,
              gelen_ua: ua,
              girilen_ad_soyad: ad_soyad ?? null,
              girilen_gsm: gsmClean,
              not: 'Bu üst lokasyonda aktif device_token\'li personel çalışıyor — değerlendirme şüpheli olabilir.',
            },
          })
          // Not: block etmiyoruz — sadece şüpheli log. Gerçek müşteri gelmiş olabilir.
        }
      }
    }
  } catch {
    // Audit sinyali — başarısız olursa akış kesilmez
  }

  const { error } = await admin.from('musteri_degerlendirmeleri').insert({
    lokasyon_id:      lok.id,
    firma_id:         lok.firma_id,
    proje_id:         lok.proje_id ?? null,
    qr_token:         params.token,
    kanal,
    yildiz,
    yorum:            yorum?.trim()    || null,
    ad_soyad:         ad_soyad?.trim() || null,
    gsm:              gsmClean,
    gorsel_url:       gorsel_url       || null,
    ip_adresi:        ip,
    user_agent:       ua,
    kvkk_onay:        kvkkOnayBool,
  })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Fire-and-forget bildirim (response'u bekletmez, hata değerlendirme akışını kırmaz)
  void musteriDegerlendirmeBildir({
    firmaId: lok.firma_id,
    lokasyonId: lok.id,
    lokasyonTanim: (lok as any).tanim,
    yildiz,
    yorum: yorum ?? null,
  })

  return NextResponse.json({ ok: true })
}
