/**
 * GET/POST /api/cron/pdks-token-temizle
 *
 * pdks_kullanilan_tokenlar tablosundan 10 dk'dan eski kayitlari siler.
 * Retention 10 dk: pencere_saniye (30) + tolerans (30) + guvenlik margin.
 *
 * Cron her 1 saatte 1 kez calisir yeterli (tablo 1 gun boyunca 10-100k satir birikebilir).
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function handle(req: Request) {
  const token = req.headers.get('x-cron-token')
  const envToken = process.env.CRON_SECRET
  if (!envToken || !token || token !== envToken) {
    return NextResponse.json({ ok: false, error: 'cron auth required' }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()  // 10 dk once
  const { error, count } = await admin
    .from('pdks_kullanilan_tokenlar')
    .delete({ count: 'exact' })
    .lt('kullanilma_tarihi', cutoff)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, silinen: count ?? 0 })
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }
