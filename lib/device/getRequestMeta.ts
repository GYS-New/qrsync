// İstekten gerçek client IP ve User-Agent çıkartır.
//
// KRITIK: iogys.com.tr Cloudflare → Railway → Next.js akışında. Railway
// x-forwarded-for'a Cloudflare edge IP'sini yazıyor (104.x/162.x/172.x
// gibi), gerçek kullanıcı IP'sini DEĞİL. Bu yüzden değerlendirme engeli
// IP-bazlı çalışmıyordu (tüm değerlendirmeler aynı CF IP'den gibi
// görünüp farklı personellerin eşleşmesi kaçırılıyordu).
//
// Doğru öncelik sırası (Cloudflare docs):
//   1. CF-Connecting-IP  → Cloudflare'in yazdığı tek gerçek client IP (IPv4 or IPv6)
//   2. True-Client-IP    → Enterprise CF özelliği, varsa daha güvenilir
//   3. X-Forwarded-For   → İLK değer genelde client IP (ama Railway'de CF edge)
//   4. X-Real-IP         → Son çare, bazı reverse proxylerden
//
// NOT: Trust CF only. Eğer uygulama direkt internet'e açıksa CF-Connecting-IP
// header'ı client tarafından spoofable. Burada CF arkada olduğu için güvenli.
export function getRequestMeta(req: Request): { ip: string | null; ua: string | null } {
  const ip = req.headers.get('cf-connecting-ip')
    || req.headers.get('true-client-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || null
  const uaRaw = req.headers.get('user-agent')
  // UA string'i 500 karakter ile sınırla (bazı bot UA'ları çok uzun)
  const ua = uaRaw ? uaRaw.slice(0, 500) : null
  return { ip, ua }
}
