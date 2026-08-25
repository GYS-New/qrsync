/**
 * GET/POST /api/cron/sistem-kontrol
 *
 * 5 kritik sistem için "doğru çalışıyor mu?" anomali taraması.
 *
 * Her sistemde birden fazla semantik kontrol yapılır. "Çalışıyor mu" yerine
 * davranışın doğru olup olmadığı sorgulanır:
 *   - Arşiv erken/geç mi, yanlış durum mu taşındı?
 *   - Her cron kendi beklenen periyodunda çalıştı mı?
 *   - SIM imkansız zamanlarda kayıt üretti mi, anormal süreler var mı?
 *   - Personel destek vardiya sonlarında çalıştı mı, BEKLEMEDE biriktirdi mi?
 *   - Offline kayıtlarda zaman tutarsızlığı var mı?
 *
 * Durum:
 *   OK    — tüm kontroller geçti
 *   SORUN — en az bir anomali tespit edildi (mesajda detay)
 *   BILGI — anlamlı veri yok (örn sistem henüz kullanılmamış)
 *
 * Sonuç cron_log.tip='sistem_kontrol'; SORUN varsa audit_log'a ek kayıt.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { mergeVardiyaRows } from '@/lib/vardiya/getEffective'

export const dynamic = 'force-dynamic'

type Durum = 'OK' | 'SORUN' | 'BILGI'
type SorunDetayi = { kod: string; mesaj: string; adet?: number }
type SistemRaporu = {
  ad: string
  durum: Durum
  ozet: string
  sorunlar: SorunDetayi[]
  metrikler?: Record<string, any>
}

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }

async function handle(req: Request) {
  const cronToken = req.headers.get('x-cron-token')
  const envSecret = process.env.CRON_SECRET
  if (!cronToken || !envSecret || cronToken !== envSecret) {
    return NextResponse.json({ ok: false, error: 'cron auth required' }, { status: 401 })
  }

  const admin = createAdminClient()
  const nowMs = Date.now()
  const sistemler: SistemRaporu[] = []

  sistemler.push(await kontrolArsivleme(admin, nowMs))
  sistemler.push(await kontrolCronMotoru(admin, nowMs))
  sistemler.push(await kontrolSim(admin, nowMs))
  sistemler.push(await kontrolPersonelDestek(admin, nowMs))
  sistemler.push(await kontrolOfflineMod(admin, nowMs))
  sistemler.push(await kontrolVeriButunlugu(admin, nowMs))
  sistemler.push(await kontrolGorevUretimi(admin, nowMs))

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

  try {
    await admin.from('cron_log').insert({ tip: 'sistem_kontrol', sonuc: rapor as any })
  } catch (e) { console.error('[SISTEM-KONTROL] cron_log hata:', e) }

  if (toplamSorun > 0) {
    try {
      const { auditLog } = await import('@/lib/audit/log')
      await auditLog({
        tip: 'sistem_kontrol_sorun',
        tablo: 'cron_log',
        basarili: false,
        satir_sayisi: toplamSorun,
        detay: {
          sorunlu_sistemler: sistemler.filter(s => s.durum === 'SORUN').map(s => ({
            ad: s.ad,
            sorunlar: s.sorunlar,
          })),
        },
      })
    } catch (e) { console.error('[SISTEM-KONTROL] audit hata:', e) }
  }

  return NextResponse.json({ ok: true, ...rapor })
}

/** Yardımcı: bir liste sorundan worst durumu belirle + özet string */
function raporla(ad: string, sorunlar: SorunDetayi[], okOzet: string, metrikler?: any, bosVeriOzet?: string): SistemRaporu {
  if (sorunlar.length > 0) {
    return {
      ad,
      durum: 'SORUN',
      ozet: sorunlar.length === 1 ? sorunlar[0].mesaj : `${sorunlar.length} anomali: ${sorunlar.map(s => s.mesaj).join(' | ')}`,
      sorunlar,
      metrikler,
    }
  }
  if (bosVeriOzet) {
    return { ad, durum: 'BILGI', ozet: bosVeriOzet, sorunlar: [], metrikler }
  }
  return { ad, durum: 'OK', ozet: okOzet, sorunlar: [], metrikler }
}

/* ────────────────────────── ARŞİVLEME ────────────────────────── */

