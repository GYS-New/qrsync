import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getRequestMeta } from '@/lib/device/getRequestMeta'
import { auditLog } from '@/lib/audit/log'

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

    // Başarısız register audit'i için ortak meta (kullanıcı bulunamasa bile log için)
    const { ip: auditIp, ua: auditUa } = getRequestMeta(req)
    const auditMetaBase = {
      device_id_kisaltma: typeof device_id === 'string' ? device_id.slice(0, 16) : null,
      isim_soyisim,
      ip: auditIp,
      ua: auditUa ? auditUa.slice(0, 160) : null,
    }

    if (kullaniciErr || !kullanici) {
      void auditLog({
        tip: 'mobil_register_basarisiz',
        tablo: 'device_tokens',
        firma_id: firmaId,
        kullanici_id: user_id ?? null,
        basarili: false,
        hata_mesaji: 'Kullanıcı bulunamadı',
        detay: { ...auditMetaBase, hata_kodu: 'KULLANICI_YOK' },
      })
      return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 404, headers: CORS_HEADERS })
    }

    if (!kullanici.aktif) {
      void auditLog({
        tip: 'mobil_register_basarisiz',
        tablo: 'device_tokens',
        firma_id: firmaId,
        kullanici_id: user_id,
        basarili: false,
        hata_mesaji: 'Hesap pasif',
        detay: { ...auditMetaBase, hata_kodu: 'HESAP_PASIF' },
      })
      return NextResponse.json({ ok: false, error: 'Hesabınız aktif değil' }, { status: 403, headers: CORS_HEADERS })
    }

    // ── ŞİFRE DOĞRULAMA (opsiyonel, mobil yeni sürüm için) ─────────────────
    // Geriye uyumluluk: eski mobil sürümler sifre göndermeyebilir — o zaman atlanır.
    // Yeni mobil sürümler (v>=X.Y.Z) sifre göndermek zorunda, mobil tarafta zorunlu.
    if (sifre !== undefined && sifre !== null && sifre !== '') {
      // Rate limit — brute force koruması
      const rl = kontrolRateLimit(device_id)
      if (!rl.izin) {
        void auditLog({
          tip: 'mobil_register_basarisiz',
          tablo: 'device_tokens',
          firma_id: firmaId,
          kullanici_id: user_id,
          basarili: false,
          hata_mesaji: `Rate limit kilidi, ${rl.kalanSn}sn kaldı`,
          detay: { ...auditMetaBase, hata_kodu: 'RATE_LIMIT_KILIDI', kalan_sn: rl.kalanSn },
        })
        return NextResponse.json({
          ok: false,
          error: `Çok fazla yanlış deneme. ${rl.kalanSn} saniye sonra tekrar deneyin.`,
          kilitli: true,
          kalan_sn: rl.kalanSn,
        }, { status: 429, headers: CORS_HEADERS })
      }

      // ŞİFRE DOĞRULAMA — DB-side bcrypt (Supabase Auth rate limit bypass)
      //
      // Önceden anon.auth.signInWithPassword kullanılıyordu, fakat:
      //   1) Supabase Auth servisinin kendi IP/email rate limit'i var
      //   2) Bir tablette art arda 3-4 farklı personel deneyince Supabase
      //      "Request rate limit reached" döndürüyor — kullanıcı doğru şifre
      //      yazsa bile sistem test bile etmeden "Şifre hatalı" gösteriyordu
      //      (10 Haz 2026 saha şikayeti: Cemil/Feride/Raşit).
      //
      // Çözüm: public.verify_user_password RPC (SECURITY DEFINER) doğrudan
      // auth.users.encrypted_password ile bcrypt karşılaştırması yapar,
      // Supabase Auth servisini hiç çağırmaz → rate limit tetiklenmez.
      //
      // Backend in-memory rate limit (yukarıdaki kontrolRateLimit) brute
      // force koruması için aynen kalıyor.
      const { data: rpcData, error: rpcErr } = await admin.rpc('verify_user_password', {
        p_user_id: user_id,
        p_password: sifre,
      })

      if (rpcErr) {
        console.error('[register] verify_user_password RPC fail:', rpcErr)
        void auditLog({
          tip: 'mobil_register_basarisiz',
          tablo: 'device_tokens',
          firma_id: firmaId,
          kullanici_id: user_id,
          basarili: false,
          hata_mesaji: 'Şifre doğrulama hatası: ' + (rpcErr.message ?? 'RPC fail'),
          detay: { ...auditMetaBase, hata_kodu: 'AUTH_RPC_HATA' },
        })
        return NextResponse.json({ ok: false, error: 'Sunucu hatası, lütfen tekrar deneyin' }, { status: 500, headers: CORS_HEADERS })
      }

      const sifreOk = rpcData === true
      if (!sifreOk) {
        yanlisDenemeKaydet(device_id)
        void auditLog({
          tip: 'mobil_register_basarisiz',
          tablo: 'device_tokens',
          firma_id: firmaId,
          kullanici_id: user_id,
          basarili: false,
          hata_mesaji: 'Şifre hatalı',
          detay: {
            ...auditMetaBase,
            hata_kodu: 'SIFRE_HATALI',
            // RPC-based: artık supabase_status/code yok, sadece bool
          },
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
