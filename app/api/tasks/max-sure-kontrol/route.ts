/**
 * POST /api/tasks/max-sure-kontrol
 *
 * Cron job: Her 5 dakikada bir çalışır.
 * ISLEMDE durumundaki görevleri iki açıdan kontrol eder:
 *  1) İptal eşiğine 10 dk kala uyarı FCM bildirimi gönderir (5 dk genişliğinde pencere
 *     — cron 5 dk interval olduğu için tam 1 tick yakalar, çakışma yok).
 *  2) Lokasyonun max_sure_dakika süresi dolmuş görevleri IPTAL yapar.
 *
 * Kontrol edilen tablolar:
 *  - gorevler       (SG - Spesifik Görevler)
 *  - canli_gorevler (FG - Frekansiyel Görevler) [isteğe bağlı - sureli_gorev_aktif kontrolüyle]
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { gorevDurumPayload } from '@/lib/gorev/durum-degistir'
import { sendFCMToUser } from '@/lib/fcm-sender'

// Uyarı penceresi: cron 5 dk'da çalışır, pencere genişliği 5 dk.
// Tek bir cron tick'i yakalar → çift bildirim olmaz, atlama olmaz.
const UYARI_PENCERE_BASLANGIC = 10  // dk: maxSure - 10'dan başlar
const UYARI_PENCERE_BITIS     = 5   // dk: maxSure - 5'te biter

const UYARI_TITLE = '⏰ Görev Süresi Bitiyor'
function uyariBody(lokasyonAdi: string): string {
  return `${lokasyonAdi || 'Lokasyon'} görevinizin tamamlanma süresi dolmak üzere. 10 dakika içinde tamamlamazsanız otomatik olarak iptal edilecektir.`
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('x-cron-token')
    const envToken = process.env.CRON_SECRET
    if (!envToken || !token || token !== envToken) {
      return NextResponse.json({ ok: false, error: 'Yetkisiz cron isteği' }, { status: 401 })
    }

    const admin = createAdminClient()
    const now = new Date()
    const results: { gorevler_iptal: number; canli_gorevler_iptal: number; uyari_gonderildi: number } = {
      gorevler_iptal: 0,
      canli_gorevler_iptal: 0,
      uyari_gonderildi: 0,
    }

    // FCM gönderimleri en sonda paralel toplanacak — cron'un ana işini bloklamasın
    type UyariCagri = { user_id: string; lokasyon_adi: string }
    const uyarilar: UyariCagri[] = []

    // ── 1. gorevler (Spesifik Görevler) ─────────────────────────────────────
    // ISLEMDE olan ve lokasyonun max_sure_dakika'sı dolu olan görevleri çek
    const { data: sgRows, error: sgErr } = await admin
      .from('gorevler')
      .select('id, baslatilma_tarihi, baslatan_kullanici_id, lokasyon_id, lokasyonlar(tanim, max_sure_dakika)')
      .eq('durum', 'ISLEMDE')
      .not('baslatilma_tarihi', 'is', null)

    if (sgErr) throw sgErr

    const sgIptalIds: string[] = []
    for (const row of (sgRows ?? []) as any[]) {
      const maxSure: number | null = row.lokasyonlar?.max_sure_dakika ?? null
      if (!maxSure || maxSure <= 0) continue
      const baslatilma = new Date(row.baslatilma_tarihi)
      const gecenDakika = (now.getTime() - baslatilma.getTime()) / 60000
      if (gecenDakika >= maxSure) {
        sgIptalIds.push(row.id)
      } else if (
        gecenDakika >= (maxSure - UYARI_PENCERE_BASLANGIC) &&
        gecenDakika <  (maxSure - UYARI_PENCERE_BITIS) &&
        row.baslatan_kullanici_id
      ) {
        uyarilar.push({
          user_id: row.baslatan_kullanici_id,
          lokasyon_adi: row.lokasyonlar?.tanim ?? '',
        })
      }
    }

    if (sgIptalIds.length > 0) {
      const { error: updErr } = await admin
        .from('gorevler')
        .update(gorevDurumPayload('IPTAL', 'MOBIL', {
          at: now.toISOString(),
          iptal_sebep: 'Otomatik iptal — max süre aşıldı',
        }) as any)
        .in('id', sgIptalIds)
      if (updErr) throw updErr
      results.gorevler_iptal = sgIptalIds.length
    }

    // ── 2. canli_gorevler (Frekansiyel Görevler) ────────────────────────────
    // Sadece sureli_gorev_aktif=true lokasyonlarda ISLEMDE olanları kontrol et
    const { data: fgRows, error: fgErr } = await admin
      .from('canli_gorevler')
      .select('id, baslatilma_tarihi, baslatan_kullanici_id, lokasyon_id, lokasyonlar(tanim, max_sure_dakika, sureli_gorev_aktif)')
      .eq('durum', 'ISLEMDE')
      .not('baslatilma_tarihi', 'is', null)

    if (fgErr) throw fgErr

    const fgIptalIds: string[] = []
    for (const row of (fgRows ?? []) as any[]) {
      const lok = row.lokasyonlar ?? {}
      if (!lok.sureli_gorev_aktif) continue
      const maxSure: number | null = lok.max_sure_dakika ?? null
      if (!maxSure || maxSure <= 0) continue
      const baslatilma = new Date(row.baslatilma_tarihi)
      const gecenDakika = (now.getTime() - baslatilma.getTime()) / 60000
      if (gecenDakika >= maxSure) {
        fgIptalIds.push(row.id)
      } else if (
        gecenDakika >= (maxSure - UYARI_PENCERE_BASLANGIC) &&
        gecenDakika <  (maxSure - UYARI_PENCERE_BITIS) &&
        row.baslatan_kullanici_id
      ) {
        uyarilar.push({
          user_id: row.baslatan_kullanici_id,
          lokasyon_adi: lok.tanim ?? '',
        })
      }
    }

    if (fgIptalIds.length > 0) {
      const { error: updErr2 } = await admin
        .from('canli_gorevler')
        .update(gorevDurumPayload('IPTAL', 'MOBIL', {
          at: now.toISOString(),
          iptal_sebep: 'Otomatik iptal — max süre aşıldı',
        }) as any)
        .in('id', fgIptalIds)
      if (updErr2) throw updErr2
      results.canli_gorevler_iptal = fgIptalIds.length
    }

    // ── 3. 10 dk uyarı bildirimleri ─────────────────────────────────────────
    // Aynı kullanıcıya birden fazla görev için tek FCM göndermeye gerek yok —
    // ama mesajda lokasyon adı var, ayrı ayrı göndermek daha bilgilendirici.
    // Yine de aynı user+lokasyon kombinasyonu için tekrarı engelle.
    const gonderilenler = new Set<string>()
    for (const u of uyarilar) {
      const key = `${u.user_id}|${u.lokasyon_adi}`
      if (gonderilenler.has(key)) continue
      gonderilenler.add(key)
      try {
        await sendFCMToUser(u.user_id, UYARI_TITLE, uyariBody(u.lokasyon_adi), 'gorev_uyari')
        results.uyari_gonderildi++
      } catch (e) {
        console.error('[max-sure-kontrol] uyarı FCM hatası', e)
      }
    }

    console.log('[MAX-SURE-KONTROL]', now.toISOString(), results)

    // Cron audit — sadece bir şey olduysa
    const toplam = (results.gorevler_iptal ?? 0) + (results.canli_gorevler_iptal ?? 0) + (results.uyari_gonderildi ?? 0)
    if (toplam > 0) {
      const { auditLog } = await import('@/lib/audit/log')
      await auditLog({
        tip: 'cron_max_sure', tablo: 'canli_gorevler',
        satir_sayisi: toplam, detay: results,
      })
    }

    return NextResponse.json({ ok: true, ...results })
  } catch (err: any) {
    console.error('[max-sure-kontrol]', err)
    try {
      const { auditLog } = await import('@/lib/audit/log')
      await auditLog({
        tip: 'cron_max_sure', tablo: 'canli_gorevler', basarili: false, hata_mesaji: err?.message ?? 'hata',
      })
    } catch {}
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
