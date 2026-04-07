import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const p = new URL(req.url).searchParams
  const firmaId = ['super_admin', 'alt_super_admin'].includes(me.rol) ? p.get('firma_id') : me.firma_id
  const ustLokasyonId = p.get('ust_lokasyon_id')

  if (!firmaId || !ustLokasyonId) return NextResponse.json({ ok: true, data: [] })

  const admin = createAdminClient()
  const { data } = await admin
    .from('users')
    .select('id, isim_soyisim, aktif, ust_lokasyon_id')
    .eq('firma_id', firmaId)
    .eq('ust_lokasyon_id', ustLokasyonId)
    .eq('aktif', true)
    .in('rol', ['tenant_user'])
    .order('isim_soyisim')

  return NextResponse.json({ ok: true, data: data ?? [] })
}
