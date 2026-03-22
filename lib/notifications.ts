import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// FCM V1 API ile bildirim gönder
async function sendFCM(fcmToken: string, title: string, body: string) {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')

  // JWT token oluştur
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })).toString('base64url')

  const crypto = await import('crypto')
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(`${header}.${payload}`)
  const signature = sign.sign(privateKey, 'base64url')
  const jwt = `${header}.${payload}.${signature}`

  // Access token al
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const { access_token } = await tokenRes.json()

  // FCM'e gönder
  await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: { title, body },
        android: { priority: 'high', notification: { sound: 'default' } },
      },
    }),
  })
}

export async function sendNotificationToUser(userId: string, title: string, body: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('device_tokens')
    .select('fcm_token')
    .eq('user_id', userId)
    .eq('aktif', true)
    .not('fcm_token', 'is', null)

  for (const d of data ?? []) {
    if (d.fcm_token) {
      try { await sendFCM(d.fcm_token, title, body) } catch {}
    }
  }
}
