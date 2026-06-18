import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/oto-yikama-yapilamadi
 *
 * Hedef tarihi geçmiş ama hâlâ AÇIK olan Oto Yıkama görevlerini YAPILAMADI
 * durumuna çevirir. Railway cron her gece 00:00 TR (21:00 UTC) tetikler —
 * HAZIR→AÇIK cron'undan (00:01 TR) ÖNCE çalışır.
 *
 * İŞLEMDE durumundakilere dokunulmaz (personel sabah devam edebilir).
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
    const { data, error } = await admin.rpc('oto_yikama_acik_to_yapilamadi')
    if (error) throw new Error(error.message)

    console.log('[cron/oto-yikama-yapilamadi]', JSON.stringify(data))
    await admin.from('cron_log').insert({ tip: 'oto_yikama_yapilamadi', sonuc: data })
    return NextResponse.json({ ok: true, sonuc: data })
  } catch (err: any) {
    console.error('[cron/oto-yikama-yapilamadi] HATA:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
