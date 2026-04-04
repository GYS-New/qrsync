import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** PATCH — lokasyon(lar)ın günlük frekans sayısını güncelle */
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  // body: { updates: [{ id: string, gunluk_frekans_sayisi: number }] }
  const updates: { id: string; gunluk_frekans_sayisi: number }[] = body.updates
  if (!Array.isArray(updates) || updates.length === 0)
    return NextResponse.json({ error: 'Güncellenecek lokasyon yok' }, { status: 400 })

  const admin = createAdminClient()
  let updated = 0

  for (const u of updates) {
    const val = Number(u.gunluk_frekans_sayisi)
    if (isNaN(val) || val < 1 || val > 99) continue
    const { error } = await admin.from('lokasyonlar').update({ gunluk_frekans_sayisi: val }).eq('id', u.id)
    if (!error) updated++
  }

  return NextResponse.json({ ok: true, updated })
}