async function kontrolArsivleme(admin: any, nowMs: number): Promise<SistemRaporu> {
  const sorunlar: SorunDetayi[] = []
  const yirmidortSaatOnce = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
  // Arsiv cron her 6 saatte 1 calisir → bir gorev arsive tasinmadan once
  // durum_degisim_tarihi 24h + 6h period = 30h olabilir. 30h esigi race condition
  // engeller (sistem-kontrol arsiv cron ile ayni saatte calisiyor).
  const otuzSaatOnce = new Date(nowMs - 30 * 60 * 60 * 1000).toISOString()
  const yediSaatOnce = new Date(nowMs - 7 * 60 * 60 * 1000).toISOString()

  // Anomali 1: 30+ saatlik TAMAMLANDI/IPTAL canli_gorevler'de bekliyor (cron gercekten duraksamis)
  const { count: gecArsiv } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .in('durum', ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'IPTAL'])
    .lt('durum_degisim_tarihi', otuzSaatOnce)
  if ((gecArsiv ?? 0) > 0) {
    sorunlar.push({
      kod: 'ARSIV_GEC',
      mesaj: `${gecArsiv} görev 30+ saattir arşive taşınmamış (cron duraksamış)`,
      adet: gecArsiv ?? 0,
    })
  }

  // Bilgi metrigi: 24-30h arasi arsivlenmemis (normal cron dongusu bekliyor)
  const { count: bekleyenNormal } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .in('durum', ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'IPTAL'])
    .lt('durum_degisim_tarihi', yirmidortSaatOnce)
    .gte('durum_degisim_tarihi', otuzSaatOnce)

  // Anomali 2: ACIK/BEKLEMEDE/ISLEMDE durumlu arşive geçmiş (yanlış durum arşivlendi)
  const { count: acikArsiv } = await admin
    .from('canli_gorevler_arsiv')
    .select('id', { count: 'exact', head: true })
    .in('durum', ['ACIK', 'BEKLEMEDE', 'ISLEMDE', 'HAZIR'])
  if ((acikArsiv ?? 0) > 0) {
    sorunlar.push({
      kod: 'ARSIV_YANLIS_DURUM',
      mesaj: `${acikArsiv} kapalı olmayan görev arşive geçmiş (ACIK/BEKLEMEDE/ISLEMDE arşivde olmamalı)`,
      adet: acikArsiv ?? 0,
    })
  }

  // Anomali 3: Erken arşivleme — 24h dolmadan arşive gitmiş
  const { count: erkenArsiv } = await admin
    .from('canli_gorevler_arsiv')
    .select('id', { count: 'exact', head: true })
    .gt('durum_degisim_tarihi', yirmidortSaatOnce)
    .not('arsivleme_tarihi', 'is', null)
  if ((erkenArsiv ?? 0) > 0) {
    sorunlar.push({
      kod: 'ARSIV_ERKEN',
      mesaj: `${erkenArsiv} kayıt 24 saat dolmadan arşive taşınmış`,
      adet: erkenArsiv ?? 0,
    })
  }

  // Aktivite kontrolü: son 7 saatte arşive yeni kayıt (işleyen sistemin sinyali)
  const { count: sonArsivAkisi } = await admin
    .from('canli_gorevler_arsiv')
    .select('id', { count: 'exact', head: true })
    .gte('arsivleme_tarihi', yediSaatOnce)

  // Anomali 4: KOLON DRIFT — son 7 gunun arsivlenen kayitlarinda vardiya_gunu
  // NULL orani anormal yuksekse arsiv RPC yeni bir kolon eklenirken guncellenmemis
  // demektir. Bu pattern zaten 2 kez patladi (Mayis 11 + Agustos 24 fixleri).
  // Rapor Merkezi vardiya_gunu ile filtreliyor → NULL kayitlar sessizce kayboluyor.
  // Esik %5: normal operasyonda 0 olmali, kolon drift olunca %90+ ciker.
  const yediGunOnce = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { count: son7gToplamArsiv } = await admin
    .from('canli_gorevler_arsiv')
    .select('id', { count: 'exact', head: true })
    .gte('arsivleme_tarihi', yediGunOnce)
  const { count: son7gVardiyaNull } = await admin
    .from('canli_gorevler_arsiv')
    .select('id', { count: 'exact', head: true })
    .gte('arsivleme_tarihi', yediGunOnce)
    .is('vardiya_gunu', null)
  const nullOran = (son7gToplamArsiv ?? 0) > 0
    ? Math.round(((son7gVardiyaNull ?? 0) / (son7gToplamArsiv ?? 1)) * 100)
    : 0
  // Esik: 100+ kayit uzerinde %5 (kucuk sample'da yanlis alarm engellenir)
  if ((son7gToplamArsiv ?? 0) >= 100 && nullOran >= 5) {
    sorunlar.push({
      kod: 'ARSIV_VARDIYA_GUNU_DRIFT',
      mesaj: `Son 7 gun arsivlenen kayitlarin %${nullOran}'inde vardiya_gunu=NULL (${son7gVardiyaNull}/${son7gToplamArsiv}). Arsiv RPC kolon drift olabilir — raporlar bu kayitlari gostermez.`,
      adet: son7gVardiyaNull ?? 0,
    })
  }

  const metrikler = {
    gec_arsiv: gecArsiv ?? 0,
    bekleyen_normal_donguye: bekleyenNormal ?? 0,
    yanlis_durum: acikArsiv ?? 0,
    erken_arsiv: erkenArsiv ?? 0,
    son_7h_arsiv_akisi: sonArsivAkisi ?? 0,
    son_7g_toplam_arsiv: son7gToplamArsiv ?? 0,
    son_7g_vardiya_null: son7gVardiyaNull ?? 0,
    vardiya_null_yuzde: nullOran,
  }

  if (sorunlar.length > 0) return raporla('Arşivleme', sorunlar, '', metrikler)

  // Sorun yok — aktivite var mı?
  if ((sonArsivAkisi ?? 0) > 0) {
    return raporla('Arşivleme', [], `Son 7 saatte ${sonArsivAkisi} kayıt arşive sağlıklı şekilde taşındı`, metrikler)
  }
  return raporla('Arşivleme', [], '', metrikler, 'Arşive aktarılacak eski kayıt yok — doğal sessizlik')
}

/* ────────────────────────── CRON MOTORU ────────────────────────── */

