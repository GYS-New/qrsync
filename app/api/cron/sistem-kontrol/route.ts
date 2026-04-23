/**
 * GET/POST /api/cron/sistem-kontrol
 *
 * 5 kritik sistem için "davranışı doğal mı?" taraması:
 *   1. Arşivleme       — canli_gorevler_arsiv'e kayıt akışı
 *   2. Cron Motoru     — simulasyon + diğer cron'lar çalışıyor mu
 *   3. SIM             — simule_tamamlandi kayıtları üretiyor mu
 *   4. Personel Destek — bitmiş vardiyada BEKLEMEDE birikmesi var mı
 *   5. Offline Mod     — endpoint'ler mevcut, OFFLINE kanal kaydı trendi
 *
 * Her sistem için durum:
 *   'OK'       — doğal çalışıyor
 *   'SORUN'    — doğal olmayan bir davranış tespit edildi (açıklama ile)
 *   'BILGI'    — ne OK ne SORUN (örn iş yok, hareket beklenmiyor)
 *
 * Cron veya manuel çağrı: saat başı `lib/cron/job.js` tetikler.
 * Sonuç cron_log tablosuna `tip: 'sistem_kontrol'` ile yazılır; kullanıcı
 * loglar sayfasından görür. Sadece SORUN varsa audit_log'a da ek kayıt.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Durum = 'OK' | 'SORUN' | 'BILGI'
type SistemRaporu = {
  ad: string
  durum: Durum
  mesaj: string
  metrikler?: Record<string, any>
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}

async function handle(req: Request) {
  // Cron auth: manuel erişim için header yok ise reddet (sadece cron-token veya auth user)
  const cronToken = req.headers.get('x-cron-token')
  const envSecret = process.env.CRON_SECRET
  const isCron = cronToken && envSecret && cronToken === envSecret

  // Cron değilse user auth kontrolü — tarayıcı çağrısı için super_admin gerekli
  if (!isCron) {
    // Audit için basitlik: production'da role check eklenebilir. Şimdilik cron-only.
    return NextResponse.json({ ok: false, error: 'cron auth required' }, { status: 401 })
  }

  const admin = createAdminClient()
  const nowMs = Date.now()
  const sistemler: SistemRaporu[] = []

  // ── 1. Arşivleme ─────────────────────────────────────────────────────────
  sistemler.push(await kontrolArsivleme(admin, nowMs))

  // ── 2. Cron Motoru ───────────────────────────────────────────────────────
  sistemler.push(await kontrolCronMotoru(admin, nowMs))

  // ── 3. SIM ───────────────────────────────────────────────────────────────
  sistemler.push(await kontrolSim(admin, nowMs))

  // ── 4. Personel Destek ───────────────────────────────────────────────────
  sistemler.push(await kontrolPersonelDestek(admin, nowMs))

  // ── 5. Offline Mod ───────────────────────────────────────────────────────
  sistemler.push(await kontrolOfflineMod(admin, nowMs))

  const toplamSorun = sistemler.filter(s => s.durum === 'SORUN').length
  const toplamOk = sistemler.filter(s => s.durum === 'OK').length
  const toplamBilgi = sistemler.filter(s => s.durum === 'BILGI').length

  const rapor = {
    calisma_zamani: new Date().toISOString(),
    toplam_sistem: sistemler.length,
    toplam_ok: toplamOk,
    toplam_sorun: toplamSorun,
    toplam_bilgi: toplamBilgi,
    sistemler,
  }

  // cron_log'a yaz
  try {
    await admin.from('cron_log').insert({
      tip: 'sistem_kontrol',
      sonuc: rapor as any,
    })
  } catch (e) {
    console.error('[SISTEM-KONTROL] cron_log yazım hata:', e)
  }

  // Sorun varsa audit_log'a ek kayıt
  if (toplamSorun > 0) {
    try {
      const { auditLog } = await import('@/lib/audit/log')
      await auditLog({
        tip: 'sistem_kontrol_sorun',
        tablo: 'cron_log',
        basarili: false,
        satir_sayisi: toplamSorun,
        detay: {
          sorunlu_sistemler: sistemler.filter(s => s.durum === 'SORUN').map(s => ({ ad: s.ad, mesaj: s.mesaj })),
        },
      })
    } catch (e) {
      console.error('[SISTEM-KONTROL] audit_log yazım hata:', e)
    }
  }

  return NextResponse.json({ ok: true, ...rapor })
}

/* ────────────────────────── KONTROL FONKSİYONLARI ────────────────────────── */

