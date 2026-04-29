// İstekten IP adresi ve User-Agent çıkartır.
// Railway/Vercel/Cloudflare gibi proxy'lerin arkasında x-forwarded-for kullanılır.
export function getRequestMeta(req: Request): { ip: string | null; ua: string | null } {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null
  const uaRaw = req.headers.get('user-agent')
  // UA string'i 500 karakter ile sınırla (bazı bot UA'ları çok uzun)
  const ua = uaRaw ? uaRaw.slice(0, 500) : null
  return { ip, ua }
}
