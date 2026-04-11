import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const field = new URL(req.url).searchParams.get('field')
  if (!field) return NextResponse.json({ value: null })

  const admin = createAdminClient()
  const { data } = await admin.from('sistem_konfigurasyon').select(field).limit(1).single()
  return NextResponse.json({ value: (data as any)?.[field] ?? null })
}
