import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { syncLiveTaskStatuses } from '@/lib/tasks/liveStatus'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const provided = req.headers.get('x-cron-secret') || url.searchParams.get('secret')
  const expected = process.env.CRON_SECRET

  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    const result = await syncLiveTaskStatuses({ supabase })
    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'unexpected_error' }, { status: 500 })
  }
}
