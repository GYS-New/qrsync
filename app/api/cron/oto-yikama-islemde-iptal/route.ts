import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

/**
 * GET/POST /api/cron/oto-yikama-islemde-iptal
 *
 * 6 saatten uzun süredir ISLEMDE'de askıda kalan Oto Yıkama görevlerini
 * IPTAL'e çeker (RPC oto_yikama_islemde_to_iptal). Saatte bir Supabase
 * pg_cron + pg_net tarafından çağrılır.
 *
 * Iptal edilen her görev için, görevi başlatan personele FCM bildirim
 * gönderilir: "Yıkama otomatik iptal edildi" — personel app'ı açtığında
 * yeniden başlatabilsin.
 *
 * Güvenlik: x-cron-token header (CRON_SECRET env değişkeni ile aynı).
 * pg_cron vault.cron_secret'i çekip header'a koyar — vardiya-performans
 * cron'u ile aynı pattern.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function handle(req: NextRequest) {
  const url = new URL(req.url)
  const provided = req.headers.get('x-cron-token') ?? url.searchParams.get('secret')
  const expected = process.env.CRON_SECRET

  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('oto_yikama_islemde_to_iptal')
    if (error) throw new Error(error.message)

    const sonuc = data as any
    const sayi: number = sonuc?.sayi ?? 0
    const iptalEdilen: Array<{
      gorev_id: string
      plaka: string
      baslatan_id: string | null
      baslatilma: string
    }> = Array.isArray(sonuc?.iptal_edilen) ? sonuc.iptal_edilen : []

    console.log('[cron/oto-yikama-islemde-iptal]', JSON.stringify(sonuc))
    await admin.from('cron_log').insert({ tip: 'oto_yikama_islemde_iptal', sonuc })

    // FCM bildirim — sadece baslatan_id dolu olanlara
    let fcmGonderildi = 0
    let fcmAtlandi = 0
    for (const it of iptalEdilen) {
      if (!it?.baslatan_id) { fcmAtlandi++; continue }
      try {
        await sendFCMToUser(
          it.baslatan_id,
          'Yıkama otomatik iptal edildi',
          `${it.plaka} plakalı aracın yıkama görevi 6 saat içinde tamamlanmadığı için iptal edildi. Yeniden başlatmak için plakayı tekrar okutun.`,
          'gorev_uyari',
          {
            tip: 'oto_yikama_iptal',
            gorev_id: String(it.gorev_id),
            plaka: String(it.plaka),
          },
        )
        fcmGonderildi++
      } catch (e: any) {
        console.warn('[cron/oto-yikama-islemde-iptal] FCM hata:', e?.message)
      }
    }

    return NextResponse.json({ ok: true, sayi, fcmGonderildi, fcmAtlandi, sonuc })
  } catch (err: any) {
    console.error('[cron/oto-yikama-islemde-iptal] HATA:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
