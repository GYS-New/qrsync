import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── RATE LIMIT (Aşama 3) ──────────────────────────────────────────────────
// In-memory per-IP bucket. Railway tek process — Map yeterli.
// Mode: RATE_LIMIT_MODE=off|log|enforce (varsayılan: log — bloklamaz, sadece konsola yazar)
const ipBucket = new Map<string, { count: number; resetAt: number }>()
let cleanupCounter = 0

const RATE_LIMITS = {
  app: { max: 200, windowMs: 60_000 },     // mobile yüksek (heartbeat, gorevlerim)
  auth: { max: 30, windowMs: 60_000 },     // auth — sıkı (brute-force)
  default: { max: 90, windowMs: 60_000 },  // genel
} as const

function rateLimitBucket(path: string): keyof typeof RATE_LIMITS {
  if (path.startsWith('/api/app/')) return 'app'
  if (path.startsWith('/api/auth/')) return 'auth'
  return 'default'
}

function rateLimitCheck(req: NextRequest, pathname: string): NextResponse | null {
  const mode = (process.env.RATE_LIMIT_MODE || 'log').toLowerCase()
  if (mode === 'off') return null

  // Cron endpoint'leri zaten x-cron-token ile korumalı, bypass et
  if (pathname.startsWith('/api/cron/')) return null

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'

  const bucket = rateLimitBucket(pathname)
  const limits = RATE_LIMITS[bucket]
  const key = `${ip}:${bucket}`
  const now = Date.now()

  // Lazy cleanup — her 1000 istekte expired bucket'ları sil (bellek sızıntısı önle)
  if (++cleanupCounter % 1000 === 0) {
    for (const [k, v] of ipBucket.entries()) {
      if (v.resetAt <= now) ipBucket.delete(k)
    }
  }

  const entry = ipBucket.get(key)
  if (!entry || entry.resetAt <= now) {
    ipBucket.set(key, { count: 1, resetAt: now + limits.windowMs })
    return null
  }

  entry.count++
  if (entry.count > limits.max) {
    // İlk taşmada bir kez log (spam önleme)
    if (entry.count === limits.max + 1) {
      console.warn(`[rate-limit:${mode}] ${ip} ${bucket} ${entry.count}/${limits.max}/dk ${pathname}`)
    }
    if (mode === 'enforce') {
      return new NextResponse(
        JSON.stringify({ error: 'Çok fazla istek. Birkaç saniye sonra tekrar deneyin.', code: 'RATE_LIMIT_EXCEEDED' }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': String(Math.ceil((entry.resetAt - now) / 1000)),
          },
        }
      )
    }
    // log mode: bloklamaz, request devam eder
  }

  return null
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // /api/* için sadece rate limit (her endpoint kendi auth'unu yapar)
  if (pathname.startsWith('/api/')) {
    const blocked = rateLimitCheck(request, pathname)
    if (blocked) return blocked
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const { data: { user: authUser } } = await supabase.auth.getUser()

  // Mobil cihaz tespiti — web uygulamasına mobil erişimi engelle, landing'e yönlendir
  const ua = request.headers.get('user-agent') ?? ''
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua)
  const isLandingPage = pathname === '/' || pathname === '/landing.html'
  const isPublicScanPath = pathname.startsWith('/qr/') || pathname.startsWith('/nfc/') || pathname.startsWith('/mesai/') || pathname.startsWith('/degerlendirme/')
  const isApiPath = pathname.startsWith('/api/')
  const isAuthCallback = pathname.startsWith('/auth/callback')

  const publicPaths = new Set(['/login', '/forgot-password', '/reset-password'])
  const isAuthPage = publicPaths.has(pathname)

  // Mobil cihaz + web sayfası (scan/api/landing/auth hariç) → landing'e yönlendir
  if (isMobile && !isLandingPage && !isPublicScanPath && !isApiPath && !isAuthPage && !isAuthCallback) {
    return NextResponse.redirect(new URL('/landing.html', request.url))
  }

  if (!authUser && !isAuthPage && !isPublicScanPath && !isLandingPage && !isAuthCallback) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (authUser && publicPaths.has(pathname)) {
    const { data: user } = await supabase
      .from('users')
      .select('rol')
      .eq('id', authUser.id)
      .single()

    const rol = user?.rol

    if (rol === 'super_admin' || rol === 'alt_super_admin') {
      return NextResponse.redirect(new URL('/sa/dashboard', request.url))
    } else if (rol === 'tenant_admin') {
      return NextResponse.redirect(new URL('/ta/dashboard', request.url))
    } else {
      return NextResponse.redirect(new URL('/u/dashboard', request.url))
    }
  }

  return response
}

// Matcher: /api dahil tüm sayfalar (api için sadece rate limit, diğerleri için auth flow)
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|screenshots|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)).*)'],
}