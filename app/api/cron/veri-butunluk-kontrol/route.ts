import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/veri-butunluk-kontrol
 *
 * Günlük çalışır. Yetim kayıtları tespit eder:
 *   - checklist_sonuc_basliklari_arsiv'de canli_gorev_id/gorev_id dolu ama görev 4 tablonun hiçbirinde yok
 *
 * Bulgular:
 *   - audit_log'a yazılır
 *   - sistem_alerts'e kritik alert düşer
 *   - SA kullanıcılarına FCM push gönderir
 *
 * Güvenlik: CRON_SECRET header gerekli
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const provided = req.headers.get('x-cron-secret') ?? url.searchParams.get('secret')
  const expected = process.env.CRON_SECRET
  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    // PG fonksiyonu: yetim kayıtları firma bazlı getir
    const { data: yetimler, error: rpcErr } = await admin.rpc('yetim_ceklist_kayitlari')
    if (rpcErr) throw new Error('yetim kontrol: ' + rpcErr.message)

    const toplam = (yetimler ?? []).reduce((s: number, y: any) => s + Number(y.yetim_sayi ?? 0), 0)

    // Audit log
    await admin.from('audit_log').insert({
      tip: 'butunluk_kontrol', tablo: 'checklist_sonuc_basliklari_arsiv',
      satir_sayisi: toplam, basarili: true,
      detay: { firma_bazli: yetimler, toplam },
    })

    // Yetim varsa alert + FCM
    if (toplam > 0 && yetimler) {
      const alertRows = yetimler.map((y: any) => ({
        seviye: 'yuksek',
        baslik: 'Yetim Çeklist Kayıtları Tespit Edildi',
        mesaj: `${Number(y.yetim_sayi)} adet çeklist kaydının görevi bulunamıyor. İlk kayıt: ${y.en_eski}, son: ${y.en_yeni}`,
        firma_id: y.firma_id,
        kaynak: 'veri_butunluk_kontrol',
        detay: { yetim_sayi: Number(y.yetim_sayi), en_eski: y.en_eski, en_yeni: y.en_yeni },
      }))
      await admin.from('sistem_alerts').insert(alertRows)

      // SA kullanıcılarına FCM push
      const { data: saUsers } = await admin.from('users')
        .select('id').in('rol', ['super_admin', 'alt_super_admin']).eq('aktif', true)
      for (const u of saUsers ?? []) {
        try {
          await sendFCMToUser(
            u.id,
            '⚠️ Veri Bütünlük Uyarısı',
            `${toplam} yetim çeklist kaydı tespit edildi. Detay için Sistem Uyarıları paneline bakın.`,
            'gorev_uyari'
          )
        } catch {}
      }
    }

    return NextResponse.json({ ok: true, toplam, firmalar: yetimler ?? [] })
  } catch (err: any) {
    console.error('[veri-butunluk-kontrol] HATA:', err.message)
    // Hata alertı
    try {
      const admin = createAdminClient()
      await admin.from('sistem_alerts').insert({
        seviye: 'kritik',
        baslik: 'Bütünlük Kontrol Cron Başarısız',
        mesaj: err.message,
        kaynak: 'veri_butunluk_kontrol',
      })
    } catch {}
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
