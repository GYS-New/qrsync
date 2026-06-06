import { NextResponse } from 'next/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { getRequestMeta } from '@/lib/device/getRequestMeta'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

// Basit in-memory brute-force koruması
// Not: Railway tek process çalıştırıyor — Map yeterli.
// Scaling sonrası DB-backed rate limit'e geçilebilir.
const MAX_DENEME = 5
const KILIT_MS   = 15 * 60 * 1000 // 15 dk
const denemeler = new Map<string, { sayi: number; kilitBitis: number }>()

function kontrolRateLimit(deviceId: string): { izin: boolean; kalanSn?: number } {
  const now = Date.now()
  const rec = denemeler.get(deviceId)
  if (!rec) return { izin: true }
  if (rec.kilitBitis > now) return { izin: false, kalanSn: Math.ceil((rec.kilitBitis - now) / 1000) }
  if (rec.kilitBitis && rec.kilitBitis <= now) denemeler.delete(deviceId)
  return { izin: true }
}
function yanlisDenemeKaydet(deviceId: string) {
  const rec = denemeler.get(deviceId) ?? { sayi: 0, kilitBitis: 0 }
  rec.sayi += 1
  if (rec.sayi >= MAX_DENEME) rec.kilitBitis = Date.now() + KILIT_MS
  denemeler.set(deviceId, rec)
}
function basariyiTemizle(deviceId: string) { denemeler.delete(deviceId) }

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { firma_token, firma_id: firmaIdParam, device_id, user_id, isim_soyisim, proje_id, sifre } = body
    const appVersion: string | null = typeof body.app_version === 'string' && body.app_version.trim()
      ? body.app_version.trim().slice(0, 20)
      : null

    if ((!firma_token && !firmaIdParam) || !device_id || !user_id || !isim_soyisim) {
      return NextResponse.json({ ok: false, error: 'Eksik parametreler (firma_token veya firma_id gerekli)' }, { status: 400, headers: CORS_HEADERS })
    }

    const admin = createAdminClient()

    // Firma_id'yi iki yoldan çözümle: firma_id direkt veya firma_token
    let firmaId: string = ''
    let mod = 'QR'
    if (firmaIdParam) {
      const { data: firma, error: firmaErr } = await admin
        .from('firmalar')
        .select('id, aktif')
        .eq('id', firmaIdParam)
        .single()
      if (firmaErr || !firma) {
        return NextResponse.json({ ok: false, error: 'Firma bulunamadı' }, { status: 404, headers: CORS_HEADERS })
      }
      if (!firma.aktif) {
        return NextResponse.json({ ok: false, error: 'Firma aktif değil' }, { status: 403, headers: CORS_HEADERS })
      }
      firmaId = firma.id
      const { data: linkRow } = await admin
        .from('app_download_links')
        .select('mod')
        .eq('firma_id', firmaId)
        .eq('aktif', true)
        .limit(1)
        .maybeSingle()
      mod = linkRow?.mod || 'QR'
    } else {
      const { data: linkData, error: linkErr } = await admin
        .from('app_download_links')
        .select('firma_id, aktif, mod')
        .eq('link_token', firma_token)
        .single()
      if (linkErr || !linkData) {
        return NextResponse.json({ ok: false, error: 'Geçersiz firma linki' }, { status: 404, headers: CORS_HEADERS })
      }
      if (!linkData.aktif) {
        return NextResponse.json({ ok: false, error: 'Bu link artık aktif değil' }, { status: 403, headers: CORS_HEADERS })
      }
      firmaId = firmaId
      mod = linkData.mod || 'QR'
    }

    const { data: kullanici, error: kullaniciErr } = await admin
      .from('users')
      .select('id, isim_soyisim, firma_id, aktif')
      .eq('id', user_id)
      .eq('firma_id', firmaId)
      .single()

    if (kullaniciErr || !kullanici) {
      return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 404, headers: CORS_HEADERS })
    }

    if (!kullanici.aktif) {
      return NextResponse.json({ ok: false, error: 'Hesabınız aktif değil' }, { status: 403, headers: CORS_HEADERS })
    }

    // ── ŞİFRE DOĞRULAMA (opsiyonel, mobil yeni sürüm için) ─────────────────
    // Geriye uyumluluk: eski mobil sürümler sifre göndermeyebilir — o zaman atlanır.
    // Yeni mobil sürümler (v>=X.Y.Z) sifre göndermek zorunda, mobil tarafta zorunlu.
    if (sifre !== undefined && sifre !== null && sifre !== '') {
      // Rate limit — brute force koruması
      const rl = kontrolRateLimit(device_id)
      if (!rl.izin) {
        return NextResponse.json({
          ok: false,
          error: `Çok fazla yanlış deneme. ${rl.kalanSn} saniye sonra tekrar deneyin.`,
          kilitli: true,
          kalan_sn: rl.kalanSn,
        }, { status: 429, headers: CORS_HEADERS })
      }

      // Kullanıcının email'ini auth.users'dan çek
      const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(user_id)
      if (authErr || !authUser?.user?.email) {
        return NextResponse.json({ ok: false, error: 'Kullanıcı kimlik bilgileri alınamadı' }, { status: 500, headers: CORS_HEADERS })
      }

      // Ayrı (anon) client ile signInWithPassword — şifre doğrulaması
      const anon = createSupabaseJsClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
      )
      const { error: signErr } = await anon.auth.signInWithPassword({
        email: authUser.user.email,
        password: sifre,
      })

      if (signErr) {
        yanlisDenemeKaydet(device_id)
        // Hata detayı sunucu log'una düşer (debug için), kullanıcıya generik mesaj döner
        console.error('[register] signInWithPassword fail:', {
          email: authUser.user.email,
          message: signErr.message,
          status: (signErr as any).status,
          code: (signErr as any).code,
        })
        return NextResponse.json({
          ok: false,
          error: 'Şifre hatalı',
          sifre_hatali: true,
        }, { status: 401, headers: CORS_HEADERS })
      }

      basariyiTemizle(device_id)
    }

    const { data: mevcutKayit } = await admin
      .from('device_tokens')
      .select('id, device_token')
      .eq('device_id', device_id)
      .single()

    let deviceToken: string

    const { ip: reqIp, ua: reqUa } = getRequestMeta(req)

    if (mevcutKayit) {
      deviceToken = mevcutKayit.device_token
      await admin
        .from('device_tokens')
        .update({
          user_id,
          firma_id: firmaId,
          isim_soyisim: kullanici.isim_soyisim,
          proje_id: proje_id || null,
          aktif: true,
          son_kullanim: new Date().toISOString(),
          son_ip: reqIp,
          son_user_agent: reqUa,
          ...(appVersion ? { app_version: appVersion } : {}),
        })
        .eq('id', mevcutKayit.id)
    } else {
      const { data: yeniKayit, error: insertErr } = await admin
        .from('device_tokens')
        .insert({
          device_id,
          user_id,
          firma_id: firmaId,
          isim_soyisim: kullanici.isim_soyisim,
          proje_id: proje_id || null,
          aktif: true,
          kayit_tarihi: new Date().toISOString(),
          son_kullanim: new Date().toISOString(),
          son_ip: reqIp,
          son_user_agent: reqUa,
          ...(appVersion ? { app_version: appVersion } : {}),
        })
        .select('device_token')
        .single()

      if (insertErr || !yeniKayit) {
        return NextResponse.json({ ok: false, error: 'Kayıt oluşturulamadı: ' + insertErr?.message }, { status: 500, headers: CORS_HEADERS })
      }

      deviceToken = yeniKayit.device_token
    }

    return NextResponse.json({
      ok: true,
      device_token: deviceToken,
      user_id,
      isim_soyisim: kullanici.isim_soyisim,
      firma_id: firmaId,
      proje_id: proje_id || null,
      mod,
    }, { headers: CORS_HEADERS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS_HEADERS })
  }
}
