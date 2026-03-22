/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['mjunontyoyuvnpcxzvvt.supabase.co'],
  },
  experimental: {
    missingSuspenseWithCSRBailout: false,
    serverComponentsExternalPackages: ['@supabase/ssr'],
  },
}
module.exports = nextConfig