async function kontrolArsivleme(admin: any, nowMs: number): Promise<SistemRaporu> {
  const yediSaatOnce = new Date(nowMs - 7 * 60 * 60 * 1000).toISOString()
  const yirmiDortSaatOnce = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

  // Son 7 saatte arşive yeni kayıt geldi mi?
  const { count: sonArsiv } = await admin
    .from('canli_gorevler_arsiv')
    .select('id', { count: 'exact', head: true })
    .gte('arsivleme_tarihi', yediSaatOnce)

  // canli_gorevler'de 24+ saatlik TAMAMLANDI/IPTAL var mı (arşive gitmemiş)?
  const { count: arsivBekleyen } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .in('durum', ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'IPTAL'])
    .lt('durum_degisim_tarihi', yirmiDortSaatOnce)

  if ((arsivBekleyen ?? 0) > 0) {
    return {
      ad: 'Arşivleme',
      durum: 'SORUN',
      mesaj: `${arsivBekleyen} görev 24+ saattir arşive taşınmamış (cron duraksamış olabilir)`,
      metrikler: { son_7h_arsiv: sonArsiv ?? 0, arsive_bekleyen: arsivBekleyen },
    }
  }
  if ((sonArsiv ?? 0) > 0) {
    return {
      ad: 'Arşivleme',
      durum: 'OK',
      mesaj: `Son 7 saatte ${sonArsiv} kayıt arşive taşındı — doğal`,
      metrikler: { son_7h_arsiv: sonArsiv, arsive_bekleyen: 0 },
    }
  }
  return {
    ad: 'Arşivleme',
    durum: 'BILGI',
    mesaj: 'Arşive aktarılacak eski kayıt yok',
    metrikler: { son_7h_arsiv: 0, arsive_bekleyen: 0 },
  }
}

async function kontrolCronMotoru(admin: any, nowMs: number): Promise<SistemRaporu> {
  const onDkOnce = new Date(nowMs - 10 * 60 * 1000).toISOString()
  const otuzDkOnce = new Date(nowMs - 30 * 60 * 1000).toISOString()

  // Son 10 dk'da simulasyon log var mı? (1 dk'da bir çalışır)
  const { data: sonSim } = await admin
    .from('cron_log')
    .select('tarih, tip')
    .eq('tip', 'simulasyon')
    .gte('tarih', onDkOnce)
    .limit(1)

  if (sonSim && sonSim.length > 0) {
    return {
      ad: 'Cron Motoru',
      durum: 'OK',
      mesaj: 'Simülasyon cron son 10 dk içinde çalıştı — motor ayakta',
      metrikler: { son_sim_log: sonSim[0].tarih },
    }
  }

  // 10 dk'da simulasyon yoksa: son 30 dk içinde herhangi cron log?
  const { data: herhangiCron } = await admin
    .from('cron_log')
    .select('tarih, tip')
    .gte('tarih', otuzDkOnce)
    .order('tarih', { ascending: false })
    .limit(1)

  if (herhangiCron && herhangiCron.length > 0) {
    return {
      ad: 'Cron Motoru',
      durum: 'SORUN',
      mesaj: `Simülasyon cron 10+ dk logsuz; son cron log: ${herhangiCron[0].tip} (tarih: ${herhangiCron[0].tarih})`,
      metrikler: { son_sim_log: null, son_cron_log: herhangiCron[0].tarih, son_cron_tip: herhangiCron[0].tip },
    }
  }

  return {
    ad: 'Cron Motoru',
    durum: 'SORUN',
    mesaj: 'Cron motoru 30+ dk hiç log yazmadı — Railway server duraksamış olabilir',
    metrikler: { son_cron_log: null },
  }
}

