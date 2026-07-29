import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/gece-dongu
 *
 * Supabase pg_cron `qrsync-gece-dongu` her gece **00:30 TRT (21:30 UTC)**
 * çağırır (SELECT gece_tam_dongu()). Bu route yedek/manuel tetik yolu.
 *
 * Zaman seçimi kritik:
 *   - Vardiya bitiş anlarından SONRA olmalı (Çanakkale V3 16:00-00:00 gibi
 *     00:00'da biten vardiyalar dahil). Aksi halde gun_sonu_arsivle()
 *     vardiya devam ederken bugünkü tamamlananları arşive taşır, UI kartı
 *     eksik sayım gösterir.
 *   - gun_sonu_arsivle() ayrıca `vardiya_gunu < BUGUN` guard'ı taşır
 *     (migration: gun_sonu_arsivle_vardiya_gunu_guard) — cron zamanı ne
 *     olursa olsun bugünün görevleri arşivlenmez.
 *
 * Güvenlik: CRON_SECRET env değişkeni ile korunur.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const provided = req.headers.get('x-cron-secret') ?? url.searchParams.get('secret')
  const expected = process.env.CRON_SECRET

  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // Supabase RPC: gece_tam_dongu() → durum geçişleri + arşivle + üret
    const { data, error } = await admin.rpc('gece_tam_dongu')
    if (error) throw new Error(error.message)

    console.log('[cron/gece-dongu]', JSON.stringify(data))
    // Cron log kaydet
    await admin.from('cron_log').insert({ tip: 'gece_dongu', sonuc: data })
    return NextResponse.json({ ok: true, sonuc: data })
  } catch (err: any) {
    console.error('[cron/gece-dongu] HATA:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
