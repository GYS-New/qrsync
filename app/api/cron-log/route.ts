import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: [] })

  const admin = createAdminClient()
  const { data } = await admin
    .from('cron_log')
    .select('tip,sonuc,tarih')
    .order('tarih', { ascending: false })
    .limit(20)

  return NextResponse.json({ data: data ?? [] })
}
