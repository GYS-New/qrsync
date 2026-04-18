import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Basit in-memory brute-force koruması — kullanıcı bazlı, 5 yanlış sonra 15 dk kilit.
const MAX_DENEME = 5
const KILIT_MS = 15 * 60 * 1000
const denemeler = new Map<string, { sayi: number; kilitBitis: number }>()

/**
 * POST /api/auth/sa-dogrula
 * Hassas sayfalar için SA'nın şifresini yeniden doğrular.
 * Body: { sifre }
 * Yalnızca super_admin / alt_super_admin erişebilir.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Geçersiz istek' }, { status: 400 })
  }
  const sifre = String(body.sifre ?? '')
  if (!sifre) return NextResponse.json({ ok: false, error: 'Şifre gerekli' }, { status: 400 })

  // Rate limit kontrolü
  const now = Date.now()
  const rec = denemeler.get(user.id)
  if (rec && rec.kilitBitis > now) {
    return NextResponse.json({
      ok: false,
      error: `Çok fazla yanlış deneme. ${Math.ceil((rec.kilitBitis - now) / 1000)} saniye sonra tekrar deneyin.`,
      kilitli: true,
      kalan_sn: Math.ceil((rec.kilitBitis - now) / 1000),
    }, { status: 429 })
  }

  // signInWithPassword ile doğrula
  const anon = createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  )
  const { error: signErr } = await anon.auth.signInWithPassword({
    email: user.email,
    password: sifre,
  })

  if (signErr) {
    const cur = denemeler.get(user.id) ?? { sayi: 0, kilitBitis: 0 }
    cur.sayi += 1
    if (cur.sayi >= MAX_DENEME) cur.kilitBitis = now + KILIT_MS
    denemeler.set(user.id, cur)
    return NextResponse.json({ ok: false, error: 'Şifre hatalı', sifre_hatali: true }, { status: 401 })
  }

  denemeler.delete(user.id)
  return NextResponse.json({ ok: true })
}
