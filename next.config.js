/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['mjunontyoyuvnpcxzvvt.supabase.co'],
  },
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
