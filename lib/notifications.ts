import type { SupabaseClient } from '@supabase/supabase-js'
import { formatDateTime, GOREV_DURUM_LABEL } from '@/lib/utils'
import { sendFCMToUser } from '@/lib/fcm-sender'

export type GorevDurum = 'ACIK' | 'ISLEMDE' | 'IPTAL' | 'TAMAMLANDI'

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

  // FCM push bildirim gönder
  try {
    await sendFCMToUser(
      aliciId,
      '📋 Yeni Görev Ataması',
      `${tanim}${lokasyonTanim ? ' — ' + lokasyonTanim : ''}`,
      'default',
    )
  } catch {}
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
