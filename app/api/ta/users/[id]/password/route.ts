import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

function isTA(role?: string | null) {
  return role === 'tenant_admin'
}

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || !isTA(me.rol)) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
  if (!me.firma_id) return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 400 })

  const userId = String(ctx.params.id)
  const body = await req.json().catch(() => ({} as any))
  const password = String(body.password ?? '')
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Şifre en az 6 karakter olmalı' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: target } = await admin.from('users').select('id,rol,firma_id').eq('id', userId).single()
  if (!target) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 })
  if (target.rol === 'super_admin' || target.rol === 'alt_super_admin') return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
  if (target.firma_id !== me.firma_id) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