async function kontrolCronMotoru(admin: any, nowMs: number): Promise<SistemRaporu> {
  const sorunlar: SorunDetayi[] = []
  const besDkOnce = new Date(nowMs - 5 * 60 * 1000).toISOString()
  const altiSaatYarim = new Date(nowMs - 6.5 * 60 * 60 * 1000).toISOString()
  const birGunOnce = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

  // Anomali 1: Simulasyon cron son 5 dk içinde çalışmadı (1 dk'da bir olmalı)
  const { data: sonSim } = await admin
    .from('cron_log')
    .select('tarih').eq('tip', 'simulasyon').gte('tarih', besDkOnce).limit(1)
  if (!sonSim || sonSim.length === 0) {
    sorunlar.push({
      kod: 'SIM_CRON_DURAKSADI',
      mesaj: 'Simülasyon cron son 5 dk içinde çalışmadı (beklenen: dakikada 1)',
    })
  }

  // Anomali 2: Arşivleme cron son 6.5 saatte çalışmadı (6 saatte bir olmalı)
  const { data: sonArsiv } = await admin
    .from('cron_log')
    .select('tarih').eq('tip', 'arsivleme').gte('tarih', altiSaatYarim).limit(1)
  if (!sonArsiv || sonArsiv.length === 0) {
    sorunlar.push({
      kod: 'ARSIV_CRON_DURAKSADI',
      mesaj: 'Arşiv cron 6+ saattir çalışmadı (beklenen: 6 saatte 1)',
    })
  }

  // Anomali 3: personel_destek cron son 24 saatte 3 kez çalışmalı (vardiya sonları)
  const { count: pdCount } = await admin
    .from('cron_log')
    .select('id', { count: 'exact', head: true })
    .eq('tip', 'personel_destek')
    .gte('tarih', birGunOnce)
  // Not: personel_destek log yazması için 'tamamlanan > 0' şartı var — zaten çalışıp
  // 0 tamamlasa da log yoktur. Bu anomali toleranslı: 0 kayıt = bilgi, normalde en
  // az 1 olmalı
  if ((pdCount ?? 0) === 0) {
    sorunlar.push({
      kod: 'PD_CRON_LOG_YOK',
      mesaj: 'Personel destek cron son 24 saatte hiç log atmadı (vardiya sonlarında çalışmamış olabilir)',
    })
  }

  // Aktivite
  const { data: sonHerhangi } = await admin
    .from('cron_log')
    .select('tip, tarih').order('tarih', { ascending: false }).limit(1)

  const metrikler = {
    son_sim: sonSim?.[0]?.tarih ?? null,
    son_arsiv: sonArsiv?.[0]?.tarih ?? null,
    personel_destek_24h: pdCount ?? 0,
    son_herhangi_log: sonHerhangi?.[0] ?? null,
  }

  if (sorunlar.length > 0) return raporla('Cron Motoru', sorunlar, '', metrikler)
  return raporla('Cron Motoru', [], 'Tüm cron türleri beklenen periyotlarda çalışıyor', metrikler)
}

/* ────────────────────────── SIM ────────────────────────── */

async function kontrolSim(admin: any, nowMs: number): Promise<SistemRaporu> {
  const sorunlar: SorunDetayi[] = []
  const birSaatOnce = new Date(nowMs - 60 * 60 * 1000).toISOString()
  const simdiIso = new Date(nowMs).toISOString()

  // Anomali 1: SIM gelecekteki aktif_olma_tarihi olan görevi tamamlamış (imkansız)
  const { count: gelecektenTamamlanan } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('simule_tamamlandi', true)
    .gt('aktif_olma_tarihi', simdiIso)
  if ((gelecektenTamamlanan ?? 0) > 0) {
    sorunlar.push({
      kod: 'SIM_GELECEKTE',
      mesaj: `SIM ${gelecektenTamamlanan} görevi henüz aktifleşmemişken tamamlamış (imkansız)`,
      adet: gelecektenTamamlanan ?? 0,
    })
  }

  // Anomali 2: SIM baslatilma > tamamlanma olan kayıt üretmiş (ters süre)
  const { data: tersSure } = await admin
    .from('canli_gorevler')
    .select('id, baslatilma_tarihi, tamamlanma_tarihi')
    .eq('simule_tamamlandi', true)
    .not('baslatilma_tarihi', 'is', null)
    .not('tamamlanma_tarihi', 'is', null)
    .gte('tamamlanma_tarihi', birSaatOnce)
    .limit(500)
  const tersSureAdet = (tersSure ?? []).filter((g: any) =>
    g.baslatilma_tarihi && g.tamamlanma_tarihi &&
    new Date(g.baslatilma_tarihi).getTime() > new Date(g.tamamlanma_tarihi).getTime()
  ).length
  if (tersSureAdet > 0) {
    sorunlar.push({
      kod: 'SIM_TERS_SURE',
      mesaj: `SIM ${tersSureAdet} kayıt üretmiş baslatilma > tamamlanma (mantık hatası)`,
      adet: tersSureAdet,
    })
  }

  // Anomali 3: Anormal tamamlanma süresi (< 10 sn veya > 6 saat = 21600 sn)
  const { count: anormalSure } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('simule_tamamlandi', true)
    .gte('tamamlanma_tarihi', birSaatOnce)
    .or('tamamlanma_suresi_saniye.lt.10,tamamlanma_suresi_saniye.gt.21600')
  if ((anormalSure ?? 0) > 0) {
    sorunlar.push({
      kod: 'SIM_ANORMAL_SURE',
      mesaj: `${anormalSure} SIM kaydı anormal tamamlanma süresinde (< 10sn veya > 6 saat)`,
      adet: anormalSure ?? 0,
    })
  }

  // Aktivite: son 1 saatte SIM tamamlanan
  const { count: sonSimTam } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('simule_tamamlandi', true)
    .gte('tamamlanma_tarihi', birSaatOnce)

  const metrikler = {
    gelecekten_tamamlanan: gelecektenTamamlanan ?? 0,
    ters_sure: tersSureAdet,
    anormal_sure: anormalSure ?? 0,
    son_1h_sim: sonSimTam ?? 0,
  }

  if (sorunlar.length > 0) return raporla('SIM', sorunlar, '', metrikler)

  if ((sonSimTam ?? 0) > 0) {
    return raporla('SIM', [], `Son 1 saatte ${sonSimTam} görev doğru değerlerle tamamlandı`, metrikler)
  }
  return raporla('SIM', [], '', metrikler, 'Son 1 saatte SIM aktivitesi yok — açık iş olmayabilir')
}

