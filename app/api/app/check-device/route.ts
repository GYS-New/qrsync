import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getRequestMeta } from '@/lib/device/getRequestMeta'
import { auditLog } from '@/lib/audit/log'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

/**
 * GET /api/app/check-device
 *
 * Parametreler:
 *  - device_id           (zorunlu)
 *  - fallback_device_id  (opsiyonel, mobil 1.0.28+) — eski Capacitor UUID
 *                        formatından ANDROID_ID formatına geçişte recovery için
 *  - firma_id            (opsiyonel, yeni mobil — firma kodu çözümü sonrası)
 *  - firma               (opsiyonel, eski mobil — app_download_links.link_token)
 *
 * Davranış:
 *  1) firma_id / firma verilmişse → o firmaya göre eşleşme ara.
 *  2) Hiçbiri verilmemişse → yalnızca device_id ile ara, en son kullanılan
 *     kaydı döndür (uygulama silinip yeniden kurulduğunda auto-restore için).
 *  3) device_id ile bulunamazsa ve fallback_device_id verilmişse o ID ile ara.
 *     Bulursa device_tokens.device_id'yi yeni device_id ile günceller — bir
 *     sonraki recovery'de fallback gerekmez (silent migration).
 *  4) Eşleşme yoksa { ok: true, eskiKayit: null }
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const deviceId           = searchParams.get('device_id')
    const fallbackDeviceIdRaw = searchParams.get('fallback_device_id')
    const fallbackDeviceId   = fallbackDeviceIdRaw && fallbackDeviceIdRaw !== deviceId
      ? fallbackDeviceIdRaw
      : null
    const firmaIdParam = searchParams.get('firma_id')
    const firmaToken = searchParams.get('firma')

    if (!deviceId) {
      return NextResponse.json({ ok: false, error: 'device_id gerekli' }, { status: 400, headers: CORS_HEADERS })
    }

    const admin = createAdminClient()

    // ─────────────────────────────────────────────────────────────────────
    // 1) firma_id'yi belirle — verilmemişse son_kullanim DESC ile tahmin et
    // ─────────────────────────────────────────────────────────────────────
    let targetFirmaId: string | null = null

    if (firmaIdParam) {
      // Yeni mobil: firma kodu çözümlenmiş, direkt firma_id var.
      targetFirmaId = firmaIdParam
    } else if (firmaToken) {
      // Eski mobil: app_download_links.link_token.
      const { data: linkData, error: linkErr } = await admin
        .from('app_download_links')
        .select('firma_id, aktif')
        .eq('link_token', firmaToken)
        .single()
      if (linkErr || !linkData || !linkData.aktif) {
        return NextResponse.json({ ok: false, error: 'Geçersiz firma linki' }, { status: 404, headers: CORS_HEADERS })
      }
      targetFirmaId = linkData.firma_id
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2) device_tokens'ta eşleşme ara — önce yeni device_id, bulunmazsa fallback
    // ─────────────────────────────────────────────────────────────────────
    async function searchByDeviceId(did: string) {
      let q = admin
        .from('device_tokens')
        .select('id, device_token, user_id, isim_soyisim, proje_id, firma_id, son_kullanim, device_id')
        .eq('device_id', did)
        .eq('aktif', true)
        .order('son_kullanim', { ascending: false, nullsFirst: false })
        .limit(1)
      if (targetFirmaId) q = q.eq('firma_id', targetFirmaId)
      const { data } = await q
      return data?.[0] ?? null
    }

    let mevcutKayit = await searchByDeviceId(deviceId)
    let fallbackKullanildi = false

    if (!mevcutKayit && fallbackDeviceId) {
      // Mobil 1.0.28+ silent migration: eski Capacitor UUID ile ara
      mevcutKayit = await searchByDeviceId(fallbackDeviceId)
      fallbackKullanildi = !!mevcutKayit
    }

    if (!mevcutKayit) {
      return NextResponse.json({ ok: true, eskiKayit: null }, { headers: CORS_HEADERS })
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3) Kullanıcı hâlâ aktif mi?
    // ─────────────────────────────────────────────────────────────────────
    const { data: kullanici } = await admin
      .from('users')
      .select('id, isim_soyisim, aktif')
      .eq('id', mevcutKayit.user_id)
      .single()

    if (!kullanici?.aktif) {
      return NextResponse.json({ ok: true, eskiKayit: null }, { headers: CORS_HEADERS })
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4) Firma adını çek (yeni akışta auto-restore için)
    // ─────────────────────────────────────────────────────────────────────
    let firmaAdi: string | null = null
    if (mevcutKayit.firma_id) {
      const { data: firma } = await admin
        .from('firmalar')
        .select('firma_adi, ticari_unvan, aktif')
        .eq('id', mevcutKayit.firma_id)
        .single()
      if (!firma?.aktif) {
        // Firma pasif → eşleşme yok gibi davran
        return NextResponse.json({ ok: true, eskiKayit: null }, { headers: CORS_HEADERS })
      }
      firmaAdi = firma?.firma_adi || firma?.ticari_unvan || null
    }

    // Aktif kullanım anı — cihaz tekrar tanınıyor.
    // Fallback ile bulunmuşsa device_id'yi yeni (Android ID) ile güncelle ki
    // sonraki recovery direkt eşleşsin (silent migration).
    // Çakışma koruması: yeni device_id ile başka aktif kayıt varsa overwrite etme,
    // race condition'a düşmemek için (madde 6 spec).
    const { ip: reqIp, ua: reqUa } = getRequestMeta(req)
    const updatePayload: Record<string, any> = {
      son_kullanim: new Date().toISOString(),
      son_ip: reqIp,
      son_user_agent: reqUa,
    }
    if (fallbackKullanildi) {
      const { data: cakisma } = await admin
        .from('device_tokens')
        .select('id')
        .eq('device_id', deviceId)
        .eq('aktif', true)
        .neq('id', mevcutKayit.id)
        .limit(1)
      if (!cakisma || cakisma.length === 0) {
        updatePayload.device_id = deviceId
      }
    }
    await admin
      .from('device_tokens')
      .update(updatePayload)
      .eq('id', mevcutKayit.id)

    if (fallbackKullanildi) {
      void auditLog({
        tip: 'check_device_fallback_recovery',
        tablo: 'device_tokens',
        firma_id: mevcutKayit.firma_id ?? null,
        kullanici_id: mevcutKayit.user_id ?? null,
        detay: {
          device_token_id: mevcutKayit.id,
          eski_device_id_prefix: fallbackDeviceId!.slice(0, 8),
          yeni_device_id_prefix: deviceId.slice(0, 8),
          device_id_guncellendi: updatePayload.device_id != null,
          ip: reqIp,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      eskiKayit: {
        user_id:      mevcutKayit.user_id,
        isim_soyisim: mevcutKayit.isim_soyisim,
        proje_id:     mevcutKayit.proje_id,
        firma_id:     mevcutKayit.firma_id,
        firma_adi:    firmaAdi,
        device_token: mevcutKayit.device_token,
      },
    }, { headers: CORS_HEADERS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS_HEADERS })
  }
}
