import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

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
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Şifre en az 6 karakter olmalı' }, { status: 400 })
  }

  const admin = createAdminClient()
  // Hedef kullanıcı bilgisi (audit log için isim/firma)
  const { data: target } = await admin.from('users').select('isim_soyisim,rol,firma_id,e_posta').eq('id', userId).maybeSingle()

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await auditLog({
    tip: 'kullanici_sifre_degis',
    tablo: 'users',
    kullanici_id: me.id,
    firma_id: (target as any)?.firma_id ?? null,
    detay: {
      hedef_user_id: userId,
      hedef_isim: (target as any)?.isim_soyisim ?? null,
      hedef_eposta: (target as any)?.e_posta ?? null,
      hedef_rol: (target as any)?.rol ?? null,
      yapan_rol: 'sa',
    },
  })

  return NextResponse.json({ ok: true })
}