/* ────────────────────────── PERSONEL DESTEK ────────────────────────── */

async function kontrolPersonelDestek(admin: any, nowMs: number): Promise<SistemRaporu> {
  const sorunlar: SorunDetayi[] = []
  const birGunOnce = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

  // Anomali 1: 24+ saat önceki (bitmiş vardiya) BEKLEMEDE görevler hala açık
  const { count: eskiBeklemede } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('durum', 'BEKLEMEDE')
    .lt('aktif_olma_tarihi', birGunOnce)
  if ((eskiBeklemede ?? 0) > 50) {
    sorunlar.push({
      kod: 'PD_BEKLEMEDE_BIRIKME',
      mesaj: `${eskiBeklemede} görev bitmiş vardiyadan beri BEKLEMEDE (personel-destek kapatmamış)`,
      adet: eskiBeklemede ?? 0,
    })
  } else if ((eskiBeklemede ?? 0) > 0) {
    sorunlar.push({
      kod: 'PD_BEKLEMEDE_AZ',
      mesaj: `${eskiBeklemede} eski BEKLEMEDE görev var (kritik değil ama izlenmeli)`,
      adet: eskiBeklemede ?? 0,
    })
  }

  // Anomali 2: 24+ saat önceki ISLEMDE görevler (kimse tamamlamamış)
  const { count: eskiIslemde } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('durum', 'ISLEMDE')
    .lt('aktif_olma_tarihi', birGunOnce)
  if ((eskiIslemde ?? 0) > 20) {
    sorunlar.push({
      kod: 'PD_ISLEMDE_BIRIKME',
      mesaj: `${eskiIslemde} görev 24+ saattir ISLEMDE (başlatılıp unutulmuş)`,
      adet: eskiIslemde ?? 0,
    })
  }

  // Anomali 3: Aktif personel destek ayarı var ama son 24 saatte hiç çalıştırılmamış
  const { count: aktifAyar } = await admin
    .from('personel_gorev_destegi')
    .select('id', { count: 'exact', head: true })
    .eq('aktif', true)
  const { count: pdLogCount } = await admin
    .from('cron_log')
    .select('id', { count: 'exact', head: true })
    .eq('tip', 'personel_destek')
    .gte('tarih', birGunOnce)
  if ((aktifAyar ?? 0) > 0 && (pdLogCount ?? 0) === 0) {
    sorunlar.push({
      kod: 'PD_LOG_YOK',
      mesaj: `${aktifAyar} aktif ayar var ama 24 saatte hiç personel_destek log atılmadı`,
      adet: aktifAyar ?? 0,
    })
  }

  // Anomali 4: 24+ saatir cikis_saati NULL mesai kayitlari (mesai-cikis-hatirlatma
  // cron duraksadi VEYA otomatik kapama basarisiz oldu). Bu pattern eski
  // "personel is cikis unutmasi" sorununu goze cikarir. Normal isleyisde 30
  // dk sonra otomatik kapama yapilir, 24+ saat kalirsa cron ariza.
  const { count: acikMesaiEski } = await admin
    .from('personel_mesai_kayitlari')
    .select('id', { count: 'exact', head: true })
    .is('cikis_saati', null)
    .lt('giris_saati', birGunOnce)
    .eq('arsivlendi', false)
  if ((acikMesaiEski ?? 0) > 5) {
    sorunlar.push({
      kod: 'MESAI_ACIK_ESKI',
      mesaj: `${acikMesaiEski} personel mesai kaydi 24+ saatir acik (cikis_saati NULL) — cikis hatirlatma cron duraksamis olabilir`,
      adet: acikMesaiEski ?? 0,
    })
  } else if ((acikMesaiEski ?? 0) > 0) {
    sorunlar.push({
      kod: 'MESAI_ACIK_AZ',
      mesaj: `${acikMesaiEski} eski acik mesai var (izlenmeli)`,
      adet: acikMesaiEski ?? 0,
    })
  }

  const metrikler = {
    eski_beklemede: eskiBeklemede ?? 0,
    eski_islemde: eskiIslemde ?? 0,
    aktif_ayar: aktifAyar ?? 0,
    log_24h: pdLogCount ?? 0,
    acik_mesai_eski: acikMesaiEski ?? 0,
  }

  if (sorunlar.length > 0) return raporla('Personel Destek', sorunlar, '', metrikler)
  return raporla('Personel Destek', [], 'Eski BEKLEMEDE/ISLEMDE yok, cron loglu çalışıyor', metrikler)
}

/* ────────────────────────── VERİ BÜTÜNLÜĞÜ ────────────────────────── */

