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

  // Firma filtresi: sadece bu firmaya ait loglar
  if (firmaId) {
    q = q.eq('firma_id', firmaId)
  }
  // Proje filtresi: sadece bu projeye ait loglar
  if (projeId) {
    q = q.eq('proje_id', projeId)
  }

  const { data } = await q
  return NextResponse.json({ data: data ?? [] })
}