async function kontrolSim(admin: any, nowMs: number): Promise<SistemRaporu> {
  const birSaatOnce = new Date(nowMs - 60 * 60 * 1000).toISOString()
  const bugunTrBaslangic = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
  const bugunBasUTC = new Date(bugunTrBaslangic + 'T00:00:00+03:00').toISOString()
  const bugunBitisUTC = new Date(bugunTrBaslangic + 'T23:59:59+03:00').toISOString()

  // Son 1 saatte SIM tamamlanan?
  const { count: sonSimTamamlanan } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('simule_tamamlandi', true)
    .gte('tamamlanma_tarihi', birSaatOnce)

  if ((sonSimTamamlanan ?? 0) > 0) {
    return {
      ad: 'SIM',
      durum: 'OK',
      mesaj: `Son 1 saatte ${sonSimTamamlanan} görev simülasyon tarafından tamamlandı — doğal`,
      metrikler: { son_1h_sim: sonSimTamamlanan },
    }
  }

  // SIM tamamlamadı — bugün açık görev var mı?
  const { count: bugunAcik } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .in('durum', ['ACIK', 'ISLEMDE'])
    .gte('aktif_olma_tarihi', bugunBasUTC)
    .lte('aktif_olma_tarihi', bugunBitisUTC)

  if ((bugunAcik ?? 0) > 50) {
    return {
      ad: 'SIM',
      durum: 'SORUN',
      mesaj: `1 saattir SIM tamamlaması yok ama bugün ${bugunAcik} açık görev var (beklenen SIM aktivitesi yok)`,
      metrikler: { son_1h_sim: 0, bugun_acik_gorev: bugunAcik },
    }
  }

  return {
    ad: 'SIM',
    durum: 'BILGI',
    mesaj: `Son 1 saatte SIM tamamlaması yok, bugün ${bugunAcik ?? 0} açık görev var (normal — SIM kendi hızında çalışır)`,
    metrikler: { son_1h_sim: 0, bugun_acik_gorev: bugunAcik ?? 0 },
  }
}

async function kontrolPersonelDestek(admin: any, nowMs: number): Promise<SistemRaporu> {
  const yirmidortSaatOnce = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

  // Son 24 saatte BEKLEMEDE birikmesi (bu aktif değil ama eski)
  const { count: eskiBeklemede } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('durum', 'BEKLEMEDE')
    .lt('aktif_olma_tarihi', yirmidortSaatOnce)

  if ((eskiBeklemede ?? 0) > 50) {
    return {
      ad: 'Personel Destek',
      durum: 'SORUN',
      mesaj: `${eskiBeklemede} görev 24+ saattir BEKLEMEDE (vardiya bitti, kapatılmamış)`,
      metrikler: { eski_beklemede: eskiBeklemede },
    }
  }

  if ((eskiBeklemede ?? 0) > 0) {
    return {
      ad: 'Personel Destek',
      durum: 'OK',
      mesaj: `${eskiBeklemede} eski BEKLEMEDE görev var (makul, 50 altı)`,
      metrikler: { eski_beklemede: eskiBeklemede },
    }
  }

  return {
    ad: 'Personel Destek',
    durum: 'OK',
    mesaj: 'Eski BEKLEMEDE görev yok — bitmiş vardiyalar düzgün kapanmış',
    metrikler: { eski_beklemede: 0 },
  }
}

async function kontrolOfflineMod(admin: any, nowMs: number): Promise<SistemRaporu> {
  const yediGunOnce = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Son 7 günde OFFLINE kanalıyla gelen sync kaydı
  const { count: sonOfflineKayit } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('son_tamamlama_kanali', 'OFFLINE')
    .gte('tamamlanma_tarihi', yediGunOnce)

  // Endpoint kontrolü: sadece offline-snapshot + offline-sync var mı diye cron_log'dan
  // veya audit_log üzerinden yakın zamanda sistem hatası oldu mu? Şimdilik trend:
  if ((sonOfflineKayit ?? 0) === 0) {
    return {
      ad: 'Offline Mod',
      durum: 'BILGI',
      mesaj: 'Son 7 günde offline senkron edilen kayıt yok (mobil henüz aktif kullanmıyor)',
      metrikler: { son_7g_offline: 0 },
    }
  }

  return {
    ad: 'Offline Mod',
    durum: 'OK',
    mesaj: `Son 7 günde ${sonOfflineKayit} offline kayıt başarıyla senkron edildi — doğal`,
    metrikler: { son_7g_offline: sonOfflineKayit },
  }
}
