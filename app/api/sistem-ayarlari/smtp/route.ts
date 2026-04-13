import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET — SMTP ayarlarını oku (sadece SA/alt_SA) */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz — sadece SA/alt SA erişebilir' }, { status: 403 })

  const admin = createAdminClient()
  const { data } = await admin.from('smtp_ayarlari').select('*').limit(1).single()

  const result = data ?? {
    smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_secure: false,
    smtp_user: '', smtp_pass: '', smtp_from: '', aktif: true,
  }
  // Şifreyi maskele — client'a plaintext gönderme
  if (result.smtp_pass) result.smtp_pass = '••••••••'
  return NextResponse.json(result)
}

/** PATCH — SMTP ayarlarını güncelle (sadece SA/alt_SA) */
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz — sadece SA/alt SA düzenleyebilir' }, { status: 403 })

  const body = await req.json()
  const admin = createAdminClient()

  // Mevcut kaydı bul
  const { data: mevcut } = await admin.from('smtp_ayarlari').select('id').limit(1).single()

  const update: any = { guncelleme_tarihi: new Date().toISOString() }
  if (body.smtp_host !== undefined) update.smtp_host = body.smtp_host
  if (body.smtp_port !== undefined) update.smtp_port = Number(body.smtp_port) || 587
  if (body.smtp_secure !== undefined) update.smtp_secure = !!body.smtp_secure
  if (body.smtp_user !== undefined) update.smtp_user = body.smtp_user
  if (body.smtp_pass !== undefined) update.smtp_pass = body.smtp_pass
  if (body.smtp_from !== undefined) update.smtp_from = body.smtp_from
  if (body.aktif !== undefined) update.aktif = !!body.aktif

  if (mevcut) {
    const { error } = await admin.from('smtp_ayarlari').update(update).eq('id', mevcut.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await admin.from('smtp_ayarlari').insert({ ...update, smtp_host: body.smtp_host ?? 'smtp.gmail.com', smtp_port: body.smtp_port ?? 587 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/** POST — Test mail gönder */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,email').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  try {
    const { sendMail } = await import('@/lib/email')
    const result = await sendMail({
      to: me.email,
      subject: 'QR-Sync SMTP Test',
      text: 'Bu bir test mailidir. SMTP ayarlarınız doğru çalışıyor.',
    })
    return NextResponse.json({ ok: result.ok, skipped: (result as any).skipped ?? false })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
