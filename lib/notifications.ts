import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDateTime } from '@/lib/utils'
import { sendFCMToUser } from '@/lib/fcm-sender'

export type GorevDurum = 'ACIK' | 'ISLEMDE' | 'IPTAL' | 'TAMAMLANDI'

/**
 * FCM push gönderimi — environment-aware.
 * Client-side: /api/notifications/send-push fetch (SUPABASE_SERVICE_ROLE_KEY
 *   client'ta yok, sendFCMToUser sessizce fail oluyor).
 * Server-side: direkt sendFCMToUser çağrısı.
 */
async function pushIfPossible(
  aliciId: string,
  title: string,
  message: string,
  channelId: string = 'gorev_uyari',
) {
  try {
    if (typeof window !== 'undefined') {
      await fetch('/api/notifications/send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliciId, title, message, channelId }),
      })
    } else {
      await sendFCMToUser(aliciId, title, message, channelId)
    }
  } catch { /* sessiz */ }
}

function extractGorevIdTag(mesaj: string): string | null {
  const m = /#gorev:([0-9a-fA-F-]{36})/.exec(mesaj ?? '')
  return m?.[1] ?? null
}

export const NotificationUtils = {
  extractGorevIdTag,
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
    `#gorev:${gorevId}`,
  ]

  await supabase.from('bildirimler').insert({
    alici_id: aliciId,
    baslik: 'Yeni görev ataması',
    mesaj: mesajLines.join('\n'),
    tip: 'gorev_atama',
  })

  // FCM push — client/server farkını otomatik yönet (bkz pushIfPossible)
  await pushIfPossible(
    aliciId,
    'Yeni Görev Ataması',
    `${tanim}${lokasyonTanim ? ' — ' + lokasyonTanim : ''}`,
    'gorev_uyari',
  )
}

// notifyTenantAdminsOnGorevStatusChange kaldırıldı (2026-06-26).
// Sebep: Görev durumu değişiminde firma-wide TA spam'i — değişikliği yapan
// kullanıcı zaten haberdar, başka TA'ların bilgilendirilmesi kullanıcı kararıyla
// istenmiyor. Hem proje izolasyonu yoktu (Çanakkale görev → Renault TA push),
// hem de "Sistem tarafından" hatalı actor etiketi vardı. Fonksiyon ve tüm
// çağrı noktaları (GorevlerClient, BildirimlerClient) kaldırıldı.
