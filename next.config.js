/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['mjunontyoyuvnpcxzvvt.supabase.co'],
  },
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  // @supabase/ssr'ın next/headers kullanmasından kaynaklanan
  // client bundle hatası için: server-only paketleri dışarıda tut
  serverExternalPackages: ['@supabase/ssr'],
}
module.exports = nextConfig
