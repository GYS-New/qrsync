import { NextRequest, NextResponse } from 'next/server'
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

  return NextResponse.json({
    ok: true,
    lokasyon: { id: lok.id, tanim: lok.tanim, ust_tanim: ustTanim },
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

  const { yildiz, yorum, ad_soyad, gsm, gorsel_url } = body

  if (!yildiz || yildiz < 1 || yildiz > 5) {
    return NextResponse.json({ ok: false, error: 'Geçerli bir değerlendirme puanı seçin (1-5)' }, { status: 400 })
  }

  // GSM opsiyonel — verilirse en az 10 rakam içermeli (uluslararası
  // format için sadece rakam sayısı; format serbest, mask yok).
  let gsmClean: string | null = null
  if (typeof gsm === 'string' && gsm.trim()) {
    const raw = gsm.trim()
    const digits = raw.replace(/\D/g, '')
    if (digits.length < 10) {
      return NextResponse.json({ ok: false, error: 'GSM numarası en az 10 rakam içermeli' }, { status: 400 })
    }
    gsmClean = raw.slice(0, 40)  // aşırı uzun payload'a karşı kalkan
  }

  const { lok, kanal } = await lokasyonBul(admin, params.token)
  if (!lok?.aktif) return NextResponse.json({ ok: false, error: 'Lokasyon bulunamadı' }, { status: 404 })

  const { ok, hata } = await firmaKontrol(admin, lok.firma_id, kanal!)
  if (!ok) return NextResponse.json({ ok: false, error: hata }, { status: 403 })

  const { ip, ua } = getRequestMeta(req)

  // ── EŞLEŞMİŞ CİHAZ KONTROLÜ ─────────────────────────────────────────────
  // Aynı firmaya ait aktif bir device_token (mobile app paired), son 30 gün
  // içinde IP VEYA User-Agent eşleşmesi varsa → bu cihaz çalışan cihazıdır.
  //
  // Çift kontrol: kullanıcı WiFi/mobil veri geçişi yaparak IP'yi
  // değiştirse bile UA tipik olarak sabit (cihaz modeli + OS sürümü).
  // Tek koşullu IP eşleşmesi bypass edilebiliyordu, UA fallback'i bunu
  // kapatır. Eski tokenlarda son_ip/son_user_agent NULL — doğal olarak
  // atlar. CGNAT/aynı cihaz modeli ortak ortamlarda yanlış-engellemeyi
  // görebilmek için her block audit log'a yazılır.
  if (ip || ua) {
    const pencereIso = new Date(Date.now() - ESLESME_PENCERESI_DK * 60 * 1000).toISOString()
    const baseQ = admin
      .from('device_tokens')
      .select('id, user_id, isim_soyisim, son_kullanim, son_ip, son_user_agent')
      .eq('firma_id', lok.firma_id)
      .eq('aktif', true)
      .gte('son_kullanim', pencereIso)

    // Önce IP eşleşmesini dene (daha hızlı, daha specific)
    let paired: any = null
    let eslesmeYontemi: 'IP' | 'UA' | null = null
    if (ip) {
      const { data } = await baseQ.eq('son_ip', ip).limit(1).maybeSingle()
      if (data) { paired = data; eslesmeYontemi = 'IP' }
    }
    // IP eşleşmediyse UA fallback'ini dene
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
