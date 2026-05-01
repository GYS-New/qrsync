/**
 * GET/POST /api/cron/guvenlik-mail
 *
 * Bildirilmemiş kritik/yüksek seviyeli sistem alert'lerini email ile gönderir.
 *
 * Akış:
 *  1) sistem_alerts tablosundan bildirim_tarihi IS NULL ve seviye IN ('kritik','yuksek')
 *     olan kayıtları al (son 24 saat ile sınırlı, eski olanlar zamanı geçmiş)
 *  2) Son 1 saatte yaşanan güvenlik audit_log olaylarını da topla
 *     (cihaz_eslesmis_eval_block vb.)
 *  3) Bir özet email hazırla, sistem_konfigurasyon.guvenlik_email'e gönder
 *  4) Bildirilen alert'lerin bildirim_tarihi'ni şu ana güncelle (re-send önle)
 *
 * Güvenlik:
 *  - x-cron-token header zorunlu
 *  - GUVENLIK_MAIL_AKTIF env flag false ise erken dönüş (kapama swith'i)
 *  - Email gönderim hatası cron'u kırmaz, audit_log'a yazılır
 *
 * Schedule: 30 dakikada bir (lib/cron/job.js)
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getSistemKonfig } from '@/lib/config/getSistemKonfig'
import { sendMail } from '@/lib/email'
import { auditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ALERT_PENCERE_SAAT = 24
const AUDIT_PENCERE_SAAT = 1

// Güvenlik kategorisindeki audit_log tipleri (saldırı şüphesi göstergeleri)
const GUVENLIK_AUDIT_TIPLERI = [
  'cihaz_eslesmis_eval_block',  // Eşleşmiş cihaz müşteri değerlendirmesi denedi
  'login_basarisiz',             // Başarısız giriş denemesi
  'yetki_reddedildi',            // Yetkisiz erişim denemesi
]

export async function GET(req: Request) { return handle(req) }
export async function POST(req: Request) { return handle(req) }

async function handle(req: Request) {
  // Cron auth
  const cronToken = req.headers.get('x-cron-token')
  const envSecret = process.env.CRON_SECRET
  if (!cronToken || !envSecret || cronToken !== envSecret) {
    return NextResponse.json({ ok: false, error: 'cron auth required' }, { status: 401 })
  }

  // Kapama anahtarı: GUVENLIK_MAIL_AKTIF=false ise hemen çık
  if (process.env.GUVENLIK_MAIL_AKTIF === 'false') {
    return NextResponse.json({ ok: true, skipped: 'GUVENLIK_MAIL_AKTIF=false' })
  }

  const admin = createAdminClient()
  const now = new Date()

  // 1) Bildirilmemiş kritik/yüksek alert'ler
  const alertPencereIso = new Date(now.getTime() - ALERT_PENCERE_SAAT * 60 * 60 * 1000).toISOString()
  const { data: alerts } = await admin
    .from('sistem_alerts')
    .select('id,tarih,seviye,baslik,mesaj,kaynak,detay')
    .is('bildirim_tarihi', null)
    .in('seviye', ['kritik', 'yuksek'])
    .gte('tarih', alertPencereIso)
    .order('tarih', { ascending: false })
    .limit(50)

  // 2) Son 1 saatteki güvenlik audit_log olayları (sayılır olarak)
  const auditPencereIso = new Date(now.getTime() - AUDIT_PENCERE_SAAT * 60 * 60 * 1000).toISOString()
  const { data: auditOlaylar } = await admin
    .from('audit_log')
    .select('tip,tarih,detay,firma_id')
    .in('tip', GUVENLIK_AUDIT_TIPLERI)
    .gte('tarih', auditPencereIso)
    .order('tarih', { ascending: false })
    .limit(50)

  const alertSay = alerts?.length ?? 0
  const auditSay = auditOlaylar?.length ?? 0

  // İçerik yoksa: sessizce çık (mail spam'ı önle)
  if (alertSay === 0 && auditSay === 0) {
    return NextResponse.json({ ok: true, gonderildi: false, sebep: 'icerik_yok' })
  }

  // 3) Email içeriği hazırla
  const konfig = await getSistemKonfig()
  const aliciEmail = (konfig.guvenlik_email ?? '').trim()
  if (!aliciEmail) {
    return NextResponse.json({ ok: true, gonderildi: false, sebep: 'alici_email_bos' })
  }

  const trDate = (iso: string) => new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })

  const alertBolum = alertSay > 0 ? `
SİSTEM ALERT'LERİ (son ${ALERT_PENCERE_SAAT} saat, ${alertSay} kayıt):
${(alerts ?? []).map((a: any) => {
  const sev = String(a.seviye).toUpperCase()
  return `  • [${sev}] ${trDate(a.tarih)} — ${a.baslik}\n    ${a.mesaj}${a.kaynak ? `\n    kaynak: ${a.kaynak}` : ''}`
}).join('\n')}
` : ''

  // Audit olay türlerine göre grupla
  const auditGruplari = (auditOlaylar ?? []).reduce<Record<string, number>>((acc, o: any) => {
    acc[o.tip] = (acc[o.tip] ?? 0) + 1
    return acc
  }, {})

  const auditOzetSatirlari = Object.entries(auditGruplari).map(([tip, sayi]) => {
    const aciklama = tip === 'cihaz_eslesmis_eval_block'
      ? 'Eşleşmiş cihazdan müşteri değerlendirmesi engellendi'
      : tip === 'login_basarisiz'
      ? 'Başarısız giriş denemesi'
      : tip === 'yetki_reddedildi'
      ? 'Yetkisiz erişim denemesi'
      : tip
    return `  • ${sayi}× ${aciklama} (tip: ${tip})`
  })

  const auditBolum = auditSay > 0 ? `
GÜVENLİK OLAYLARI (son ${AUDIT_PENCERE_SAAT} saat, ${auditSay} kayıt):
${auditOzetSatirlari.join('\n')}
` : ''

  const text = `
İO-GYS Güvenlik Bildirimi
Rapor zamanı: ${trDate(now.toISOString())}

${alertBolum}${auditBolum}

— —
Bu bildirim 30 dakikada bir, kritik/yüksek alert ve güvenlik olayları varsa otomatik gönderilir.
Detay: ${konfig.uygulama_domain ? `https://${konfig.uygulama_domain}` : ''}/sa/dashboard/sistem-uyarilari
`.trim()

  const subject = `[İO-GYS Güvenlik] ${alertSay > 0 ? `${alertSay} alert` : ''}${alertSay > 0 && auditSay > 0 ? ' + ' : ''}${auditSay > 0 ? `${auditSay} olay` : ''}`

  // 4) Gönder + audit log
  let gonderildi = false
  let mailHata: string | null = null
  try {
    const res = await sendMail({ to: aliciEmail, subject, text })
    if ((res as any)?.ok) gonderildi = true
    else mailHata = (res as any)?.error ?? 'sendMail başarısız'
  } catch (e: any) {
    mailHata = e?.message ?? 'sendMail exception'
  }

  // 5) Bildirilen alert'leri işaretle (sadece email başarılıysa)
  if (gonderildi && alertSay > 0) {
    const alertIds = (alerts ?? []).map((a: any) => a.id)
    await admin
      .from('sistem_alerts')
      .update({ bildirim_tarihi: now.toISOString() })
      .in('id', alertIds)
  }

  // Audit log
  await auditLog({
    tip: 'guvenlik_mail_gonder',
    tablo: 'sistem_alerts',
    basarili: gonderildi,
    hata_mesaji: mailHata,
    satir_sayisi: alertSay + auditSay,
    detay: {
      alici: aliciEmail,
      alert_sayisi: alertSay,
      audit_olay_sayisi: auditSay,
      audit_gruplari: auditGruplari,
    },
  })

  return NextResponse.json({
    ok: true,
    gonderildi,
    alici: aliciEmail,
    alert_sayisi: alertSay,
    audit_olay_sayisi: auditSay,
    hata: mailHata,
  })
}
