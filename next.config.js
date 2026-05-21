/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['mjunontyoyuvnpcxzvvt.supabase.co'],
  },
  // Production browser source map'leri açık — dashboard crash'lerinde minified
  // 'e/l/N' isimleri yerine gerçek dosya:satır görünsün diye. Hidden map dosyaları
  // bundle yanına çıkar (.js.map). Üretim kullanıcısı yine minified bundle alır;
  // DevTools açık olursa map'i otomatik çözer. Bug fix tamamlanınca tekrar kapatabiliriz.
  productionBrowserSourceMaps: true,
  experimental: {
    missingSuspenseWithCSRBailout: false,
    serverComponentsExternalPackages: ['@supabase/ssr'],
  },
  // iOS Universal Link — Apple .well-known/apple-app-site-association URL'ini
  // rewrite ile route handler'a yönlendir (dot-prefix dizinler ile sorun çıkmasın)
  async rewrites() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        destination: '/api/well-known/apple-app-site-association',
      },
    ]
  },
}
module.exports = nextConfig
