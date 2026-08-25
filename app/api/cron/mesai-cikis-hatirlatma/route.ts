/**
 * POST /api/cron/mesai-cikis-hatirlatma
 * Cron: her 5 dk'da calisir.
 *
 * PT-aktif projelerde acik mesai kayitlarini (cikis_saati NULL) tarar:
 *
 * 1. Personelin vardiyasini giris_saati'ne gore tahminle (aktifVardiyaAraligi).
 * 2. Vardiya bitisinden 15 dk gectiyse ve cikis_bildirim_gonderildi=false ise:
 *    - Token uret + kayda yaz (cikis_onay_token, cikis_bildirim_gonderildi=true)
 *    - Personele push: "Cikis QR'ini okutmadiniz. Onay/Devam icin tikla"
 *    - data.link = /mesai/cikis-onay/{token} (Next.js sayfasi, mobil+web ortak)
 * 3. Vardiya bitisinden 30 dk gectiyse ve cikis_devam_flag=false ise:
 *    - Otomatik kapat: cikis_saati = vardiya_bitis + 15dk,
 *      cikis_tipi = 'OTOMATIK_ZAMAN_ASIMI'
 *    - Token invalidate et
 *
 * cikis_devam_flag=true olan kayitlar hem push hem otomatik kapamadan atlanir
 * (personel bilincli devam ediyor - fazla mesai).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'
import { aktifVardiyaAraligi } from '@/lib/scan/vardiya'
import { mergeVardiyaRows } from '@/lib/vardiya/getEffective'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-cron-token')
  const envToken = process.env.CRON_SECRET
  if (!envToken || !token || token !== envToken) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = Date.now()
  const bugun = new Date(now + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dun = new Date(now + 3 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  let pushGonderilen = 0
  let otomatikKapatilan = 0
  let atlanan = 0

  // PT aktif firmalar
  const { data: firmalar } = await admin
    .from('firmalar')
    .select('id, vardiya_sayisi, tum_vardiya_ayarlari, personel_takibi_aktif')
    .eq('aktif', true)
    .eq('personel_takibi_aktif', true)

  if (!firmalar || firmalar.length === 0) {
    return NextResponse.json({ ok: true, mesaj: 'PT aktif firma yok', push: 0, kapama: 0 })
  }

  const firmaIds = firmalar.map(f => f.id)
  const firmaMap = new Map(firmalar.map(f => [f.id, f]))

  // PT aktif projeler (proje seviyesinde de aktif olmali)
  const { data: projeler } = await admin
    .from('projeler')
    .select('id, firma_id, vardiya_sayisi, tum_vardiya_ayarlari, personel_takibi_aktif, aktif')
    .in('firma_id', firmaIds)
    .eq('aktif', true)
    .eq('personel_takibi_aktif', true)

  const projeMap = new Map((projeler ?? []).map(p => [p.id, p]))

  // Bugun/dun acik mesai kayitlarini cek (24 saati asan da olabilir)
  const { data: acikMesailer } = await admin
    .from('personel_mesai_kayitlari')
    .select('id, user_id, firma_id, proje_id, giris_saati, kayit_tarihi, cikis_bildirim_gonderildi, cikis_devam_flag, cikis_onay_token')
    .in('firma_id', firmaIds)
    .in('kayit_tarihi', [bugun, dun])
    .is('cikis_saati', null)
    .not('giris_saati', 'is', null)

  for (const m of acikMesailer ?? []) {
    if (!m.user_id || !m.giris_saati) { atlanan++; continue }

    // Efektif vardiya ayari (proje override > firma)
    const firma = firmaMap.get(m.firma_id) as any
    const proje = m.proje_id ? projeMap.get(m.proje_id) as any : null

    // Personelin projesi PT aktif degilse atla (proje seviyesinde kapali)
    if (m.proje_id && !proje) { atlanan++; continue }

    const ev = mergeVardiyaRows(firma, proje)
    const vardiya = aktifVardiyaAraligi(ev.vardiya_sayisi, ev.tum_vardiya_ayarlari, m.giris_saati)

    if (!vardiya || !vardiya.bitisISO) { atlanan++; continue }

    const vardiyaBitisMs = new Date(vardiya.bitisISO).getTime()
    const gecenDk = Math.floor((now - vardiyaBitisMs) / 60000)

    // Vardiya bitisi henuz gelmedi
    if (gecenDk < 15) { atlanan++; continue }

    // GUVENLIK: Personel en az 4 saat calisti mi? Vardiya yanlis tahmin
    // edilmis olabilir. Ornek: 14:30 giris, sistem V2 (bitis 16:00) sandi ama
    // personel V3 (16:00-24:00) icin 1.5 saat erken geldi. Bu durumda 16:15'te
    // "cikis unutuldu" push atmak yanlis olur. Cikis unutma davranisi ancak
    // gercek bir vardiya suresi (min 4 saat) calistiktan sonra anlamli.
    const girisMs = new Date(m.giris_saati).getTime()
    const calismaDk = Math.floor((now - girisMs) / 60000)
    if (calismaDk < 4 * 60) {
      atlanan++
      continue
    }

    // Personel "devam ediyorum" dedi → hicbirsey yapma
    if (m.cikis_devam_flag) { atlanan++; continue }

    // 3. Otomatik kapama (30+ dk)
    if (gecenDk >= 30) {
      const cikisIso = new Date(vardiyaBitisMs + 15 * 60 * 1000).toISOString()
      const { error: updErr } = await admin
        .from('personel_mesai_kayitlari')
        .update({
          cikis_saati: cikisIso,
          cikis_tipi: 'OTOMATIK_ZAMAN_ASIMI',
          cikis_onay_token: null,
        })
        .eq('id', m.id)
      if (!updErr) otomatikKapatilan++
      continue
    }

    // 2. Push bildirim (15-29 dk arasi, tek kez)
    if (m.cikis_bildirim_gonderildi) { atlanan++; continue }

    const yeniToken = randomUUID()
    const { error: tokenErr } = await admin
      .from('personel_mesai_kayitlari')
      .update({
        cikis_onay_token: yeniToken,
        cikis_bildirim_gonderildi: true,
      })
      .eq('id', m.id)
      .eq('cikis_bildirim_gonderildi', false) // race koruma

    if (tokenErr) { atlanan++; continue }

    // Personel adi (bildirim body icin)
    const { data: userRow } = await admin.from('users').select('isim_soyisim').eq('id', m.user_id).single()
    const isim = (userRow as any)?.isim_soyisim ?? 'Personel'

    const vardiyaBitisSaat = `${vardiya.bitis}`  // "16:00" gibi
    const title = '🚪 İş Çıkışı QR\'ınızı Okutmayı Unuttunuz mu?'
    const body = `${isim}, vardiyanız ${vardiyaBitisSaat}'da bitti. Çıkış onayı veya "devam ediyorum" için tıklayın. 15 dk içinde tepki gelmezse çıkışınız otomatik yapılır.`

    try {
      await sendFCMToUser(m.user_id, title, body, 'gorev_uyari', {
        link: `/mesai/cikis-onay/${yeniToken}`,
      })
      pushGonderilen++
    } catch (e: any) {
      console.error(`[mesai-cikis-hatirlatma] push hata mesai=${m.id}:`, e.message)
    }
  }

  return NextResponse.json({
    ok: true,
    push_gonderilen: pushGonderilen,
    otomatik_kapatilan: otomatikKapatilan,
    atlanan,
    kontrol_edilen: acikMesailer?.length ?? 0,
  })
}
