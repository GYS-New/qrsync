import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !user.email) return NextResponse.json({ ok: false, error: 'Oturum bulunamadı.' }, { status: 401 })

    const { password } = await req.json()
    if (!password) return NextResponse.json({ ok: false, error: 'Şifre boş olamaz.' }, { status: 400 })

    // Kullanıcının şifresini email+password ile doğrula
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password })
    if (error) return NextResponse.json({ ok: false, error: 'Şifre hatalı.' })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Doğrulama başarısız.' }, { status: 500 })
  }
}
