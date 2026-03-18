import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || me.rol !== 'super_admin') {
    return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .in('rol', ['super_admin', 'alt_super_admin'])
    .order('kayit_tarihi', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, users: users ?? [] })
}