async function kontrolVeriButunlugu(admin: any, nowMs: number): Promise<SistemRaporu> {
  const sorunlar: SorunDetayi[] = []
  const birSaatOnce = new Date(nowMs - 60 * 60 * 1000).toISOString()

  // Anomali 1: Son 1 saatte kullanıcı-eylemi-ile-kapanmış kayıtlarda son_tamamlama_kanali NULL
  // (TAMAMLANDI, IPTAL, KAPATILDI kapanmış ama kanal yazılmamış)
  // NOT: ZAMANI_GECMIS ve ZAMANINDA_YAPILAMAYAN hariç — bunlar sistem kaynaklı
  //      geçişlerdir (BEKLEMEDE/HAZIR'da kalmış görevler için cron tarafından
  //      otomatik kapatılır). Kanal NULL doğal davranış.
  const { count: kanalEksikCanli } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .in('durum', ['TAMAMLANDI', 'IPTAL', 'KAPATILDI'])
    .is('son_tamamlama_kanali', null)
    .gte('durum_degisim_tarihi', birSaatOnce)
  if ((kanalEksikCanli ?? 0) > 0) {
    sorunlar.push({
      kod: 'KANAL_EKSIK_CANLI',
      mesaj: `${kanalEksikCanli} canli_gorev kaydı kullanıcı eylemi ile kapanmış ama son_tamamlama_kanali NULL (son 1 saat içinde)`,
      adet: kanalEksikCanli ?? 0,
    })
  }

  // Anomali 2: Aynı kontrol spesifik gorevler için
  const { count: kanalEksikSpes } = await admin
    .from('gorevler')
    .select('id', { count: 'exact', head: true })
    .in('durum', ['TAMAMLANDI', 'IPTAL', 'KAPATILDI'])
    .is('son_tamamlama_kanali', null)
    .gte('durum_degisim_tarihi', birSaatOnce)
  if ((kanalEksikSpes ?? 0) > 0) {
    sorunlar.push({
      kod: 'KANAL_EKSIK_SPES',
      mesaj: `${kanalEksikSpes} spesifik görev kaydı kullanıcı eylemi ile kapanmış ama son_tamamlama_kanali NULL`,
      adet: kanalEksikSpes ?? 0,
    })
  }

  // Anomali 3: gorev_kurallari'nda proje_id NULL — Sistem Ayarları > Görev Kuralları
  // sayfasının filtresi `.eq('proje_id', X)` ile NULL kayıtları dışlar, kuralar görüntülenmez.
  // Yeni POST endpoint'i lokasyondan fallback alıyor; eski kayıt birikmesi izlensin.
  const { count: kuralProjeNull } = await admin
    .from('gorev_kurallari')
    .select('id', { count: 'exact', head: true })
    .is('proje_id', null)
    .eq('aktif', true)
  if ((kuralProjeNull ?? 0) > 0) {
    sorunlar.push({
      kod: 'KURAL_PROJE_NULL',
      mesaj: `${kuralProjeNull} aktif gorev_kurallari kaydında proje_id=NULL (Sistem Ayarları > Görev Kuralları sayfası bunları gösteremez)`,
      adet: kuralProjeNull ?? 0,
    })
  }

  const metrikler = {
    kanal_eksik_canli: kanalEksikCanli ?? 0,
    kanal_eksik_spesifik: kanalEksikSpes ?? 0,
    kural_proje_null: kuralProjeNull ?? 0,
  }

  if (sorunlar.length > 0) return raporla('Veri Bütünlüğü', sorunlar, '', metrikler)
  return raporla('Veri Bütünlüğü', [], 'Son 1 saatte kapalı kayıtlar tutarlı (kanal dolu)', metrikler)
}

/* ────────────────────────── GÖREV ÜRETİMİ ────────────────────────── */

/**
 * Sabah 04:00 TRT sonrası gece üretiminin başarılı olup olmadığını kontrol eder.
 *
 * Dinamik eşik: bugün için "beklenen" görev sayısı = aktif kuralların bu güne
 * üretmesi gereken toplam (günlük: SUM(gunluk_frekans_sayisi), haftalık: kural
 * başına 1). Pasif projedeki kurallar hariç (gece_gorev_uret bunları atlıyor).
 *
 * SORUN şartı: gerçekleşen / beklenen < 0.75  (yani %25+ eksiklik)
 *
 * Saat 04:00 TRT öncesi → BILGI (üretim henüz tamamlanmamış olabilir).
 */
