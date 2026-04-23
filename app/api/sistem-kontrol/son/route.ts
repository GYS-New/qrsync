/**
 * GET /api/sistem-kontrol/son
 *
 * Son sistem kontrol sonucunu (cron_log.tip='sistem_kontrol') döndürür.
 * Auth kullanıcı gerekli — admin paneli widget'ı kullanır.
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('cron_log')
    .select('sonuc, tarih')
    .eq('tip', 'sistem_kontrol')
    .order('tarih', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) {
    return NextResponse.json({
      ok: true,
      son_kontrol: null,
      rapor: null,
    })
  }

  return NextResponse.json({
    ok: true,
    son_kontrol: data.tarih,
    rapor: data.sonuc,
  })
}
