import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET — firma genel ayarlarını oku */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? (req.nextUrl.searchParams.get('firmaId') ?? me.firma_id) : me.firma_id
  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('firmalar')
    .select('gorev_suresi_hedef_orani')
    .eq('id', firmaId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    gorev_suresi_hedef_orani: data?.gorev_suresi_hedef_orani ?? 10,
  })
}

/** PATCH — firma genel ayarlarını güncelle */
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? (body.firmaId ?? me.firma_id) : me.firma_id
  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  const oran = Number(body.gorev_suresi_hedef_orani)
  if (isNaN(oran) || oran < 0 || oran > 100)
    return NextResponse.json({ error: 'Oran 0-100 arasında olmalıdır' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('firmalar')
    .update({ gorev_suresi_hedef_orani: oran })
    .eq('id', firmaId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, gorev_suresi_hedef_orani: oran })
}
