import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookieStore = cookies()
  const projeId = cookieStore.get('qrsync_aktif_proje_id')?.value ?? null
  
  // Tüm cookie isimlerini de listele
  const allCookies = cookieStore.getAll().map(c => ({ name: c.name, value: c.value.slice(0, 20) }))

  return NextResponse.json({
    proje_cookie: projeId,
    all_cookies: allCookies,
    timestamp: new Date().toISOString(),
  })
}
