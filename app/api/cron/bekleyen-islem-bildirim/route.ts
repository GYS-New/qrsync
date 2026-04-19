import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

/**
 * POST /api/cron/bekleyen-islem-bildirim
 * Her gece 22:00'da çalışır.
 * Bekleyen offline işlemi olan cihazlara push bildirim gönderir.
 */
export async function POST(req: NextRequest) {
  const cronSecret = req.headers.get('x-cron-token')
  const envSecret = process.env.CRON_SECRET
  if (!envSecret || !cronSecret || cronSecret !== envSecret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Bildirimi henüz gönderilmemiş bekleyen işlemleri bul
  // 72 saatten eski olanları temizle
  const limitZaman = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()
  
  await admin
    .from('bekleyen_islemler')
    .delete()
    .lt('zaman', limitZaman)

  // Bildirim gönderilmemiş kayıtları bul
  const { data: bekleyenler } = await admin
    .from('bekleyen_islemler')
    .select('user_id, device_token, tip, zaman')
    .eq('bildirim_gonderildi', false)

  if (!bekleyenler?.length) {
    return NextResponse.json({ ok: true, gonderilen: 0 })
  }

  let gonderilen = 0

  for (const item of bekleyenler) {
    try {
      await sendFCMToUser(
        item.user_id,
        '⚠️ Bekleyen Kaydınız Var',
        'Çevrimdışıyken yapılan işleminiz henüz sunucuya iletilmedi. Lütfen uygulamayı açın.',
        'gorev_uyari'
      )

      // Bildirim gönderildi olarak işaretle
      await admin
        .from('bekleyen_islemler')
        .update({ bildirim_gonderildi: true })
        .eq('device_token', item.device_token)

      gonderilen++
    } catch {}
  }

  if (gonderilen > 0) {
    const { auditLog } = await import('@/lib/audit/log')
    await auditLog({
      tip: 'cron_bekleyen_islem', tablo: 'bildirimler',
      satir_sayisi: gonderilen,
      detay: { gonderilen, toplam: bekleyenler.length },
    })
  }

  return NextResponse.json({ ok: true, gonderilen, toplam: bekleyenler.length })
}