async function kontrolGorevUretimi(admin: any, nowMs: number): Promise<SistemRaporu> {
  const sorunlar: SorunDetayi[] = []

  const trNow = new Date(new Date(nowMs).toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }))
  const trSaat = trNow.getHours()
  const trDate = trNow.toISOString().slice(0, 10)
  const trDow = trNow.getDay()  // 0=Pazar, 1=Pzt, ..., 5=Cuma, 6=Cmt

  const metrikler: any = { tr_saat: trSaat, tr_tarih: trDate, tr_dow: trDow, firmalar: [] }

  // 04:00 TRT öncesi henüz erken — kontrol etme
  if (trSaat < 4) {
    return raporla('Görev Üretimi', [], '', metrikler, `Saat ${trSaat}:00 TRT — gece üretimi henüz tamamlanmamış olabilir, kontrol atlandı`)
  }

  const EKSIKLIK_ESIGI = 0.25  // %25 ve üzeri eksiklikte uyarı

  const { data: firmalar } = await admin
    .from('firmalar')
    .select('id, ticari_unvan, firma_adi')
    .eq('aktif', true)

  if (!firmalar || firmalar.length === 0) {
    return raporla('Görev Üretimi', [], 'Aktif firma yok', metrikler)
  }

  for (const f of firmalar as any[]) {
    const firmaAdi = f.firma_adi ?? f.ticari_unvan ?? 'Firma'

    // ═══════════════════════════════════════════════════════════════════════
    // ÖNCE cron audit log'undan bilgi al — beklenen sayı için tek doğru kaynak.
    // ---------------------------------------------------------------------
    // Neden: kural_duraklatmalari tablosu bir sonraki cron döngüsünde
    // temizleniyor (DELETE WHERE tarih < p_tarih), sistem-kontrol saat başı
    // çalıştığında bugünün duraklatmalarını tabloda göremiyor → beklenen'i
    // olduğundan yüksek hesaplıyor → yanlış "üretim eksik" uyarısı.
    //
    // Cron audit log'unda ise `duraklatilan` sayısı kalıcı. `uretilen +
    // atlanan + duraklatilan` = cron'un bugün işlediği toplam kural. Gerçek
    // beklenen = uretilen (cron ne ürettiyse gerçek de o olmalı).
    // ═══════════════════════════════════════════════════════════════════════
    const bir_gun_once = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
    const { data: cronAudit } = await admin
      .from('audit_log')
      .select('detay, basarili')
      .eq('tip', 'cron_gece_dongu')
      .gte('tarih', bir_gun_once)
      .order('tarih', { ascending: false })
      .limit(10)
    // Bugünün vardiya_gunu için çalışan cron kayıtlarını topla
    // (proje-bazlı 2 cron olabilir: Renault + Çanakkale)
    const bugunAudit = (cronAudit ?? []).filter((log: any) =>
      log.detay?.uretim?.tarih === trDate
    )
    let cronToplamUretilen = 0
    let cronToplamDuraklatilan = 0
    let cronToplamAtlanan = 0
    for (const log of bugunAudit) {
      cronToplamUretilen    += Number(log.detay?.uretim?.uretilen ?? 0)
      cronToplamDuraklatilan += Number(log.detay?.uretim?.duraklatilan ?? 0)
      cronToplamAtlanan     += Number(log.detay?.uretim?.atlanan ?? 0)
    }
    const cronCalisti = bugunAudit.length > 0

    // Bugün için aktif olan, projesi aktif (veya projesiz) kuralları çek
    // Kural sayısı sadece metrik için — beklenen hesabı cron audit'ten gelecek.
    const { data: kurallar } = await admin
      .from('gorev_kurallari')
      .select(`
        id, tanim, aktif_olma_saati, lokasyon_id, frekans_tipi, gunluk_frekans_sayisi, aktif_gunler,
        baslangic_tarihi, bitis_tarihi,
        lokasyonlar!inner ( proje_id, projeler ( aktif ) )
      `)
      .eq('firma_id', f.id)
      .eq('aktif', true)
      .lte('baslangic_tarihi', trDate)
      .or(`bitis_tarihi.is.null,bitis_tarihi.gte.${trDate}`)

    // Duraklatmalar — bugün için (tanim, ust_lokasyon_id, vardiya_no) tripletleri
    // Cron temizlemiş olabilir; bu yüzden bilgi eksik olabilir. Fallback için tutuluyor.
    const { data: duraklatmalar } = await admin
      .from('kural_duraklatmalari')
      .select('tanim, ust_lokasyon_id, vardiya_no')
      .eq('firma_id', f.id)
      .eq('tarih', trDate)
      .not('ust_lokasyon_id', 'is', null)
    const duraklatSet = new Set(
      (duraklatmalar ?? []).map((d: any) => `${d.tanim}::${d.ust_lokasyon_id}::${d.vardiya_no}`)
    )

    // Lokasyon hiyerarşisi — kural'ın üst lokasyonunu bulmak için
    const { data: tumLoks } = await admin
      .from('lokasyonlar').select('id, parent_id').eq('firma_id', f.id)
    const parentMap = new Map<string, string | null>(
      (tumLoks ?? []).map((l: any) => [l.id, l.parent_id])
    )
    function ustBul(lokId: string): string | null {
      let cur: string | null | undefined = lokId
      let safety = 0
      while (cur && parentMap.get(cur) && safety < 20) {
        cur = parentMap.get(cur) as string
        safety++
      }
      return cur ?? null
    }

    // Firma + proje vardiya ayarları — kuralın aktif_olma_saati'nden vardiya_no çıkar.
    // Proje override > firma fallback (mig 094). Çanakkale gibi farklı vardiyalı
    // projelerde, kural lokasyonunun projesine ait override kullanılır.
    const { data: firmaDetay } = await admin
      .from('firmalar')
      .select('vardiya_sayisi, tum_vardiya_ayarlari')
      .eq('id', f.id).single()
    const { data: firmaProjeler } = await admin
      .from('projeler')
      .select('id, vardiya_sayisi, tum_vardiya_ayarlari')
      .eq('firma_id', f.id)
    const firmaEv = mergeVardiyaRows(firmaDetay as any, null)
    const firmaAyar: any[] =
      (firmaEv.tum_vardiya_ayarlari ?? {})?.[String(firmaEv.vardiya_sayisi ?? 3)] ?? []
    const projeVardiyaMap = new Map<string, any[]>()
    for (const p of (firmaProjeler ?? []) as any[]) {
      const ev = mergeVardiyaRows(firmaDetay as any, p)
      const ayar = (ev.tum_vardiya_ayarlari ?? {})?.[String(ev.vardiya_sayisi ?? 3)] ?? []
      projeVardiyaMap.set(p.id, Array.isArray(ayar) ? ayar : [])
    }
    function vardiyaNoBul(saatStr: string, projeId: string | null): number | null {
      const ayarlar = (projeId && projeVardiyaMap.get(projeId)) || firmaAyar
      for (const v of ayarlar) {
        const bas = v.baslangic as string
        const bit = v.bitis as string
        if (!bas || !bit) continue
        const gece = bit <= bas
        const eslesme = gece ? (saatStr >= bas || saatStr < bit) : (saatStr >= bas && saatStr < bit)
        if (eslesme) return v.no as number
      }
      return null
    }

    // ─── Kural bazlı fallback hesaplama (cron audit yoksa devreye girer) ───
    // Beklenen: bugünün DOW'unda aktif + projesi aktif + DURAKLATILMAMIŞ
    let fallbackBeklenen = 0
    let aktifKural = 0
    let duraklatildiAdet = 0
    for (const k of (kurallar ?? []) as any[]) {
      const aktifGunler: number[] = k.aktif_gunler ?? []
      if (!aktifGunler.includes(trDow)) continue
      const projeAktif = k.lokasyonlar?.proje_id == null || k.lokasyonlar?.projeler?.aktif === true
      if (!projeAktif) continue

      const ustLok = k.lokasyon_id ? ustBul(k.lokasyon_id) : null
      const saatStr = String(k.aktif_olma_saati ?? '').slice(0, 5)
      const kuralProjeId: string | null = k.lokasyonlar?.proje_id ?? null
      const vNo = saatStr ? vardiyaNoBul(saatStr, kuralProjeId) : null
      if (ustLok && vNo !== null && duraklatSet.has(`${k.tanim}::${ustLok}::${vNo}`)) {
        duraklatildiAdet++
        continue
      }

      aktifKural++
      if (k.frekans_tipi === 'haftalik') {
        fallbackBeklenen += 1
      } else {
        fallbackBeklenen += k.gunluk_frekans_sayisi ?? 1
      }
    }

    // ─── KESIN BEKLENEN: cron audit önceliği ───
    // Cron çalıştıysa "uretilen" sayısı gerçek beklenen'dir (duraklatılan zaten
    // cron tarafından atlandı, hesap dışı). Cron çalışmadıysa fallback devreye girer.
    const beklenen = cronCalisti ? cronToplamUretilen : fallbackBeklenen

    if (beklenen === 0) {
      metrikler.firmalar.push({
        firma_id: f.id, ad: firmaAdi,
        durum: cronCalisti ? 'cron_uretim_yapmadi' : 'beklenen_uretim_yok',
        cron_calisti: cronCalisti,
        cron_duraklatilan: cronToplamDuraklatilan,
      })
      continue
    }

    // Gerçek üretim: bugün için canlı + arşiv — vardiya_gunu üzerinden
    // (sarkan V1 görevleri "bugün üretildi" sayılır)
    const [{ count: canliCount }, { count: arsivCount }] = await Promise.all([
      admin.from('canli_gorevler').select('id', { count: 'exact', head: true })
        .eq('firma_id', f.id)
        .eq('vardiya_gunu', trDate),
      admin.from('canli_gorevler_arsiv').select('id', { count: 'exact', head: true })
        .eq('firma_id', f.id)
        .eq('vardiya_gunu', trDate),
    ])

    const gercek = (canliCount ?? 0) + (arsivCount ?? 0)
    const eksiklikOrani = beklenen > 0 ? (1 - gercek / beklenen) : 0
    const eksiklikYuzde = Math.round(eksiklikOrani * 100)

    metrikler.firmalar.push({
      firma_id: f.id,
      ad: firmaAdi,
      aktif_kural: aktifKural,
      duraklatilmis_kural: duraklatildiAdet,
      cron_calisti: cronCalisti,
      cron_uretilen: cronToplamUretilen,
      cron_duraklatilan: cronToplamDuraklatilan,
      cron_atlanan: cronToplamAtlanan,
      beklenen,
      gercek,
      eksiklik_yuzde: eksiklikYuzde,
    })

    if (eksiklikOrani >= EKSIKLIK_ESIGI) {
      const eksik = beklenen - gercek
      const duraklatmaNotu = cronToplamDuraklatilan > 0
        ? ` (Cron ayrıca ${cronToplamDuraklatilan} kural bilinçli duraklatılmış olarak atladı.)`
        : ''
      sorunlar.push({
        kod: 'GOREV_URETIM_EKSIK',
        mesaj: `${firmaAdi}: bugün için ${gercek}/${beklenen} görev DB'de mevcut (%${eksiklikYuzde} eksik, ${eksik} kayıp).${duraklatmaNotu}`,
        adet: eksik,
      })

      try {
        const { sistemUyariBildir } = await import('@/lib/notify/sistemUyariBildir')
        await sistemUyariBildir({
          firmaId: f.id,
          kod: 'GOREV_URETIM_EKSIK',
          baslik: '🚨 Görev Üretimi Eksik',
          mesaj: `Bugün cron ${beklenen} görev ürettiğini raporladı ancak DB'de yalnızca ${gercek} kayıt var (%${eksiklikYuzde} eksik). Muhtemelen bir arşivleme/silme sorunu var. Sistem yöneticisi ile iletişime geçin.${duraklatmaNotu}`,
        })
      } catch (e) {
        console.error('[kontrolGorevUretimi] uyarı gönderme hatası:', e)
      }
    }
  }

  if (sorunlar.length > 0) return raporla('Görev Üretimi', sorunlar, '', metrikler)
  return raporla('Görev Üretimi', [], `Tüm aktif firmalar bugün için beklenenin %75+ üzerinde görev üretmiş`, metrikler)
}

