import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/oto-yikama-hazir-acik
 *
 * Hedef tarihi gelmiş HAZIR durumdaki Oto Yıkama görevlerini ACIK durumuna
 * geçirir. Railway cron her gece 00:01 TR (21:01 UTC) tetikler. Personel
 * mobil app'te ancak ACIK görevleri görür/işler.
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
    const { data, error } = await admin.rpc('oto_yikama_hazir_to_acik')
    if (error) throw new Error(error.message)

    console.log('[cron/oto-yikama-hazir-acik]', JSON.stringify(data))
    await admin.from('cron_log').insert({ tip: 'oto_yikama_hazir_acik', sonuc: data })
    return NextResponse.json({ ok: true, sonuc: data })
  } catch (err: any) {
    console.error('[cron/oto-yikama-hazir-acik] HATA:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
