import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET — Sistem konfigürasyonu oku (sadece SA/alt_SA) */
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const admin = createAdminClient()
  const { data } = await admin.from('sistem_konfigurasyon').select('*').limit(1).single()

  return NextResponse.json(data ?? { uygulama_domain: 'app.qrsync.com', firebase_project_id: '', firebase_client_email: '', firebase_private_key: '', cron_secret: '' })
}

/** PATCH — Sistem konfigürasyonu güncelle (sadece SA/alt_SA) */
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const admin = createAdminClient()
  const { data: mevcut } = await admin.from('sistem_konfigurasyon').select('id').limit(1).single()

  const update: any = { guncelleme_tarihi: new Date().toISOString() }
  const fields = ['uygulama_domain', 'uygulama_ismi', 'sidebar_logo_url', 'firebase_project_id', 'firebase_client_email', 'firebase_private_key', 'cron_secret', 'anthropic_api_key', 'resend_api_key', 'guvenlik_email', 'guvenlik_mail_aktif', 'rate_limit_mode']
  for (const f of fields) { if (body[f] !== undefined) update[f] = body[f] }

  // rate_limit_mode değerini doğrula
  if (update.rate_limit_mode !== undefined && !['off', 'log', 'enforce'].includes(update.rate_limit_mode)) {
    return NextResponse.json({ error: 'rate_limit_mode geçersiz (off|log|enforce)' }, { status: 400 })
  }

  if (mevcut) {
    const { error } = await admin.from('sistem_konfigurasyon').update(update).eq('id', mevcut.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await admin.from('sistem_konfigurasyon').insert(update)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
