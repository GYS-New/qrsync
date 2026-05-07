/**
 * Bir proje aktif → pasif yapıldığında ilgili firmanın TÜM aktif TA'larına
 * kritik uyarı gönderir.
 *
 * İki kanal:
 *   - Web in-app:  bildirimler tablosuna 'kritik_uyari' tipinde kayıt
 *                  → frontend KritikUyariModal otomatik popup açar
 *   - Mobil push:  FCM (paired cihaz varsa)
 *
 * Fire-and-forget — proje update akışını bekletmez.
 */
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

interface BildirimParam {
  firmaId: string
  projeAdi: string
  yapanKullaniciId: string
  yapanIsim: string
}

export async function projePasiflendiBildir(p: BildirimParam): Promise<void> {
  try {
    const admin = createAdminClient()

    // İşlemi yapan KENDİSİ haricindeki tüm aktif TA'lar
    const { data: taList } = await admin
      .from('users')
      .select('id')
      .eq('firma_id', p.firmaId)
      .eq('rol', 'tenant_admin')
      .eq('aktif', true)
      .neq('id', p.yapanKullaniciId)

    const aliciIds = (taList ?? []).map((u: any) => u.id)
    if (!aliciIds.length) return

    const title = '🚨 Proje Pasif Edildi'
    const body  = `"${p.projeAdi}" projesi ${p.yapanIsim} tarafından pasif edildi. Sistem operasyonları durmuş olabilir — gerekirse projeyi tekrar aktif edin.`

    // 1) Web in-app — bildirimler tablosuna toplu insert (tip=kritik_uyari)
    const bildirimRows = aliciIds.map(uid => ({
      alici_id: uid,
      baslik: title,
      mesaj: body,
      tip: 'kritik_uyari' as const,
      okundu: false,
    }))
    await admin.from('bildirimler').insert(bildirimRows).then(() => {}, (e: any) => {
      console.error('[projePasiflendiBildir:web]', e)
    })

    // 2) Mobil FCM push — paralel, hata sessiz geçer
    await Promise.all(
      aliciIds.map((uid: string) => sendFCMToUser(uid, title, body, 'gorev_uyari').catch(() => {})),
    )
  } catch (e) {
    console.error('[projePasiflendiBildir]', e)
  }
}
