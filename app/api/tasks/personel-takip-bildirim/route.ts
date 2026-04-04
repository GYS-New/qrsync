/**
 * POST /api/tasks/personel-takip-bildirim
 * Cron: her 5 dk'da çalışır.
 *
 * Personel takibi aktif firmalar için:
 * - Mesaide olan (giris_saati var, cikis_saati null) personelleri bulur
 * - giris_saati üzerinden X dk geçtiyse ve henüz görev başlatmamışsa:
 *   1. bildirim (X dk): "Görev başlatmanız gerekiyor"
 *   2. bildirim (2X dk): "Hâlâ görev başlatılmadı"
 *   3. bildirim (3X dk): "Acil hatırlatma" + TA'ya "şu kişi işte ama görev yapmıyor" bildirimi
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
  const bugun = new Date().toISOString().slice(0, 10)
  let toplam = 0

  // Aktif firmalar (personel takip bildirimi açık olanlar)
  const { data: firmalar } = await admin
    .from('firmalar')
    .select('id,personel_takip_bildirim_dk')
    .eq('aktif', true)
    .gt('personel_takip_bildirim_dk', 0)

  // Proje override'ları
  const { data: projeler } = await admin
    .from('projeler')
    .select('id,firma_id,personel_takip_bildirim_dk')
    .eq('aktif', true)
  const projeOverride = new Map<string, number>()
  for (const p of projeler ?? []) {
    if (p.personel_takip_bildirim_dk != null) projeOverride.set(p.id, p.personel_takip_bildirim_dk)
  }

  // TA kullanıcıları (3. bildirimde web bildirim gönderilecek)
  const taMap = new Map<string, string[]>() // firma_id → [ta_user_id]
  const { data: taUsers } = await admin
    .from('users')
    .select('id,firma_id')
    .eq('rol', 'tenant_admin')
    .eq('aktif', true)
  for (const u of taUsers ?? []) {
    const arr = taMap.get(u.firma_id) ?? []
    arr.push(u.id)
    taMap.set(u.firma_id, arr)
  }

  for (const firma of firmalar ?? []) {
    const firmaDk = firma.personel_takip_bildirim_dk
    if (!firmaDk || firmaDk <= 0) continue

    // Bugün mesaide olan personeller (giris var, cikis yok)
    const { data: mesaiKayitlari } = await admin
      .from('personel_mesai_kayitlari')
      .select('id,user_id,firma_id,proje_id,giris_saati,bildirim_sayaci,son_bildirim_tarihi')
      .eq('firma_id', firma.id)
      .eq('kayit_tarihi', bugun)
      .is('cikis_saati', null)
      .not('giris_saati', 'is', null)

    for (const mesai of mesaiKayitlari ?? []) {
      if (!mesai.giris_saati || !mesai.user_id) continue

      // Efektif bildirim süresi
      let bildirimDk = firmaDk
      if (mesai.proje_id && projeOverride.has(mesai.proje_id)) {
        const pDk = projeOverride.get(mesai.proje_id)!
        if (pDk <= 0) continue // proje bazında kapalı
        bildirimDk = pDk
      }

      const girisSaat = new Date(mesai.giris_saati).getTime()
      const gecenDk = Math.floor((now - girisSaat) / 60000)
      const mevcutSayac = (mesai as any).bildirim_sayaci ?? 0

      // Kaçıncı bildirim gönderilmeli?
      const beklenenSayac = Math.min(3, Math.floor(gecenDk / bildirimDk))
      if (beklenenSayac <= mevcutSayac) continue

      // Bu personel bugün görev başlatmış mı?
      const { count: baslatilan } = await admin
        .from('canli_gorevler')
        .select('id', { count: 'exact', head: true })
        .eq('firma_id', firma.id)
        .eq('atanan_kullanici_id', mesai.user_id)
        .in('durum', ['ISLEMDE', 'TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'])
        .gte('baslatilma_tarihi', `${bugun}T00:00:00`)

      // Görev başlatılmışsa bildirim gönderme
      if ((baslatilan ?? 0) > 0) continue

      const bildirimNo = mevcutSayac + 1
      const gecenStr = gecenDk >= 60
        ? `${Math.floor(gecenDk / 60)} saat ${gecenDk % 60} dk`
        : `${gecenDk} dk`

      // Personel adını çek
      const { data: personel } = await admin.from('users').select('isim_soyisim').eq('id', mesai.user_id).single()
      const isim = (personel as any)?.isim_soyisim ?? 'Personel'

      // Personele FCM bildirim
      const title = bildirimNo === 1
        ? '⏰ Görev Başlatma Hatırlatması'
        : bildirimNo === 2
        ? '⚠️ Henüz Görev Başlatılmadı!'
        : '🚨 Acil: Görev Başlatılması Gerekiyor!'

      const body = bildirimNo < 3
        ? `İş başı yaptınız ancak ${gecenStr} geçti ve henüz görev başlatmadınız. Lütfen QR/NFC ile görev başlatın. (${bildirimNo}. hatırlatma)`
        : `İş başı yaptınız ancak ${gecenStr} geçti ve henüz görev başlatmadınız! Yöneticiniz bilgilendirildi. (${bildirimNo}. hatırlatma)`

      try {
        await sendFCMToUser(mesai.user_id, title, body, 'gorev_uyari')

        // 3. bildirimde TA'ya web bildirimi gönder
        if (bildirimNo >= 3) {
          const taIds = taMap.get(firma.id) ?? []
          for (const taId of taIds) {
            // bildirimler tablosuna kayıt ekle (web bildirim)
            await admin.from('bildirimler').insert({
              alici_id: taId,
              baslik: '🚨 Personel Görev Yapmıyor',
              mesaj: `${isim} iş başı yaptı (${gecenStr} önce) ancak henüz görev başlatmadı.`,
              tip: 'personel_takip',
              okundu: false,
            })
          }
        }

        // Mesai kaydında sayacı güncelle
        await admin.from('personel_mesai_kayitlari').update({
          bildirim_sayaci: bildirimNo,
          son_bildirim_tarihi: new Date().toISOString(),
        }).eq('id', mesai.id)

        toplam++
      } catch (e: any) {
        console.error(`[personel-takip] Bildirim hatası mesai=${mesai.id}:`, e.message)
      }
    }
  }

  return NextResponse.json({ ok: true, gonderilen: toplam })
}
