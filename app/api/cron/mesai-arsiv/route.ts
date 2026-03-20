import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/mesai-arsiv
 * Her saat başı çalışır (railway.json'a ekleyin).
 * Girişi 24 saatten önce olan ve henüz arşivlenmemiş kayıtları arşive taşır.
 */
export async function GET(req: NextRequest) {
  const url      = new URL(req.url)
  const provided = req.headers.get('x-cron-secret') ?? url.searchParams.get('secret')
  const expected = process.env.CRON_SECRET
  if (expected && provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // 24 saatten eski kayıtları arşivle
  const sinir = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('personel_mesai_kayitlari')
    .update({
      arsivlendi:        true,
      arsivleme_tarihi:  new Date().toISOString(),
    })
    .eq('arsivlendi', false)
    .lt('giris_saati', sinir)
    .select('id')

  if (error) {
    console.error('[cron/mesai-arsiv] HATA:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const sayi = data?.length ?? 0
  console.log(`[cron/mesai-arsiv] ${sayi} kayıt arşivlendi`)
  return NextResponse.json({ ok: true, arsivlenen: sayi })
}
