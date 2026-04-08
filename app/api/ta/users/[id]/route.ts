import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

function isTA(role?: string | null) {
  return role === 'tenant_admin'
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || !isTA(me.rol)) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
  if (!me.firma_id) return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 400 })

  const userId = String(ctx.params.id)
  const body = await req.json().catch(() => ({} as any))

  const isim_soyisim = body.isim_soyisim !== undefined ? String(body.isim_soyisim).trim() : undefined
  const telefon = body.telefon !== undefined ? (body.telefon ? String(body.telefon).trim() : null) : undefined
  const aktif = body.aktif !== undefined ? Boolean(body.aktif) : undefined
  const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : undefined
  const cinsiyet = body.cinsiyet !== undefined ? (body.cinsiyet === 'E' || body.cinsiyet === 'K' ? body.cinsiyet : null) : undefined

  const admin = createAdminClient()

  // ensure target is in same firm and not SA
  const { data: target } = await admin.from('users').select('id,rol,firma_id').eq('id', userId).single()
  if (!target) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 })
  if (target.rol === 'super_admin' || target.rol === 'alt_super_admin') return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
  if (target.firma_id !== me.firma_id) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })

  // Update Auth email if changed
  if (email) {
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, { email })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })
  }

  const updatePayload: any = {}
  if (isim_soyisim !== undefined) updatePayload.isim_soyisim = isim_soyisim
  if (telefon !== undefined) updatePayload.telefon = telefon
  if (aktif !== undefined) updatePayload.aktif = aktif
  if (email !== undefined) updatePayload.email = email
  if (cinsiyet !== undefined) updatePayload.cinsiyet = cinsiyet

  if (Object.keys(updatePayload).length) {
    const { error: upErr } = await admin.from('users').update(updatePayload).eq('id', userId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || !isTA(me.rol)) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
  if (!me.firma_id) return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 400 })

  const userId = String(ctx.params.id)
  const admin = createAdminClient()

  const { data: target } = await admin.from('users').select('id,rol,firma_id').eq('id', userId).single()
  if (!target) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 })
  if (target.rol === 'super_admin' || target.rol === 'alt_super_admin') return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
  if (target.firma_id !== me.firma_id) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })

  await admin.from('users').delete().eq('id', userId)
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
