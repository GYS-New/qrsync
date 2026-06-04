import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ── RATE LIMIT (Aşama 3) ──────────────────────────────────────────────────
// In-memory per-IP bucket. Railway tek process — Map yeterli.
// Mode kaynağı (öncelik): DB sistem_konfigurasyon.rate_limit_mode → env RATE_LIMIT_MODE → 'enforce'
const ipBucket = new Map<string, { count: number; resetAt: number }>()
let cleanupCounter = 0

// Mode'u DB'den oku, 60 sn modül-içi cache'le.
// Edge runtime uyumlu: fetch + module-level Map; getSistemKonfig'i import etmiyoruz
// (cache reuse'a iyi olabilirdi ama bu basit yaklaşım kontrolü ortada tutar).
let modeCache: { value: 'off' | 'log' | 'enforce'; cacheTime: number } | null = null
const MODE_CACHE_TTL = 60 * 1000

function getRateLimitMode(): 'off' | 'log' | 'enforce' {
  const now = Date.now()

  // Cache hit (sync hızlı yol)
  if (modeCache && now - modeCache.cacheTime < MODE_CACHE_TTL) {
    return modeCache.value
  }

  // Cache miss → fire-and-forget refresh; mevcut değer (veya env fallback) ile devam et
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (supabaseUrl && supabaseKey) {
    void fetch(`${supabaseUrl}/rest/v1/sistem_konfigurasyon?limit=1&select=rate_limit_mode`, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    })
      .then(r => r.json())
      .then(rows => {
        if (Array.isArray(rows) && rows.length > 0) {
          const m = rows[0].rate_limit_mode
          const v: 'off' | 'log' | 'enforce' = (m === 'off' || m === 'log' || m === 'enforce') ? m : 'enforce'
          modeCache = { value: v, cacheTime: Date.now() }
        }
      })
      .catch(() => {})
  }

  // Mevcut cache veya env fallback (henüz refresh tamamlanmadı)
  if (modeCache) {
    modeCache.cacheTime = now // re-fetch'i 60 sn ertele
    return modeCache.value
  }
  const envMode = (process.env.RATE_LIMIT_MODE || 'enforce').toLowerCase()
  const v: 'off' | 'log' | 'enforce' = (envMode === 'off' || envMode === 'log' || envMode === 'enforce') ? envMode as any : 'enforce'
  modeCache = { value: v, cacheTime: now }
  return v
}

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

// Rate limit aşımını Supabase REST API ile audit_log'a yazar (fire-and-forget).
// Edge runtime uyumlu — supabase-js client kullanmaz, doğrudan fetch.
function logRateLimitOverflow(ip: string, bucket: string, count: number, max: number, pathname: string, ua: string | null, mode: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return // env yoksa sessiz geç

  const payload = {
    tip: 'rate_limit_asildi',
    tablo: 'middleware',
    basarili: false,
    hata_mesaji: `${count}/${max} istek/dk aşıldı`,
    detay: { ip, ua, bucket, count, max, path: pathname, mode },
  }

  // Fire-and-forget — middleware'i bekletme
  void fetch(`${supabaseUrl}/rest/v1/audit_log`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

function rateLimitCheck(req: NextRequest, pathname: string): NextResponse | null {
  // Mode kaynak öncelik: DB sistem_konfigurasyon → env → 'enforce'
  const mode = getRateLimitMode()
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
    // İlk taşmada audit_log + email (30 dk içinde guvenlik-mail cron'u tetikler)
    if (entry.count === limits.max + 1) {
      console.warn(`[rate-limit:${mode}] ${ip} ${bucket} ${entry.count}/${limits.max}/dk ${pathname}`)
      logRateLimitOverflow(ip, bucket, entry.count, limits.max, pathname, req.headers.get('user-agent'), mode)
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
    // log mode: bloklamaz, request devam eder (audit kaydı yine de düşer)
  }

  return null
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // /.well-known/* — Apple Universal Link, Google verification gibi standart
  // public dosyalar; auth ve rate limit bypass (Apple/Google bot'ları erişebilmeli)
  if (pathname.startsWith('/.well-known/')) {
    return NextResponse.next()
  }

  // /privacy-policy — Apple App Store gereği herkese (web + mobil) açık olmalı,
  // auth ve mobil-redirect bypass.
  if (pathname === '/privacy-policy' || pathname.startsWith('/privacy-policy/')) {
    return NextResponse.next()
  }

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

  // Tablet/mobil bypass — onaylı cihazlar (Atalian saha yöneticileri vb.) için.
  // 1. Bir kez ?tablet_izin=evet ile ziyaret edildiğinde cookie set edilir
  // 2. Sonraki tüm isteklerde cookie varsa mobil engelleme atlanır
  // 3. ?tablet_izin=hayir ile cookie silinir (geri al)
  const tabletIzinParam = request.nextUrl.searchParams.get('tablet_izin')
  const tabletIzinCookie = request.cookies.get('iogys_tablet_izin')?.value === 'evet'
  let setTabletIzinResponse: NextResponse | null = null
  if (tabletIzinParam === 'evet') {
    // Query param'i temizleyip cookie set ederek yeniden yönlendir
    const cleanUrl = new URL(request.url)
    cleanUrl.searchParams.delete('tablet_izin')
    setTabletIzinResponse = NextResponse.redirect(cleanUrl)
    setTabletIzinResponse.cookies.set('iogys_tablet_izin', 'evet', {
      maxAge: 60 * 60 * 24 * 365, // 1 yıl
      path: '/',
      sameSite: 'lax',
    })
    return setTabletIzinResponse
  }
  if (tabletIzinParam === 'hayir') {
    const cleanUrl = new URL(request.url)
    cleanUrl.searchParams.delete('tablet_izin')
    const r = NextResponse.redirect(cleanUrl)
    r.cookies.delete('iogys_tablet_izin')
    return r
  }

  // Mobil cihaz + web sayfası (scan/api/landing/auth hariç) → landing'e yönlendir
  // Tablet izni varsa atla.
  if (isMobile && !tabletIzinCookie && !isLandingPage && !isPublicScanPath && !isApiPath && !isAuthPage && !isAuthCallback) {
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