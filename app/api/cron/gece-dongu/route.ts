import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/gece-dongu
 *
 * Vercel Cron veya harici scheduler tarafından her gece 00:01 TRT (21:01 UTC) çağrılır.
 * Supabase pg_cron ile de çalışıyor, bu route yedek/alternatif olarak durur.
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
