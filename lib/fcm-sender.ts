export async function sendFCMToUser(userId: string, title: string, body: string, channelId: string = 'default') {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!projectId || !clientEmail || !privateKey || !supabaseUrl || !supabaseKey) return

    const res = await fetch(
      `${supabaseUrl}/rest/v1/device_tokens?user_id=eq.${userId}&aktif=eq.true&fcm_token=not.is.null&select=fcm_token`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    )
    const devices: { fcm_token: string }[] = await res.json()
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

    const soundName = channelId === 'gorev_uyari' ? 'vav' : 'default'

    for (const d of devices) {
      if (!d.fcm_token) continue
      try {
        await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: d.fcm_token,
              notification: { title, body },
              android: {
                priority: 'high',
                notification: {
                  sound: soundName,
                  channel_id: channelId,
                },
              },
            },
          }),
        })
      } catch {}
    }
  } catch {}
}
