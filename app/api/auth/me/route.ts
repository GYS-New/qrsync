import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { data: me, error: meError } = await supabase
      .from('users')
      .select('id, rol, firma_id')
      .eq('id', user.id)
      .single()

    if (meError || !me) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 })
    }

    return NextResponse.json(me)
  } catch (error) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
