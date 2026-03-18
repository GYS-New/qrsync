import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

function isSA(role?: string | null) {
  return role === 'super_admin' || role === 'alt_super_admin'
}

// SUPER_ADMIN / ALT_SUPER_ADMIN: set password for any user
export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || !isSA(me.rol)) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })

  const userId = String(ctx.params.id)
  const body = await req.json().catch(() => ({} as any))
  const password = String(body.password ?? '')
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Şifre en az 6 karakter olmalı' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
