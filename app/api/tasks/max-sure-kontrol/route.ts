/**
 * POST /api/tasks/max-sure-kontrol
 *
 * Cron job: Her 5 dakikada bir çalışır.
 * ISLEMDE durumundaki görevleri iki açıdan kontrol eder:
 *  1) Süre dolmaya 10 dk kala uyarı FCM bildirimi gönderir (5 dk genişliğinde
 *     pencere — cron 5 dk interval olduğu için tam 1 tick yakalar, çakışma yok).
 *  2) Lokasyonun max_sure_dakika süresi dolmuş görevleri TAMAMLANDI yapar
 *     (önceki davranış IPTAL idi — 2026-05-07 itibariyle "otomatik tamamla"
 *     olarak değiştirildi: max süre dolmuş görevler kayıp sayılmaz, sistem
 *     tarafından tamamlanmış işaretlenir).
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
  return `${lokasyonAdi || 'Lokasyon'} görevinizin süresi dolmak üzere. 10 dakika içinde işlem yapmazsanız sistem otomatik tamamlanmış olarak işaretleyecektir.`
}

type OtomatikTamamla = { id: string; baslatilma_tarihi: string; baslatan_kullanici_id: string | null }

/**
 * Süresi dolmuş görevleri TAMAMLANDI'ya çevirir.
 * Per-row update gerekir çünkü her görevin tamamlanma_suresi_saniye'si farklı.
 */
async function otomatikTamamla(
  admin: any,
  tablo: 'gorevler' | 'canli_gorevler',
  list: OtomatikTamamla[],
  now: Date,
): Promise<number> {
  let basarili = 0
  for (const item of list) {
    const elapsedSec = Math.max(0, Math.floor((now.getTime() - new Date(item.baslatilma_tarihi).getTime()) / 1000))
    const payload = gorevDurumPayload('TAMAMLANDI', 'MOBIL', {
      at: now.toISOString(),
      ek: {
        tamamlanma_tarihi: now.toISOString(),
        tamamlanma_suresi_saniye: elapsedSec,
        ...(item.baslatan_kullanici_id ? {
          tamamlayan_kullanici_id: item.baslatan_kullanici_id,
          islemi_yapan_id: item.baslatan_kullanici_id,
        } : {}),
      },
    })
    const { error } = await admin.from(tablo).update(payload).eq('id', item.id)
    if (!error) basarili++
    else console.error(`[max-sure-kontrol] ${tablo} oto-tamamla hatası id=${item.id}`, error)
  }
  return basarili
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
    const results = {
      gorevler_otomatik_tamamla: 0,
      canli_gorevler_otomatik_tamamla: 0,
      uyari_gonderildi: 0,
    }

    type UyariCagri = { user_id: string; lokasyon_adi: string }
    const uyarilar: UyariCagri[] = []

    // ── 1. gorevler (Spesifik Görevler) ─────────────────────────────────────
    const { data: sgRows, error: sgErr } = await admin
      .from('gorevler')
      .select('id, baslatilma_tarihi, baslatan_kullanici_id, lokasyon_id, lokasyonlar(tanim, max_sure_dakika)')
      .eq('durum', 'ISLEMDE')
      .not('baslatilma_tarihi', 'is', null)

    if (sgErr) throw sgErr

    const sgTamamla: OtomatikTamamla[] = []
    for (const row of (sgRows ?? []) as any[]) {
      const maxSure: number | null = row.lokasyonlar?.max_sure_dakika ?? null
      if (!maxSure || maxSure <= 0) continue
      const baslatilma = new Date(row.baslatilma_tarihi)
      const gecenDakika = (now.getTime() - baslatilma.getTime()) / 60000
      if (gecenDakika >= maxSure) {
        sgTamamla.push({
          id: row.id,
          baslatilma_tarihi: row.baslatilma_tarihi,
          baslatan_kullanici_id: row.baslatan_kullanici_id ?? null,
        })
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

    if (sgTamamla.length > 0) {
      results.gorevler_otomatik_tamamla = await otomatikTamamla(admin, 'gorevler', sgTamamla, now)
    }

    // ── 2. canli_gorevler (Frekansiyel Görevler) ────────────────────────────
    const { data: fgRows, error: fgErr } = await admin
      .from('canli_gorevler')
      .select('id, baslatilma_tarihi, baslatan_kullanici_id, lokasyon_id, lokasyonlar(tanim, max_sure_dakika, sureli_gorev_aktif)')
      .eq('durum', 'ISLEMDE')
      .not('baslatilma_tarihi', 'is', null)

    if (fgErr) throw fgErr

    const fgTamamla: OtomatikTamamla[] = []
    for (const row of (fgRows ?? []) as any[]) {
      const lok = row.lokasyonlar ?? {}
      if (!lok.sureli_gorev_aktif) continue
      const maxSure: number | null = lok.max_sure_dakika ?? null
      if (!maxSure || maxSure <= 0) continue
      const baslatilma = new Date(row.baslatilma_tarihi)
      const gecenDakika = (now.getTime() - baslatilma.getTime()) / 60000
      if (gecenDakika >= maxSure) {
        fgTamamla.push({
          id: row.id,
          baslatilma_tarihi: row.baslatilma_tarihi,
          baslatan_kullanici_id: row.baslatan_kullanici_id ?? null,
        })
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

    if (fgTamamla.length > 0) {
      results.canli_gorevler_otomatik_tamamla = await otomatikTamamla(admin, 'canli_gorevler', fgTamamla, now)
    }

    // ── 3. 10 dk uyarı bildirimleri ─────────────────────────────────────────
    // Aynı user+lokasyon kombinasyonu için tek FCM
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
    const toplam = results.gorevler_otomatik_tamamla + results.canli_gorevler_otomatik_tamamla + results.uyari_gonderildi
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
