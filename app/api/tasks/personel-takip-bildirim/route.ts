/**
 * POST /api/tasks/personel-takip-bildirim
 * Cron: her 5 dk'da çalışır.
 * ACIK/ISLEMDE görevleri tarar, baslatilma_tarihi üzerinden X dk geçtiyse
 * FCM bildirim gönderir (1., 2., 3. bildirim).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-cron-token')
  const envToken = process.env.CRON_SECRET
  if (!envToken || !token || token !== envToken)
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const admin = createAdminClient()
  const now = Date.now()
  let toplam = 0

  // Aktif firmalar ve projeleri çek
  const { data: firmalar } = await admin
    .from('firmalar')
    .select('id,personel_takip_bildirim_dk')
    .eq('aktif', true)
    .gt('personel_takip_bildirim_dk', 0) // sadece aktif olanlar

  const { data: projeler } = await admin
    .from('projeler')
    .select('id,firma_id,personel_takip_bildirim_dk')
    .eq('aktif', true)

  // Proje override map: proje_id → bildirim_dk
  const projeOverride = new Map<string, number>()
  for (const p of projeler ?? []) {
    if (p.personel_takip_bildirim_dk != null) projeOverride.set(p.id, p.personel_takip_bildirim_dk)
  }

  for (const firma of firmalar ?? []) {
    const firmaDk = firma.personel_takip_bildirim_dk
    if (!firmaDk || firmaDk <= 0) continue

    // Bu firmadaki ACIK/ISLEMDE görevleri çek — başlatılmış olanlar
    const { data: gorevler } = await admin
      .from('canli_gorevler')
      .select('id,firma_id,proje_id,tanim,lokasyon_id,atanan_kullanici_id,baslatilma_tarihi,bildirim_sayaci,son_bildirim_tarihi')
      .eq('firma_id', firma.id)
      .in('durum', ['ACIK', 'ISLEMDE'])
      .not('baslatilma_tarihi', 'is', null) // sadece başlatılmış görevler
      .limit(500)

    for (const g of gorevler ?? []) {
      if (!g.baslatilma_tarihi || !g.atanan_kullanici_id) continue

      // Efektif bildirim süresi: proje override > firma
      let bildirimDk = firmaDk
      if (g.proje_id && projeOverride.has(g.proje_id)) {
        const projeDk = projeOverride.get(g.proje_id)!
        if (projeDk <= 0) continue // proje bazında kapalı
        bildirimDk = projeDk
      }

      const baslatma = new Date(g.baslatilma_tarihi).getTime()
      const gecenDk = Math.floor((now - baslatma) / 60000)
      const mevcutSayac = g.bildirim_sayaci ?? 0

      // Kaçıncı bildirim gönderilmeli?
      // 1. bildirim: X dk sonra, 2. bildirim: 2X dk sonra, 3. bildirim: 3X dk sonra
      const beklenenSayac = Math.min(3, Math.floor(gecenDk / bildirimDk))

      if (beklenenSayac > mevcutSayac) {
        // Bildirim gönder
        const bildirimNo = mevcutSayac + 1
        const gecenStr = gecenDk >= 60
          ? `${Math.floor(gecenDk / 60)} saat ${gecenDk % 60} dk`
          : `${gecenDk} dk`

        const title = bildirimNo === 1
          ? '⏰ Görev Hatırlatma'
          : bildirimNo === 2
          ? '⚠️ Görev Hâlâ Tamamlanmadı!'
          : '🚨 Acil: Görev Bekleniyor!'

        const body = `"${g.tanim}" görevi ${gecenStr} önce başlatıldı ve henüz tamamlanmadı. (${bildirimNo}. hatırlatma)`

        try {
          await sendFCMToUser(g.atanan_kullanici_id, title, body, 'gorev_uyari')

          // Sayacı güncelle
          await admin.from('canli_gorevler').update({
            bildirim_sayaci: bildirimNo,
            son_bildirim_tarihi: new Date().toISOString(),
          }).eq('id', g.id)

          toplam++
        } catch (e: any) {
          console.error(`[personel-takip] Bildirim hatası gorev=${g.id}:`, e.message)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, gonderilen: toplam })
}
