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

    // Tüm kategorileri tarayan kapsamlı PG fonksiyonu
    const { data: bulgular, error: rpcErr } = await admin.rpc('veri_butunluk_kontrol_tam')
    if (rpcErr) throw new Error('butunluk kontrol: ' + rpcErr.message)

    const toplam = (bulgular ?? []).reduce((s: number, b: any) => s + Number(b.sayi ?? 0), 0)
    const kategoriSayisi = (bulgular ?? []).length

    // Audit log — tek satır, detayda tüm kategoriler
    await admin.from('audit_log').insert({
      tip: 'butunluk_kontrol', tablo: 'coklu',
      satir_sayisi: toplam, basarili: true,
      detay: { kategoriler: bulgular, toplam_sayi: toplam, kategori_sayisi: kategoriSayisi },
    })

    // Her bulgu için ayrı alert
    if (toplam > 0 && bulgular) {
      const alertRows = bulgular.map((b: any) => ({
        seviye: (['kritik', 'yuksek', 'orta', 'dusuk'].includes(b.seviye) ? b.seviye : 'orta'),
        baslik: `Veri Bütünlük: ${b.kategori}`,
        mesaj: `${Number(b.sayi)} adet kayıt — ${b.aciklama}${b.en_eski ? ` (ilk: ${b.en_eski}, son: ${b.en_yeni})` : ''}`,
        firma_id: b.firma_id,
        kaynak: 'veri_butunluk_kontrol',
        detay: {
          kategori: b.kategori,
          sayi: Number(b.sayi),
          en_eski: b.en_eski,
          en_yeni: b.en_yeni,
          aciklama: b.aciklama,
        },
      }))
      await admin.from('sistem_alerts').insert(alertRows)

      // SA kullanıcılarına FCM push — bir kere, özet
      const kritikSayi = bulgular.filter((b: any) => b.seviye === 'kritik').length
      const { data: saUsers } = await admin.from('users')
        .select('id').in('rol', ['super_admin', 'alt_super_admin']).eq('aktif', true)
      for (const u of saUsers ?? []) {
        try {
          await sendFCMToUser(
            u.id,
            kritikSayi > 0 ? '🔴 KRİTİK: Veri Bütünlük Uyarısı' : '⚠️ Veri Bütünlük Uyarısı',
            `${kategoriSayisi} kategoride toplam ${toplam} yetim/tutarsız kayıt tespit edildi${kritikSayi > 0 ? ` (${kritikSayi} kritik)` : ''}. Sistem Uyarıları paneline bakın.`,
            'gorev_uyari'
          )
        } catch {}
      }
    }

    return NextResponse.json({ ok: true, toplam, kategori_sayisi: kategoriSayisi, bulgular: bulgular ?? [] })
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
