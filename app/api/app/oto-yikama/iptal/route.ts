/**
 * POST /api/app/oto-yikama/iptal
 *
 * Mobil saha personeli "Yıkamayı İptal Et" butonu — anlık iptal akışı.
 * 6 saatlik zombi cron'u (max-sure-kontrol) zaten otomatik IPTAL yapıyor;
 * bu endpoint sahanın UI'dan tetiklediği anlık iptaller için.
 *
 * Mobil ekibinin talebi (2026-06-22, msg 271caa19): müşteri vazgeçti /
 * yanlış plaka / mola devri gibi durumlar için manuel iptal lazım.
 *
 * Headers:
 *   X-Device-Token
 *
 * Body:
 *   { gorev_id: "<uuid>", iptal_sebep?: "<text>" }
 *
 * Response (200):
 *   { ok: true, gorev_id, iptal_tarihi }
 *   (iptal_tarihi = durum_degisim_tarihi — DB'de ayrı iptal_tarihi kolonu yok)
 *
 * Response (404 GOREV_YOK):
 *   Görev bulunamadı veya scope dışı.
 *
 * Response (400 OTO_YIKAMA_DEGIL):
 *   Görevin oto_yikama_gorev_metadata kaydı yok.
 *
 * Response (409 ZATEN_KAPALI):
 *   Görev TAMAMLANDI / IPTAL / YAPILAMADI — iptal edilemez.
 *
 * Response (403 BASKA_PERSONELIN_GOREVI):
 *   Görev ISLEMDE ve başka kullanıcı başlatmış.
 *
 * Response (403 OTO_YIKAMA_YETKISI_YOK):
 *   Kullanıcı yıkama personeli değil.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserOtoYikamaUstIds } from '@/lib/oto-yikama/getUserOtoYikamaUstIds'
import { gorevDurumPayload } from '@/lib/gorev/durum-degistir'

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
    const userSebep = typeof body?.iptal_sebep === 'string' ? body.iptal_sebep.trim().slice(0, 500) : ''
    const iptalSebep = userSebep || 'Personel iptali'

    // Yıkama personeli kontrolü
    const yetkiliUstIds = await getUserOtoYikamaUstIds(admin, userId, firmaId)
    if (yetkiliUstIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Oto Yıkama lokasyonuna yetkili değilsiniz', code: 'OTO_YIKAMA_YETKISI_YOK' },
        { status: 403, headers: CORS },
      )
    }

    // Yetkili üst lokasyonların alt lokasyonları (istasyon scope)
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

    // Görevi çek
    const { data: gorev } = await admin
      .from('gorevler')
      .select('id, durum, firma_id, lokasyon_id, atanan_kullanici_id, baslatan_kullanici_id, baslatilma_tarihi')
      .eq('id', gorevId)
      .maybeSingle()

    if (!gorev) {
      return NextResponse.json(
        { ok: false, error: 'Görev bulunamadı', code: 'GOREV_YOK' },
        { status: 404, headers: CORS },
      )
    }
    if (gorev.firma_id !== firmaId || !lokIds.includes(gorev.lokasyon_id)) {
      // Scope dışı — varlığı gizle
      return NextResponse.json(
        { ok: false, error: 'Görev bulunamadı', code: 'GOREV_YOK' },
        { status: 404, headers: CORS },
      )
    }

    // Oto yıkama metadata var mı?
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
        { ok: false, error: `Görev "${gorev.durum}" durumunda — iptal edilemez`, code: 'ZATEN_KAPALI', durum: gorev.durum },
        { status: 409, headers: CORS },
      )
    }

    // ISLEMDE ise başlatan kullanıcı kontrolü
    if (gorev.durum === 'ISLEMDE') {
      const baslatan = gorev.baslatan_kullanici_id ?? gorev.atanan_kullanici_id
      if (baslatan && baslatan !== userId) {
        const { data: digerKisi } = await admin
          .from('users').select('isim_soyisim').eq('id', baslatan).maybeSingle()
        return NextResponse.json(
          {
            ok: false,
            code: 'BASKA_PERSONELIN_GOREVI',
            error: `Bu görev ${digerKisi?.isim_soyisim ?? 'başka bir kullanıcı'} tarafından başlatılmış.`,
            baslatan_kullanici_id: baslatan,
          },
          { status: 403, headers: CORS },
        )
      }
    }

    // Iptal et — atomic update, durum değişmemişse uygula
    const now = new Date()
    const elapsedSec = gorev.baslatilma_tarihi
      ? Math.max(0, Math.floor((now.getTime() - new Date(gorev.baslatilma_tarihi).getTime()) / 1000))
      : 0

    const payload = gorevDurumPayload('IPTAL', 'MOBIL', {
      at: now.toISOString(),
      iptal_sebep: iptalSebep,
      ek: {
        islemi_yapan_id: userId,
        ...(elapsedSec > 0 ? { tamamlanma_suresi_saniye: elapsedSec } : {}),
      },
    })

    const { data: updated, error: upErr } = await admin
      .from('gorevler')
      .update(payload)
      .eq('id', gorevId)
      .in('durum', ['HAZIR', 'ACIK', 'ISLEMDE'])  // optimistic — terminal'e geçmişse update etkisiz
      .select('id, durum, durum_degisim_tarihi')
      .maybeSingle()

    if (upErr) {
      return NextResponse.json(
        { ok: false, error: upErr.message },
        { status: 500, headers: CORS },
      )
    }
    if (!updated) {
      // Race: bu arada terminal'e geçmiş
      return NextResponse.json(
        {
          ok: false,
          code: 'ZATEN_KAPALI',
          error: 'Bu görev az önce başka bir akış tarafından kapatıldı.',
        },
        { status: 409, headers: CORS },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        gorev_id: updated.id,
        iptal_tarihi: updated.durum_degisim_tarihi,
      },
      { headers: CORS },
    )
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
