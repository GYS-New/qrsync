import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/oto-yikama-gorev-uret
 *
 * Araçların döngüsel yıkama kurallarına göre ertesi gün için HAZIR görevleri
 * otomatik üretir. Railway cron her gece 23:55 TR (20:55 UTC) tetikler —
 * yapılamadı/hazir-acik cron'larından ÖNCE çalışır:
 *
 *   23:55 → gorev-uret (ertesi gün için HAZIR'lar oluşur)
 *   23:59 → mesai-arsiv (GYS)
 *   00:00 → yapilamadi (dünün AÇIK'ları → YAPILAMADI)
 *   00:01 → hazir-acik (bugüne ait HAZIR'lar → AÇIK)
 *   00:05 → gece-dongu (GYS)
 *   00:30 → arsiv (eski → arşiv)
 *
 * Sadece varsayilan_lokasyon_id dolu ve uygun kurallı araçlar için görev
 * üretilir. Duplicate koruma metadata UNIQUE(arac_id, hedef_tarih) ile.
 *
 * Güvenlik: CRON_SECRET header veya query param ile korunur.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const provided = req.headers.get('x-cron-secret') ?? url.searchParams.get('secret')
  const expected = process.env.CRON_SECRET

  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('oto_yikama_gorev_uret_ertesi_gun')
    if (error) throw new Error(error.message)

    console.log('[cron/oto-yikama-gorev-uret]', JSON.stringify(data))
    await admin.from('cron_log').insert({ tip: 'oto_yikama_gorev_uret', sonuc: data })
    return NextResponse.json({ ok: true, sonuc: data })
  } catch (err: any) {
    console.error('[cron/oto-yikama-gorev-uret] HATA:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
