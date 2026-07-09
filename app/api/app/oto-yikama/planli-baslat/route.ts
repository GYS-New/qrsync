/**
 * POST /api/app/oto-yikama/planli-baslat
 *
 * Mobil planlı yıkama BAŞLAT — saha personeli "Yıkamayı Başlat" deyince
 * çağrılır. Görevi ISLEMDE'ye çeker, baslatilma_tarihi yazılır, atanan
 * kullanıcı kendisi olur (atanmamışsa üstlenir).
 *
 * Mobil ekibinin saha raporu (2026-06-22, msg a75d330d):
 * Mevcut tasarımda planlı görev için BAŞLAT backend'e iletilmiyordu →
 * görevler ACIK'ta kalıyor, race condition + ISLEMDE timeout cron'u
 * tetiklenmiyor → zombi görevler. Bu endpoint o açığı kapatır.
 *
 * Headers:
 *   X-Device-Token
 *
 * Body:
 *   { gorev_id: "<uuid>" }
 *
 * Response (200):
 *   { ok: true, gorev_id, baslatilma_tarihi, atanan_kullanici_id }
 *
 * Response (409 BASKA_ISLEMDE):
 *   Görev zaten başka biri tarafından ISLEMDE'ye çekilmiş.
 *
 * Response (409 ZATEN_TAMAMLANDI / IPTAL):
 *   Terminal duruma geçmiş; başlatılamaz.
 *
 * Response (403 OTO_YIKAMA_YETKISI_YOK):
 *   Kullanıcı yıkama personeli değil.
 *
 * Response (404 GOREV_YOK):
 *   Görev bulunamadı veya farklı firma/lokasyon scope.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserOtoYikamaUstIds } from '@/lib/oto-yikama/getUserOtoYikamaUstIds'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export const dynamic = 'force-dynamic'

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
    const gorevId = typeof body?.gorev_id === 'string' ? body.gorev_id : ''
    if (!gorevId) {
      return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400, headers: CORS })
    }

    // Yıkama personeli kontrolü
    const yetkiliUstIds = await getUserOtoYikamaUstIds(admin, userId, firmaId)
    if (yetkiliUstIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Oto Yıkama lokasyonuna yetkili değilsiniz', code: 'OTO_YIKAMA_YETKISI_YOK' },
        { status: 403, headers: CORS },
      )
    }

    // Yetkili üst lokasyonların alt lokasyonları
    const { data: altLoks } = await admin
      .from('lokasyonlar')
      .select('id')
      .in('parent_id', yetkiliUstIds)
      .eq('aktif', true)
    const lokIds = (altLoks ?? []).map((l: any) => l.id)
    if (lokIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Yıkama istasyonu bulunamadı', code: 'ISTASYON_YOK' },
        { status: 403, headers: CORS },
      )
    }

    // Görevi çek — firma + lokasyon scope ile metadata join doğrulaması
    const { data: gorev } = await admin
      .from('gorevler')
      .select('id, durum, firma_id, lokasyon_id, atanan_kullanici_id, baslatilma_tarihi')
      .eq('id', gorevId)
      .maybeSingle()

    if (!gorev) {
      return NextResponse.json(
        { ok: false, error: 'Görev bulunamadı', code: 'GOREV_YOK' },
        { status: 404, headers: CORS },
      )
    }
    if (gorev.firma_id !== firmaId || !lokIds.includes(gorev.lokasyon_id)) {
      // Scope dışı — varlığı gizle (information disclosure önle)
      return NextResponse.json(
        { ok: false, error: 'Görev bulunamadı', code: 'GOREV_YOK' },
        { status: 404, headers: CORS },
      )
    }
    // Metadata var mı (oto yıkama görevi olduğunu doğrula)
    const { data: meta } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('gorev_id')
      .eq('gorev_id', gorevId)
      .maybeSingle()
    if (!meta) {
      return NextResponse.json(
        { ok: false, error: 'Bu görev Oto Yıkama görevi değil', code: 'OTO_YIKAMA_DEGIL' },
        { status: 400, headers: CORS },
      )
    }

    // Terminal durum?
    if (['TAMAMLANDI', 'IPTAL', 'YAPILAMADI'].includes(gorev.durum)) {
      return NextResponse.json(
        { ok: false, error: `Görev "${gorev.durum}" durumunda — başlatılamaz`, code: 'ZATEN_TAMAMLANDI', durum: gorev.durum },
        { status: 409, headers: CORS },
      )
    }

    // Zaten ISLEMDE — başka kullanıcı (veya aynı kullanıcı) çoktan başlatmış
    if (gorev.durum === 'ISLEMDE') {
      // Kendisi çoktan başlatmışsa idempotent OK dön (mobil tarafının
      // double-tap, network retry vb. senaryolarında işine yarar)
      if (gorev.atanan_kullanici_id === userId) {
        return NextResponse.json(
          {
            ok: true,
            gorev_id: gorev.id,
            baslatilma_tarihi: gorev.baslatilma_tarihi,
            atanan_kullanici_id: gorev.atanan_kullanici_id,
            note: 'Zaten siz başlatmıştınız (idempotent)',
          },
          { headers: CORS },
        )
      }
      // Başka kullanıcı başlatmış
      const { data: digerKisi } = await admin
        .from('users').select('isim_soyisim').eq('id', gorev.atanan_kullanici_id).maybeSingle()
      return NextResponse.json(
        {
          ok: false,
          code: 'BASKA_ISLEMDE',
          error: `Bu görev ${digerKisi?.isim_soyisim ?? 'başka bir kullanıcı'} tarafından başlatılmış.`,
          atanan_kullanici_id: gorev.atanan_kullanici_id,
        },
        { status: 409, headers: CORS },
      )
    }

    // Görev HAZIR veya ACIK → ISLEMDE'ye çek
    // Atomic update: optimistic locking için durum filtresi (race condition)
    const now = new Date().toISOString()
    const patch: Record<string, unknown> = {
      durum: 'ISLEMDE',
      baslatilma_tarihi: now,
      durum_degisim_tarihi: now,
      baslatan_kullanici_id: userId,
    }
    // Atanan_kullanici_id NULL ise üstlen; doluysa dokunma
    if (gorev.atanan_kullanici_id == null) {
      patch.atanan_kullanici_id = userId
    }
    // NOT: Onceki commit'lerdeki "istasyon revizyonu" (getPersonelIstasyonId)
    // iptal edildi — users.ust_lokasyon_id parent (ARAC YIKAMA) donuyordu ve
    // gorevler.lokasyon_id parent olarak yazilip rapor grafiginde
    // sahte 'ARAC YIKAMA' istasyonu belirtiyordu (2026-07-09 bugu).
    // Aracin varsayilan istasyonu (child) korunur.

    const { data: updated, error: upErr } = await admin
      .from('gorevler')
      .update(patch)
      .eq('id', gorevId)
      .in('durum', ['HAZIR', 'ACIK'])  // optimistic: durum değişmişse update etkisiz
      .select('id, durum, baslatilma_tarihi, atanan_kullanici_id')
      .maybeSingle()

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: upErr.message },
        { status: 500, headers: CORS },
      )
    }
    if (!updated) {
      // Race condition: başka biri bu arada başlatmış olabilir
      return NextResponse.json(
        {
          ok: false,
          code: 'BASKA_ISLEMDE',
          error: 'Bu görev az önce başka bir kullanıcı tarafından başlatıldı.',
        },
        { status: 409, headers: CORS },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        gorev_id: updated.id,
        baslatilma_tarihi: updated.baslatilma_tarihi,
        atanan_kullanici_id: updated.atanan_kullanici_id,
      },
      { headers: CORS },
    )
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
