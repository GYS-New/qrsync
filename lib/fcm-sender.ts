import { getSistemKonfig } from '@/lib/config/getSistemKonfig'

const BRAND_PREFIX = 'İO-GYS'

/**
 * FCM title'a marka prefix'i ekle.
 * Başlık zaten "İO-GYS" ile başlıyorsa tekrar eklenmez.
 * Mobil app AndroidManifest label'ı "ProATA" gibi bir şey gösterse bile
 * bildirim başlığının ilk kelimesi "İO-GYS" olarak net görünür.
 */
function brandedTitle(t: string): string {
  if (!t) return BRAND_PREFIX
  if (t.startsWith(BRAND_PREFIX)) return t
  return `${BRAND_PREFIX} • ${t}`
}

export async function sendFCMToUser(
  userId: string,
  title: string,
  body: string,
  channelId: string = 'default',
  data?: Record<string, string>,
) {
  try {
    const konfig = await getSistemKonfig()
    const projectId = konfig.firebase_project_id
    const clientEmail = konfig.firebase_client_email
    const privateKey = konfig.firebase_private_key.replace(/\\n/g, '\n')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!projectId || !clientEmail || !privateKey || !supabaseUrl || !supabaseKey) return

    const res = await fetch(
      `${supabaseUrl}/rest/v1/device_tokens?user_id=eq.${userId}&aktif=eq.true&fcm_token=not.is.null&select=fcm_token,ses_kanali`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    )
    const devices: { fcm_token: string; ses_kanali?: string }[] = await res.json()
    if (!devices?.length) return

    const now = Math.floor(Date.now() / 1000)
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now, exp: now + 3600,
    })).toString('base64url')

    const crypto = await import('crypto')
    const sign = crypto.createSign('RSA-SHA256')
    sign.update(`${header}.${payload}`)
    const signature = sign.sign(privateKey, 'base64url')
    const jwt = `${header}.${payload}.${signature}`

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    })
    const { access_token } = await tokenRes.json()

    for (const d of devices) {
      if (!d.fcm_token) continue
      // ses_kanali bazlı channel_id ve sound seçimi
      const useCustom = (d.ses_kanali ?? 'custom') === 'custom'
      let effectiveChannelId: string
      let soundName: string
      if (useCustom) {
        effectiveChannelId = channelId === 'gorev_uyari' ? 'vav'
                           : channelId === 'gorev_tamamla' ? 'gorev_tamamla_v2'
                           : channelId
        soundName = channelId === 'gorev_uyari' ? 'vav'
                  : channelId === 'gorev_tamamla' ? 'tamamla'
                  : 'default'
      } else {
        effectiveChannelId = 'default'
        soundName = 'default'
      }
      // Dedup tag: aynı user + channel'a düşen bildirimler tek slot'ta birikir.
      // Capacitor Firebase Messaging plugin 8.1.0 bazı senaryolarda çift display
      // yapıyor; tag override sistem tray'de tekleştirir. Yan etki: aynı channel'a
      // arda arda farklı içerikli bildirim gelirse sonuncu birincinin yerini alır
      // (genelde aynı tip bildirimde son durumun gösterilmesi istenen davranış).
      const dedupTag = `${effectiveChannelId}_${userId}`
      try {
        await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: d.fcm_token,
              notification: { title: brandedTitle(title), body },
              ...(data && Object.keys(data).length > 0 ? { data } : {}),
              android: {
                priority: 'high',
                notification: {
                  sound: soundName,
                  channel_id: effectiveChannelId,
                  tag: dedupTag,
                },
              },
              apns: {
                payload: {
                  aps: {
                    alert: { title: brandedTitle(title), body },
                    sound: soundName === 'default' ? 'default' : `${soundName}.wav`,
                    badge: 1,
                    'content-available': 1,
                  },
                },
                headers: {
                  'apns-priority': '10',
                  'apns-collapse-id': dedupTag,
                },
              },
            },
          }),
        })
      } catch {}
    }
  } catch {}
}
