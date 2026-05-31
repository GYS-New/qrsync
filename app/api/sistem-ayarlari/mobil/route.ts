import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const VALID_PLATFORMS = new Set(['android', 'ios'])

/** GET ?platform=android|ios — app_versions kaydını oku (default: android) */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const platform = (req.nextUrl.searchParams.get('platform') || 'android').toLowerCase()
  if (!VALID_PLATFORMS.has(platform)) {
    return NextResponse.json({ error: 'Geçersiz platform' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data } = await admin.from('app_versions').select('*').eq('platform', platform).maybeSingle()

  return NextResponse.json(data ?? { platform, apk_url: '', latest_version: '', min_version: '', surec_notu: '', zorunlu: false })
}

/** PATCH ?platform=android|ios — kaydı güncelle (default: android) */
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const platform = (req.nextUrl.searchParams.get('platform') || 'android').toLowerCase()
  if (!VALID_PLATFORMS.has(platform)) {
    return NextResponse.json({ error: 'Geçersiz platform' }, { status: 400 })
  }

  const body = await req.json()
  const admin = createAdminClient()

  const update: any = {}
  if (body.apk_url !== undefined) update.apk_url = body.apk_url
  if (body.latest_version !== undefined) update.latest_version = body.latest_version
  if (body.min_version !== undefined) update.min_version = body.min_version
  if (body.surec_notu !== undefined) update.surec_notu = body.surec_notu
  if (body.zorunlu !== undefined) update.zorunlu = !!body.zorunlu

  if (!Object.keys(update).length) return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 })

  // Önce mevcut kayıt var mı kontrol et (iOS gibi yeni eklenen platformlar için INSERT fallback)
  const { data: mevcut } = await admin.from('app_versions').select('id').eq('platform', platform).maybeSingle()
  if (mevcut) {
    const { error } = await admin.from('app_versions').update(update).eq('platform', platform)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await admin.from('app_versions').insert({ platform, ...update })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
