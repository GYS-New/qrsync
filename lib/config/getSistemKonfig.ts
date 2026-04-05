/**
 * Sistem konfigürasyonunu DB'den okur, yoksa env/default fallback.
 * Sonuç cache'lenir (process seviyesinde, restart'a kadar).
 */

let cache: Record<string, string> | null = null
let cacheTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 dk

export async function getSistemKonfig(): Promise<{
  uygulama_domain: string
  firebase_project_id: string
  firebase_client_email: string
  firebase_private_key: string
  cron_secret: string
}> {
  const now = Date.now()
  if (cache && now - cacheTime < CACHE_TTL) return cache as any

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (supabaseUrl && supabaseKey) {
    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/sistem_konfigurasyon?limit=1&select=uygulama_domain,firebase_project_id,firebase_client_email,firebase_private_key,cron_secret`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      })
      const rows = await res.json()
      if (Array.isArray(rows) && rows.length > 0) {
        cache = rows[0]
        cacheTime = now
        return {
          uygulama_domain: rows[0].uygulama_domain || 'app.qrsync.com',
          firebase_project_id: rows[0].firebase_project_id || process.env.FIREBASE_PROJECT_ID || '',
          firebase_client_email: rows[0].firebase_client_email || process.env.FIREBASE_CLIENT_EMAIL || '',
          firebase_private_key: rows[0].firebase_private_key || process.env.FIREBASE_PRIVATE_KEY || '',
          cron_secret: rows[0].cron_secret || process.env.CRON_SECRET || '',
        }
      }
    } catch {}
  }

  // Fallback: env vars
  return {
    uygulama_domain: 'app.qrsync.com',
    firebase_project_id: process.env.FIREBASE_PROJECT_ID || '',
    firebase_client_email: process.env.FIREBASE_CLIENT_EMAIL || '',
    firebase_private_key: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    cron_secret: process.env.CRON_SECRET || '',
  }
}
