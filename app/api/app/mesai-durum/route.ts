import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function GET(req: Request) {
  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) return NextResponse.json({ ok: false }, { status: 401, headers: CORS })

  const admin = createAdminClient()
  const { data: tokenData } = await admin
    .from('device_tokens')
    .select('user_id, aktif, proje_id')
    .eq('device_token', deviceToken)
    .single()

  if (!tokenData?.aktif) return NextResponse.json({ ok: false }, { status: 401, headers: CORS })

  const trtNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const bugun = trtNow.toISOString().split('T')[0]

  let q = admin
    .from('personel_mesai_kayitlari')
    .select('id, giris_saati, cikis_saati')
    .eq('user_id', tokenData.user_id)
    .eq('kayit_tarihi', bugun)
    .order('giris_saati', { ascending: false })
    .limit(1)

  if (tokenData.proje_id) q = (q as any).eq('proje_id', tokenData.proje_id)

  const { data: kayitlar } = await q
  const kayit = kayitlar?.[0] ?? null

  return NextResponse.json({
    ok: true,
    durum: kayit ? {
      giris: kayit.giris_saati,
      cikis: kayit.cikis_saati,
    } : null,
  }, { headers: CORS })
}
