import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/oto-yikama-arsiv
 *
 * Hedef tarihi 30 günden eski tüm Oto Yıkama görevlerini (durumdan bağımsız)
 * oto_yikama_arsiv tablosuna taşır. Railway cron her gece tetikler.
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
    const { data, error } = await admin.rpc('oto_yikama_arsivle')
    if (error) throw new Error(error.message)

    console.log('[cron/oto-yikama-arsiv]', JSON.stringify(data))
    await admin.from('cron_log').insert({ tip: 'oto_yikama_arsiv', sonuc: data })
    return NextResponse.json({ ok: true, sonuc: data })
  } catch (err: any) {
    console.error('[cron/oto-yikama-arsiv] HATA:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
