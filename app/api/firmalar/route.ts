import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()

  const {
    data: { user: authUser },
    error: authErr,
  } = await supabase.auth.getUser()

  if (authErr || !authUser) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('id,rol')
    .eq('id', authUser.id)
    .single()

  if (meErr || !me) {
    return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })
  }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  if (!isSA) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
  }

  const { data: firmalar, error } = await supabase
    .from('firmalar')
    .select('id,ticari_unvan,firma_adi')
    .order('ticari_unvan')

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    data: firmalar || []
  })
}
