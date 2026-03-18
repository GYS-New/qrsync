import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Updates users.last_seen_at for the current authenticated user.
// Called periodically from the client to enable real online user tracking.
export async function POST() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('users')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
