import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET — mevcut app_versions bilgisini oku */
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const admin = createAdminClient()
  const { data } = await admin.from('app_versions').select('*').eq('platform', 'android').single()

  return NextResponse.json(data ?? { apk_url: '', latest_version: '', min_version: '', surec_notu: '', zorunlu: false })
}

/** PATCH — APK URL güncelle (Güncellemeleri Yayınla) */
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const admin = createAdminClient()

  const update: any = {}
  if (body.apk_url !== undefined) update.apk_url = body.apk_url
  if (body.latest_version !== undefined) update.latest_version = body.latest_version
  if (body.min_version !== undefined) update.min_version = body.min_version
  if (body.surec_notu !== undefined) update.surec_notu = body.surec_notu
  if (body.zorunlu !== undefined) update.zorunlu = !!body.zorunlu

  if (!Object.keys(update).length) return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 })

  const { error } = await admin.from('app_versions').update(update).eq('platform', 'android')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
