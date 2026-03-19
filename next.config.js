/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['mjunontyoyuvnpcxzvvt.supabase.co'],
  },
  // Build sırasında Supabase env yoksa bu sayfaları static render etme
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
}
module.exports = nextConfig
