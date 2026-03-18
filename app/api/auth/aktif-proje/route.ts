import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = createClient()

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { projeId } = await request.json()

    const { error: updateError } = await supabase
      .from('users')
      .update({ aktif_proje_id: projeId })
      .eq('id', user.id)

    if (updateError) {
      return NextResponse.json({ error: 'update_failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
