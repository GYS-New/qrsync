import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDateTime, GOREV_DURUM_LABEL } from '@/lib/utils'

export type GorevDurum = 'ACIK' | 'ISLEMDE' | 'IPTAL' | 'TAMAMLANDI'

function extractGorevIdTag(mesaj: string): string | null {
  const m = /#gorev:([0-9a-fA-F-]{36})/.exec(mesaj ?? '')
  return m?.[1] ?? null
}

export const NotificationUtils = {
  extractGorevIdTag,
}

// FCM V1 API ile push bildirim gönder
async function sendFCMToUser(userId: string, title: string, body: string) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    if (!projectId || !clientEmail || !privateKey) return

    const { createAdminClient } = await import('@/lib/supabase/server')
    const admin = createAdminClient()
    const { data: devices } = await admin
      .from('device_tokens')
      .select('fcm_token')
      .eq('user_id', userId)
      .eq('aktif', true)
      .not('fcm_token', 'is', null)

    if (!devices?.length) return

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

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    })
    const { access_token } = await tokenRes.json()

    for (const d of devices) {
      if (!d.fcm_token) continue
      try {
        await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: d.fcm_token,
              notification: { title, body },
              android: { priority: 'high', notification: { sound: 'default' } },
            },
          }),
        })
      } catch {}
    }
  } catch {}
}

export async function markGorevAtamaNotificationsRead(opts: {
  supabase: SupabaseClient
  gorevId: string
}) {
  const { supabase, gorevId } = opts
  await supabase
    .from('bildirimler')
    .update({ okundu: true })
    .eq('tip', 'gorev_atama')
    .eq('okundu', false)
    .like('mesaj', `%#gorev:${gorevId}%`)
}

export async function createGorevAtamaNotification(opts: {
  supabase: SupabaseClient
  aliciId: string
  gorevId: string
  tanim: string
  lokasyonTanim?: string | null
  tarihIso?: string | null
}) {
  const { supabase, aliciId, gorevId, tanim, lokasyonTanim, tarihIso } = opts

  const mesajLines = [
    `Görev: ${tanim}`,
    `Lokasyon: ${lokasyonTanim ?? '—'}`,
    `Tarih: ${tarihIso ? formatDateTime(tarihIso) : '—'}`,
    '',
    'Bu görev için işlem seçin: Kabul / Reddet.',
    `#gorev:${gorevId}`,
  ]

  await supabase.from('bildirimler').insert({
    alici_id: aliciId,
    baslik: 'Yeni görev ataması',
    mesaj: mesajLines.join('\n'),
    tip: 'gorev_atama',
  })

  // FCM push bildirim gönder
  await sendFCMToUser(aliciId, 'Yeni Görev', `${tanim} görevi size atandı.`)
}

export async function notifyTenantAdminsOnGorevStatusChange(opts: {
  supabase: SupabaseClient
  firmaId: string
  gorev: {
    id: string
    tanim: string
    durum: GorevDurum
    olusturma_tarihi?: string | null
    lokasyonlar?: { tanim?: string | null } | null
    users?: { isim_soyisim?: string | null } | null
  }
  actionText: string
  actorName?: string | null
}) {
  const { supabase, firmaId, gorev, actionText, actorName } = opts
  if (gorev.durum === 'TAMAMLANDI') return

  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('rol', 'tenant_admin')
    .eq('aktif', true)

  const adminIds = (admins ?? []).map((a: any) => a.id).filter(Boolean)
  if (!adminIds.length) return

  const lokasyon = gorev.lokasyonlar?.tanim ?? '—'
  const atanan = gorev.users?.isim_soyisim ?? '—'
  const tarih = gorev.olusturma_tarihi ? formatDateTime(gorev.olusturma_tarihi) : '—'
  const durumLabel = (GOREV_DURUM_LABEL as any)[gorev.durum] ?? gorev.durum
  const who = actorName ? `${actorName} tarafından` : 'Sistem tarafından'

  const mesajLines = [
    `${who} görev ${actionText}.`,
    '',
    `Görev: ${gorev.tanim}`,
    `Lokasyon: ${lokasyon}`,
    `Atanan: ${atanan}`,
    `Tarih: ${tarih}`,
    `Durum: ${durumLabel}`,
    `#gorev:${gorev.id}`,
  ]

  const payload = adminIds.map(alici_id => ({
    alici_id,
    baslik: 'Görev durumu güncellendi',
    mesaj: mesajLines.join('\n'),
    tip: 'durum_degisimi',
  }))

  await supabase.from('bildirimler').insert(payload)
}
