import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const ustLokasyonId = body.ust_lokasyon_id ?? null

  const admin = createAdminClient()
  const { error } = await admin.from('users').update({ ust_lokasyon_id: ustLokasyonId }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
