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
    const now = new Date().toISOString()

    // Tüm kategorileri tarayan kapsamlı PG fonksiyonu
    const { data: bulgularRaw, error: rpcErr } = await admin.rpc('veri_butunluk_kontrol_tam')
    if (rpcErr) throw new Error('butunluk kontrol: ' + rpcErr.message)

    // PASIF firmaları atla — kapatılmış/devre dışı firma kayıtları aktif uyarı
    // olarak görünmesin, sürekli yeniden tetiklenmesin.
    const { data: aktifFirmalar } = await admin
      .from('firmalar')
      .select('id')
      .eq('aktif', true)
    const aktifFirmaSet = new Set((aktifFirmalar ?? []).map((f: any) => f.id as string))
    const bulgular = (bulgularRaw ?? []).filter((b: any) =>
      b.firma_id == null || aktifFirmaSet.has(b.firma_id)
    )
    const pasifAtlanan = (bulgularRaw?.length ?? 0) - bulgular.length

    const toplam = bulgular.reduce((s: number, b: any) => s + Number(b.sayi ?? 0), 0)
    const kategoriSayisi = bulgular.length

    // Audit log
    await admin.from('audit_log').insert({
      tip: 'butunluk_kontrol', tablo: 'coklu',
      satir_sayisi: toplam, basarili: true,
      detay: { kategoriler: bulgular, toplam_sayi: toplam, kategori_sayisi: kategoriSayisi },
    })

    // Mevcut devam eden alert'leri çek (auto-resolve için)
    const { data: mevcutAlertler } = await admin
      .from('sistem_alerts')
      .select('id, kategori, firma_id')
      .eq('kaynak', 'veri_butunluk_kontrol')
      .eq('cozuldu', false)

    const mevcutMap = new Map<string, number>()
    for (const a of mevcutAlertler ?? []) {
      mevcutMap.set(`${a.kategori ?? ''}|${a.firma_id ?? ''}`, a.id)
    }

    // Her bulgu için: varsa UPDATE (tekrar teyit), yoksa INSERT
    let yeniSayi = 0, guncelSayi = 0
    const hala_devam = new Set<string>()
    if (bulgular) {
      for (const b of bulgular) {
        const key = `${b.kategori}|${b.firma_id ?? ''}`
        hala_devam.add(key)
        const mevcutId = mevcutMap.get(key)
        const payload = {
          kategori: b.kategori,
          seviye: (['kritik', 'yuksek', 'orta', 'dusuk'].includes(b.seviye) ? b.seviye : 'orta'),
          baslik: `Veri Bütünlük: ${b.kategori}`,
          mesaj: `${Number(b.sayi)} adet kayıt — ${b.aciklama}${b.en_eski ? ` (ilk: ${b.en_eski}, son: ${b.en_yeni})` : ''}`,
          firma_id: b.firma_id,
          kaynak: 'veri_butunluk_kontrol',
          son_kontrol_tarihi: now,
          detay: {
            kategori: b.kategori,
            sayi: Number(b.sayi),
            en_eski: b.en_eski,
            en_yeni: b.en_yeni,
            aciklama: b.aciklama,
          },
        }
        if (mevcutId) {
          // Mevcut alert: mesajı tazele + tekrar sayısını artır
          await admin.from('sistem_alerts').update({
            mesaj: payload.mesaj,
            son_kontrol_tarihi: now,
            detay: payload.detay,
            seviye: payload.seviye,
          }).eq('id', mevcutId)
          await admin.rpc('increment_alert_tekrar', { p_id: mevcutId })
          guncelSayi++
        } else {
          // Yeni alert
          await admin.from('sistem_alerts').insert({ ...payload, tekrar_sayisi: 1 })
          yeniSayi++
        }
      }
    }

    // Bulunamayan (çözülmüş) alert'leri otomatik kapat
    const otomatikCozulen: number[] = []
    for (const a of mevcutAlertler ?? []) {
      const key = `${a.kategori ?? ''}|${a.firma_id ?? ''}`
      if (!hala_devam.has(key)) otomatikCozulen.push(a.id)
    }
    if (otomatikCozulen.length > 0) {
      await admin.from('sistem_alerts').update({
        cozuldu: true, cozum_tarihi: now,
        detay: { otomatik_cozum: 'Sonraki kontrolde tespit edilmedi' } as any,
      }).in('id', otomatikCozulen)
    }

    // SA kullanıcılarına FCM push — sadece YENI tespit edilen hatalar için
    if (yeniSayi > 0 && bulgular) {
      const kritikSayi = bulgular.filter((b: any) => b.seviye === 'kritik').length
      const { data: saUsers } = await admin.from('users')
        .select('id').in('rol', ['super_admin', 'alt_super_admin']).eq('aktif', true)
      for (const u of saUsers ?? []) {
        try {
          await sendFCMToUser(
            u.id,
            kritikSayi > 0 ? '🔴 KRİTİK: Yeni Veri Bütünlük Sorunu' : '⚠️ Yeni Veri Bütünlük Sorunu',
            `${yeniSayi} yeni sorun tespit edildi${kritikSayi > 0 ? ` (${kritikSayi} kritik)` : ''}. Sistem Uyarıları paneline bakın.`,
            'gorev_uyari'
          )
        } catch {}
      }
    }

    return NextResponse.json({
      ok: true, toplam, kategori_sayisi: kategoriSayisi,
      bulgular: bulgular ?? [],
      alert_yeni: yeniSayi, alert_guncel: guncelSayi, alert_otomatik_cozulen: otomatikCozulen.length,
      pasif_firma_atlanan: pasifAtlanan,
    })
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
