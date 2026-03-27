import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/mesai-arsiv
 * Her gün 23:59 TRT'de çalışır (railway.json: "59 20 * * *" = 20:59 UTC = 23:59 TRT).
 * Bugün ve önceki tarihe ait henüz arşivlenmemiş tüm kayıtları arşive taşır (gün sonu).
 */
export async function GET(req: NextRequest) {
  const url      = new URL(req.url)
  const provided = req.headers.get('x-cron-secret') ?? url.searchParams.get('secret')
  const expected = process.env.CRON_SECRET
  if (expected && provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // TRT bugünün tarihi (UTC+3)
  const trtNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const bugun  = trtNow.toISOString().split('T')[0]

  // Bugün ve önceki tarihlere ait arşivlenmemiş kayıtları arşivle
  const { data, error } = await admin
    .from('personel_mesai_kayitlari')
    .update({
      arsivlendi:        true,
      arsivleme_tarihi:  new Date().toISOString(),
    })
    .eq('arsivlendi', false)
    .lte('kayit_tarihi', bugun)
    .select('id')

  if (error) {
    console.error('[cron/mesai-arsiv] HATA:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const sayi = data?.length ?? 0
  console.log(`[cron/mesai-arsiv] ${sayi} kayıt arşivlendi`)
  return NextResponse.json({ ok: true, arsivlenen: sayi })
}