/* ────────────────────────── OFFLINE MOD ────────────────────────── */

async function kontrolOfflineMod(admin: any, nowMs: number): Promise<SistemRaporu> {
  const sorunlar: SorunDetayi[] = []
  const yediGunOnce = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString()
  const yirmidortSaatOnce = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()
  const kirkSekizSaatOnce = new Date(nowMs - 48 * 60 * 60 * 1000).toISOString()
  const birSaatOnce = new Date(nowMs - 60 * 60 * 1000).toISOString()

  // ─── A) Veri Tutarlılığı ────────────────────────────────────────────────
  // Anomali 1: OFFLINE kanal kayıtlarında baslatilma > tamamlanma (ters süre)
  const { data: offlineKayitlar } = await admin
    .from('canli_gorevler')
    .select('id, baslatilma_tarihi, tamamlanma_tarihi, tamamlanma_suresi_saniye, mobil_kayit_id')
    .eq('son_tamamlama_kanali', 'OFFLINE')
    .gte('tamamlanma_tarihi', yediGunOnce)
    .limit(1000)
  const tersOffline = (offlineKayitlar ?? []).filter((g: any) =>
    g.baslatilma_tarihi && g.tamamlanma_tarihi &&
    new Date(g.baslatilma_tarihi).getTime() > new Date(g.tamamlanma_tarihi).getTime()
  ).length
  if (tersOffline > 0) {
    sorunlar.push({
      kod: 'OFFLINE_TERS_SURE',
      mesaj: `${tersOffline} OFFLINE kayıt baslatilma > tamamlanma (mobil zaman damgası hatalı)`,
      adet: tersOffline,
    })
  }

  // Anomali 2: Negatif süre
  const negatifSure = (offlineKayitlar ?? []).filter((g: any) =>
    g.tamamlanma_suresi_saniye !== null && g.tamamlanma_suresi_saniye < 0
  ).length
  if (negatifSure > 0) {
    sorunlar.push({
      kod: 'OFFLINE_NEGATIF_SURE',
      mesaj: `${negatifSure} OFFLINE kayıt negatif süre değerinde`,
      adet: negatifSure,
    })
  }

  // Anomali 3: OFFLINE kayıtta mobil_kayit_id EKSİK (idempotency korumasız)
  const kayitIdsiz = (offlineKayitlar ?? []).filter((g: any) => !g.mobil_kayit_id).length
  if (kayitIdsiz > 0) {
    sorunlar.push({
      kod: 'OFFLINE_KAYIT_ID_YOK',
      mesaj: `${kayitIdsiz} OFFLINE kayıt mobil_kayit_id olmadan yazılmış (idempotency koruması yok, duplike riski)`,
      adet: kayitIdsiz,
    })
  }

  // Anomali 4: mobil_kayit_id duplikasyonu (idempotency ihlali) — canlı + ekstra birleşik
  const idMap = new Map<string, number>()
  for (const g of (offlineKayitlar ?? []) as any[]) {
    if (g.mobil_kayit_id) idMap.set(g.mobil_kayit_id, (idMap.get(g.mobil_kayit_id) ?? 0) + 1)
  }
  const dupKayitId = [...idMap.values()].filter(n => n > 1).length
  if (dupKayitId > 0) {
    sorunlar.push({
      kod: 'OFFLINE_DUPLIKE_KAYIT_ID',
      mesaj: `${dupKayitId} mobil_kayit_id birden fazla kayda bağlanmış (unique index kaçağı)`,
      adet: dupKayitId,
    })
  }

  // Anomali 5: 48 saat sonrası tamamlanma süresi — TTL aşan kayıtlar
  // (offline TTL 48 saat + 1 saat pay, üstü şüpheli — ya cihaz saati yanlış ya bypass)
  const ttlAsan = (offlineKayitlar ?? []).filter((g: any) => {
    if (!g.baslatilma_tarihi || !g.tamamlanma_tarihi) return false
    const sure = new Date(g.tamamlanma_tarihi).getTime() - new Date(g.baslatilma_tarihi).getTime()
    return sure > 49 * 60 * 60 * 1000
  }).length
  if (ttlAsan > 0) {
    sorunlar.push({
      kod: 'OFFLINE_TTL_ASAN',
      mesaj: `${ttlAsan} OFFLINE kayıt 49+ saat boşlukla yazılmış (TTL kontrolü bypass edilmiş veya cihaz saati hatalı)`,
      adet: ttlAsan,
    })
  }

  // ─── B) Operasyonel Sinyaller ───────────────────────────────────────────
  // Anomali 6: Son 24 saatte offline-snapshot auth veya yetki regresyon sinyali
  // (audit_log'dan snapshot hatalarını sayabilirsek — şu an audit'e yazılmıyor, future work)

  // Anomali 7: Son 24 saatte PT-aktif kullanıcılar arasında snapshot BOŞ dönen var mı?
  // Proksi: OFFLINE kayıt gönderimi var ama device_tokens son_kullanim yakın (snapshot çalıştı varsayımı)
  // Bu tespit snapshot hatalarını TAM yakalayamaz — ama toplam ölçüm olarak:
  const { count: offlineSon24h } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('son_tamamlama_kanali', 'OFFLINE')
    .gte('tamamlanma_tarihi', yirmidortSaatOnce)

  // Anomali 8: Son 1 saatte OFFLINE kanal veri akışı (mobil aktif mi göstergesi)
  const { count: offlineSon1h } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('son_tamamlama_kanali', 'OFFLINE')
    .gte('tamamlanma_tarihi', birSaatOnce)

  // ─── C) Genel Sayım ─────────────────────────────────────────────────────
  const { count: toplamOffline } = await admin
    .from('canli_gorevler')
    .select('id', { count: 'exact', head: true })
    .eq('son_tamamlama_kanali', 'OFFLINE')
    .gte('tamamlanma_tarihi', yediGunOnce)

  const metrikler = {
    ters_sure: tersOffline,
    negatif_sure: negatifSure,
    kayit_idsiz: kayitIdsiz,
    duplike_kayit_id: dupKayitId,
    ttl_asan: ttlAsan,
    son_1h: offlineSon1h ?? 0,
    son_24h: offlineSon24h ?? 0,
    toplam_7g: toplamOffline ?? 0,
  }

  if (sorunlar.length > 0) return raporla('Offline Mod', sorunlar, '', metrikler)

  if ((toplamOffline ?? 0) > 0) {
    return raporla('Offline Mod', [], `Son 7 günde ${toplamOffline} offline kayıt tutarlı (son 24h: ${offlineSon24h ?? 0}, son 1h: ${offlineSon1h ?? 0})`, metrikler)
  }
  return raporla('Offline Mod', [], '', metrikler, 'Son 7 günde offline kayıt yok — mobil henüz aktif kullanmıyor')
}
