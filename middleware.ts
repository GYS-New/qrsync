import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {

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
  const pathname = request.nextUrl.pathname

  // Mobil cihaz tespiti — web uygulamasına mobil erişimi engelle, landing'e yönlendir
  const ua = request.headers.get('user-agent') ?? ''
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua)
  const isLandingPage = pathname === '/' || pathname === '/landing.html'
  const isPublicScanPath = pathname.startsWith('/qr/') || pathname.startsWith('/nfc/') || pathname.startsWith('/mesai/') || pathname.startsWith('/degerlendirme/')
  const isApiPath = pathname.startsWith('/api/')

  const publicPaths = new Set(['/login', '/forgot-password', '/reset-password'])
  const isAuthPage = publicPaths.has(pathname)

  // Mobil cihaz + web sayfası (scan/api/landing/auth hariç) → landing'e yönlendir
  if (isMobile && !isLandingPage && !isPublicScanPath && !isApiPath && !isAuthPage) {
    return NextResponse.redirect(new URL('/landing.html', request.url))
  }

  if (!authUser && !isAuthPage && !isPublicScanPath && !isLandingPage) {
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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|screenshots).*)'],
}