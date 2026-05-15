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

  const { yildiz, yorum, ad_soyad, gorsel_url } = body

  if (!yildiz || yildiz < 1 || yildiz > 5) {
    return NextResponse.json({ ok: false, error: 'Geçerli bir değerlendirme puanı seçin (1-5)' }, { status: 400 })
  }

  const { lok, kanal } = await lokasyonBul(admin, params.token)
  if (!lok?.aktif) return NextResponse.json({ ok: false, error: 'Lokasyon bulunamadı' }, { status: 404 })

  const { ok, hata } = await firmaKontrol(admin, lok.firma_id, kanal!)
  if (!ok) return NextResponse.json({ ok: false, error: hata }, { status: 403 })

  const { ip, ua } = getRequestMeta(req)

  // ── EŞLEŞMİŞ CİHAZ KONTROLÜ ─────────────────────────────────────────────
  // Aynı firmaya ait aktif bir device_token (mobile app paired), son 30 gün
  // içinde aynı IP'den heartbeat attıysa → bu cihaz çalışan cihazıdır.
  // Eski tokenlarda son_ip NULL — bu kontrol onları doğal olarak atlar.
  // CGNAT yanlış-engellemelerini görebilmek için her block audit log'a yazılır.
  if (ip) {
    const pencereIso = new Date(Date.now() - ESLESME_PENCERESI_DK * 60 * 1000).toISOString()
    const { data: paired } = await admin
      .from('device_tokens')
      .select('id, user_id, isim_soyisim, son_kullanim, son_user_agent')
      .eq('firma_id', lok.firma_id)
      .eq('aktif', true)
      .eq('son_ip', ip)
      .gte('son_kullanim', pencereIso)
      .limit(1)
      .maybeSingle()
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
          eslesen_token_id: (paired as any).id,
          eslesen_user_id: (paired as any).user_id,
          eslesen_isim: (paired as any).isim_soyisim,
          eslesen_son_kullanim: (paired as any).son_kullanim,
          eslesen_son_ua: (paired as any).son_user_agent,
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
