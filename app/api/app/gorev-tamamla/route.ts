/**
 * POST /api/app/gorev-tamamla
 * Mobil uygulama tarafından çağrılır.
 * Header: X-Device-Token — kayıtlı cihaz token'ı
 * Body: { gorev_id, gorev_tipi? }
 *   gorev_tipi: 'gorevler' (varsayılan) | 'canli_gorevler'
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const admin = createAdminClient()

    // ── Cihaz doğrulama ──────────────────────────────────────────────────────
    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli', kod: 'ESLESMEDI' }, { status: 401 })
    }

    const { data: tokenData, error: tokenErr } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, isim_soyisim')
      .eq('device_token', deviceToken)
      .single()

    if (tokenErr || !tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token', kod: 'ESLESMEDI' }, { status: 401 })
    }

    const { user_id: userId, firma_id: firmaId } = tokenData

    // ── İstek body ───────────────────────────────────────────────────────────
    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 })
    }

    const gorevId   = body?.gorev_id as string | undefined
    const gorevTipi = (body?.gorev_tipi as string | undefined) ?? 'gorevler'

    if (!gorevId) {
      return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400 })
    }
    if (!['gorevler', 'canli_gorevler'].includes(gorevTipi)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz gorev_tipi' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()

    // ── Görev kontrolü ───────────────────────────────────────────────────────
    const { data: gorev, error: gorevErr } = await admin
      .from(gorevTipi)
      .select('id, firma_id, durum, atanan_kullanici_id, baslatilma_tarihi')
      .eq('id', gorevId)
      .single()

    if (gorevErr || !gorev) {
      return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404 })
    }

    // Firma güvenlik kontrolü
    if (gorev.firma_id !== firmaId) {
      return NextResponse.json({ ok: false, error: 'Bu göreve erişim yetkiniz yok' }, { status: 403 })
    }

    // Atanan kullanıcı kontrolü
    if (gorev.atanan_kullanici_id && gorev.atanan_kullanici_id !== userId) {
      return NextResponse.json({ ok: false, error: 'Bu görev size atanmış değil' }, { status: 403 })
    }

    // Durum kontrolü
    const tamamlanabilir = gorevTipi === 'gorevler'
      ? ['ACIK', 'ISLEMDE'].includes(gorev.durum)
      : ['ACIK', 'ISLEMDE', 'BEKLEMEDE'].includes(gorev.durum)

    if (!tamamlanabilir) {
      return NextResponse.json({
        ok: false,
        error: `Görev zaten ${gorev.durum} durumunda, tamamlanamaz`,
      }, { status: 409 })
    }

    // ── Süre hesaplama ───────────────────────────────────────────────────────
    let sureSaniye: number | null = null
    if (gorev.baslatilma_tarihi) {
      const ms = new Date(nowIso).getTime() - new Date(gorev.baslatilma_tarihi).getTime()
      sureSaniye = Math.max(0, Math.floor(ms / 1000))
    }

    // ── Görevi tamamla ───────────────────────────────────────────────────────
    const { error: updateErr } = await admin
      .from(gorevTipi)
      .update({
        durum:                    'TAMAMLANDI',
        durum_degisim_tarihi:     nowIso,
        tamamlanma_tarihi:        nowIso,
        tamamlanma_suresi_saniye: sureSaniye,
        islemi_yapan_id:          userId,
      } as any)
      .eq('id', gorevId)

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })
    }

    // ── Cihaz son kullanım güncelle ──────────────────────────────────────────
    await admin
      .from('device_tokens')
      .update({ son_kullanim: nowIso })
      .eq('device_token', deviceToken)

    return NextResponse.json({
      ok: true,
      mesaj: 'Görev başarıyla tamamlandı',
      gorev_id: gorevId,
      gorev_tipi: gorevTipi,
      tamamlanma_tarihi: nowIso,
    })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
