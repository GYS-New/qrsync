import { NextResponse } from 'next/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createAdminClient, createClient } from '@/lib/supabase/server'

export async function PATCH(req: Request) {
  const supabase = createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const email = String(body.email ?? '').trim().toLowerCase()
  const currentPassword = String(body.currentPassword ?? '')

  if (!email) return NextResponse.json({ error: 'E-posta zorunludur.' }, { status: 400 })
  if (!currentPassword) return NextResponse.json({ error: 'Mevcut şifre zorunludur.' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Geçersiz e-posta adresi' }, { status: 400 })
  }

  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('id,email')
    .eq('id', authUser.id)
    .single()

  if (meErr || !me) return NextResponse.json({ error: 'Kullanıcı bulunamadı.' }, { status: 404 })
  if ((me.email ?? '').toLowerCase() === email) return NextResponse.json({ ok: true })

  const verifyClient = createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  )

  const verify = await verifyClient.auth.signInWithPassword({
    email: me.email,
    password: currentPassword,
  })

  if (verify.error) {
    return NextResponse.json({ error: 'Mevcut şifre hatalı' }, { status: 400 })
  }

  await verifyClient.auth.signOut()

  const admin = createAdminClient()
  const { error: authErr } = await admin.auth.admin.updateUserById(authUser.id, { email })

  if (authErr) {
    const msg = String(authErr.message || '')
    const lower = msg.toLowerCase()
    if (lower.includes('already') || lower.includes('registered') || lower.includes('exists') || lower.includes('duplicate')) {
      return NextResponse.json({ error: 'Bu e-posta başka bir kullanıcı tarafından kullanılıyor' }, { status: 400 })
    }
    if (lower.includes('invalid email')) {
      return NextResponse.json({ error: 'Geçersiz e-posta adresi' }, { status: 400 })
    }
    return NextResponse.json({ error: msg || 'E-posta güncellenemedi' }, { status: 400 })
  }

  const { error: userErr } = await admin.from('users').update({ email }).eq('id', authUser.id)
  if (userErr) return NextResponse.json({ error: userErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, email })
}
