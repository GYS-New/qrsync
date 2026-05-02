/**
 * Apple App Site Association — iOS Universal Link config
 *
 * URL: https://iogys.com.tr/.well-known/apple-app-site-association
 * (next.config.js rewrite ile bu endpoint'e yönlendirilir)
 *
 * Apple gereksinimleri:
 *  - Content-Type: application/json
 *  - HTTPS
 *  - Redirect olmadan direkt erişim (middleware bypass'lı)
 *  - Uzantısız URL
 *
 * Kullanıcı /qr/* veya /nfc/* link'ine tıklayınca iOS bu dosyayı çekip
 * 6H649742PC.com.qrsync.qr app'inde açar (Safari'ye düşmez).
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const config = {
    applinks: {
      details: [
        {
          appIDs: ['6H649742PC.com.qrsync.qr'],
          components: [
            { '/': '/qr/*' },
            { '/': '/nfc/*' },
          ],
        },
      ],
    },
  }

  return new NextResponse(JSON.stringify(config), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',  // 1 saat cache (Apple sunucuları cache'liyor zaten)
    },
  })
}
