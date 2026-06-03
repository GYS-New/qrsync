import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { gorevDurumPayload } from '@/lib/gorev/durum-degistir'
import { minSureKontrol } from '@/lib/tasks/minSureKontrol'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

function fmtSure(saniye: number): string {
  if (saniye < 60) return `${saniye} sn`
  const dk = Math.floor(saniye / 60)
  const sn = saniye % 60
  if (dk < 60) return sn > 0 ? `${dk} dk ${sn} sn` : `${dk} dk`
  const sa = Math.floor(dk / 60)
  const kalan = dk % 60
  return kalan > 0 ? `${sa} sa ${kalan} dk` : `${sa} sa`
}

/**
 * EKSTRA FREKANSİYEL GÖREV — TAMAMLA (mobil v1.0.28+ akışı)
 *
 * Spec: docs/MOBIL_EKIBE_EKSTRA_FREKANS.md (2026-06-02 revize, OYAK RENAULT talebi)
 *
 * /baslat ile durum=ISLEMDE açılmış ekstra görevi TAMAMLANDI'ya çeker.
 * Süre = now() - baslatilma_tarihi (saniye, integer). Mobile süreyi
 * manipüle edemez — backend hesaplar.
 *
 * Yetki: Görevi başlatan kullanıcı tamamlayabilir.
 * Görev kural_id IS NULL (yalnız ekstra) ve durum=ISLEMDE olmalı.
 */
export async function POST(req: Request) {
  try {
    const admin = createAdminClient()

    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401, headers: CORS })
    }

    const { data: tokenData } = await admin
      .from('device_tokens')
      .select('user_id, firma_id')
      .eq('device_token', deviceToken)
      .single()

    if (!tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
    }
    const { user_id: userId, firma_id: firmaId } = tokenData

    const { data: userData } = await admin.from('users').select('aktif').eq('id', userId).single()
    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF' },
        { status: 403, headers: CORS }
      )
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400, headers: CORS })
    }

    const gorevId = body?.gorev_id as string | undefined
    if (!gorevId) {
      return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400, headers: CORS })
    }

    // Görevi yükle + tam doğrulama
    const { data: gorev } = await admin
      .from('canli_gorevler')
      .select('id, firma_id, durum, kural_id, baslatilma_tarihi, baslatan_kullanici_id, lokasyon_id, tanim')
      .eq('id', gorevId)
      .maybeSingle()

    if (!gorev) {
      return NextResponse.json({ ok: false, error: 'Görev bulunamadı', code: 'GOREV_YOK' }, { status: 404, headers: CORS })
    }
    if (gorev.firma_id !== firmaId) {
      return NextResponse.json({ ok: false, error: 'Bu göreve erişim yetkiniz yok', code: 'FIRMA_UYUMSUZ' }, { status: 403, headers: CORS })
    }
    if (gorev.kural_id != null) {
      return NextResponse.json({ ok: false, error: 'Bu endpoint sadece ekstra (kural dışı) görevler için kullanılır', code: 'KURAL_GOREV_GECERSIZ' }, { status: 400, headers: CORS })
    }
    if (gorev.durum !== 'ISLEMDE') {
      return NextResponse.json(
        { ok: false, error: `Görev tamamlanabilir durumda değil (mevcut durum: ${gorev.durum})`, code: 'DURUM_GECERSIZ' },
        { status: 409, headers: CORS }
      )
    }
    if (gorev.baslatan_kullanici_id !== userId) {
      return NextResponse.json(
        { ok: false, error: 'Bu görevi yalnızca başlatan personel tamamlayabilir', code: 'BASLATAN_DEGIL' },
        { status: 403, headers: CORS }
      )
    }
    if (!gorev.baslatilma_tarihi) {
      return NextResponse.json(
        { ok: false, error: 'Görevin başlatılma zamanı bulunamadı', code: 'BASLATILMA_YOK' },
        { status: 500, headers: CORS }
      )
    }

    // Min süre validasyonu — /api/qr/[token] ile aynı kural (lokasyon.min_sure_dakika).
    // Mobile 1.0.28+ wall-clock kontrolü yapıyor + Tamamla butonu disabled,
    // backend defense-in-depth. Spec: docs/MOBIL_EKIBE_MIN_MAX_SURE_BACKEND.md
    const minHata = await minSureKontrol(admin, gorevId, 'canli_gorevler')
    if (minHata) {
      void auditLog({
        tip: 'min_sure_bypass_denemesi',
        tablo: 'canli_gorevler',
        firma_id: firmaId,
        kullanici_id: userId,
        detay: {
          gorev_id: gorevId,
          lokasyon_id: minHata.lokasyon_id,
          gercek_gecen_sn: minHata.gercek_gecen_sn,
          min_gereken_sn: minHata.min_gereken_sn,
          kalan_sn: minHata.kalan_sn,
          kanal: 'MOBIL',
          akis: 'ekstra-frekans/tamamla',
        },
      })
      return NextResponse.json({ ok: false, ...minHata }, { status: 400, headers: CORS })
    }

    const nowIso = new Date().toISOString()
    const baslatMs = new Date(gorev.baslatilma_tarihi as any).getTime()
    const sureSn = Math.max(0, Math.round((Date.now() - baslatMs) / 1000))

    const updatePayload = {
      tamamlanma_tarihi:        nowIso,
      tamamlanma_suresi_saniye: sureSn,
      tamamlayan_kullanici_id:  userId,
      islemi_yapan_id:          userId,
      ...gorevDurumPayload('TAMAMLANDI', 'MOBIL', { at: nowIso }),
    }

    const { error: updErr } = await admin
      .from('canli_gorevler')
      .update(updatePayload as any)
      .eq('id', gorevId)
      .eq('durum', 'ISLEMDE')   // optimistic: başkası araya girip tamamlamadıysa

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message ?? 'Güncelleme hatası' }, { status: 500, headers: CORS })
    }

    // Device token son kullanım
    await admin
      .from('device_tokens')
      .update({ son_kullanim: nowIso })
      .eq('device_token', deviceToken)

    void auditLog({
      tip: 'ekstra_frekans_tamamla',
      tablo: 'canli_gorevler',
      firma_id: firmaId,
      kullanici_id: userId,
      detay: {
        gorev_id: gorevId,
        lokasyon_id: gorev.lokasyon_id,
        tanim: gorev.tanim,
        sure_saniye: sureSn,
        kanal: 'MOBIL',
      },
    })

    return NextResponse.json({
      ok: true,
      mesaj: `✓ Ekstra görev tamamlandı (${fmtSure(sureSn)})`,
      gorev_id: gorevId,
      tamamlanma_tarihi: nowIso,
      tamamlanma_suresi_saniye: sureSn,
    }, { headers: CORS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
