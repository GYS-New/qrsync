/**
 * Sistem-seviyesi kritik uyarı: belirtilen firmanın TÜM aktif TA'larına
 * web in-app + FCM push gönderir. Frontend KritikUyariModal otomatik
 * popup açar (bildirimler.tip='kritik_uyari').
 *
 * Idempotency: aynı firma + aynı kod (örn. 'GOREV_URETIM_BASARISIZ') için
 * son 4 saat içinde okunmamış bir kayıt varsa tekrar gönderilmez. Cron
 * her saat çalıştığı için aynı sorun saatler boyunca spam yapmasın diye.
 *
 * Fire-and-forget — caller akışı bekletmez.
 */
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

interface BildirimParam {
  firmaId: string
  kod: string          // Idempotency anahtarı (örn 'GOREV_URETIM_BASARISIZ')
  baslik: string
  mesaj: string
}

const SPAM_KORUMA_SAAT = 4

export async function sistemUyariBildir(p: BildirimParam): Promise<void> {
  try {
    const admin = createAdminClient()

    // Aktif TA'lar
    const { data: taList } = await admin
      .from('users')
      .select('id')
      .eq('firma_id', p.firmaId)
      .eq('rol', 'tenant_admin')
      .eq('aktif', true)

    const aliciIds = (taList ?? []).map((u: any) => u.id)
    if (!aliciIds.length) return

    // Spam koruması: son N saatte aynı kod ile kritik_uyari okunmamış varsa atla
    const cutoff = new Date(Date.now() - SPAM_KORUMA_SAAT * 60 * 60 * 1000).toISOString()
    const kodEtiketi = `[${p.kod}]`
    const { data: mevcut } = await admin
      .from('bildirimler')
      .select('id')
      .in('alici_id', aliciIds)
      .eq('tip', 'kritik_uyari')
      .eq('okundu', false)
      .gte('tarih', cutoff)
      .like('mesaj', `%${kodEtiketi}%`)
      .limit(1)
    if (mevcut && mevcut.length > 0) return

    const mesajKodlu = `${kodEtiketi} ${p.mesaj}`

    // Web in-app — bildirimler tablosuna toplu insert
    const rows = aliciIds.map(uid => ({
      alici_id: uid,
      baslik: p.baslik,
      mesaj: mesajKodlu,
      tip: 'kritik_uyari' as const,
      okundu: false,
    }))
    await admin.from('bildirimler').insert(rows).then(() => {}, (e: any) => {
      console.error('[sistemUyariBildir:web]', e)
    })

    // FCM
    await Promise.all(
      aliciIds.map((uid: string) => sendFCMToUser(uid, p.baslik, p.mesaj, 'gorev_uyari').catch(() => {})),
    )
  } catch (e) {
    console.error('[sistemUyariBildir]', e)
  }
}
