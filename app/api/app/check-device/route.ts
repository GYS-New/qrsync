import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

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
 *  - device_id       (zorunlu)
 *  - firma_id        (opsiyonel, yeni mobil — firma kodu çözümü sonrası)
 *  - firma           (opsiyonel, eski mobil — app_download_links.link_token)
 *
 * Davranış:
 *  1) firma_id / firma verilmişse → o firmaya göre eşleşme ara.
 *  2) Hiçbiri verilmemişse → yalnızca device_id ile ara, en son kullanılan
 *     kaydı döndür (uygulama silinip yeniden kurulduğunda auto-restore için).
 *  3) Eşleşme yoksa { ok: true, eskiKayit: null }
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const deviceId   = searchParams.get('device_id')
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
    // 2) device_tokens'ta eşleşme ara
    // ─────────────────────────────────────────────────────────────────────
    let query = admin
      .from('device_tokens')
      .select('user_id, isim_soyisim, proje_id, firma_id, son_kullanim')
      .eq('device_id', deviceId)
      .eq('aktif', true)
      .order('son_kullanim', { ascending: false, nullsFirst: false })
      .limit(1)

    if (targetFirmaId) {
      query = query.eq('firma_id', targetFirmaId)
    }

    const { data: rows } = await query
    const mevcutKayit = rows?.[0] ?? null

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

    return NextResponse.json({
      ok: true,
      eskiKayit: {
        user_id: mevcutKayit.user_id,
        isim_soyisim: mevcutKayit.isim_soyisim,
        proje_id: mevcutKayit.proje_id,
        firma_id: mevcutKayit.firma_id,
        firma_adi: firmaAdi,
      },
    }, { headers: CORS_HEADERS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS_HEADERS })
  }
}
