import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/full-logout
 *
 * Cross-domain full logout endpoint. Modül uygulamaları (Oto Yıkama, FMS)
 * kendi session'larını temizledikten sonra buraya yönlenir — GYS session +
 * modül-state cookie'leri temizlenir, kullanıcı /login'e atılır.
 *
 * Klasik logout'tan farkı: SADECE Supabase auth değil, aktif_modul ve diğer
 * scope cookie'leri de siler. UserPanel'deki client-side logout ile aynı
 * davranış, server-side şekilde.
 */
function getPublicOrigin(req: NextRequest): string {
  // Railway/proxy arkasında req.url internal port (localhost:8080) döner;
  // redirect'in public domain'e gitmesi için X-Forwarded-Host / Host
  // header'larından origin türetiyoruz.
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  return `${proto}://${host}`
}

export async function GET(req: NextRequest) {
  const origin = getPublicOrigin(req)
  const response = NextResponse.redirect(`${origin}/login`, { status: 302 })

  // 1) Supabase auth → signOut: cookie'leri yenile (Supabase setAll callback
  //    response'a expired cookie'ler yazar)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )
  try {
    await supabase.auth.signOut()
  } catch {
    // signOut session yoksa da hata atabilir — yine de cookie'leri temizle
  }

  // 2) Modül-state ve scope cookie'leri temizle (UserPanel'deki logout
  //    fonksiyonu ile aynı liste)
  const cookieNames = [
    'qrsync_sa_firma_id',
    'qrsync_aktif_proje_id',
    'qrsync_aktif_ust_lokasyon_id',
    'iogys_aktif_modul',
  ]
  for (const n of cookieNames) {
    response.cookies.set(n, '', { maxAge: 0, path: '/' })
  }

  return response
}
