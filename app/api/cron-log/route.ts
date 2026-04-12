import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: [] })

  const p = req.nextUrl.searchParams
  const firmaId = p.get('firmaId')
  const projeId = p.get('projeId')

  const admin = createAdminClient()
  let q = admin
    .from('cron_log')
    .select('tip,sonuc,tarih,firma_id,proje_id')
    .order('tarih', { ascending: false })
    .limit(20)

  // Firma filtresi: firma_id eşleşen VEYA firma_id null (global loglar)
  if (firmaId) {
    q = q.or(`firma_id.eq.${firmaId},firma_id.is.null`)
  }
  // Proje filtresi: proje_id eşleşen VEYA proje_id null
  if (projeId) {
    q = q.or(`proje_id.eq.${projeId},proje_id.is.null`)
  }

  const { data } = await q
  return NextResponse.json({ data: data ?? [] })
}
