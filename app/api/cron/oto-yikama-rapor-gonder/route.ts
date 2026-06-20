/**
 * GET/POST /api/cron/oto-yikama-rapor-gonder
 *
 * pg_cron her 15dk bu endpoint'i çağırır. Akış:
 *   1. aktif=true + sonraki_gonderim_tarihi <= now() kayıtları çek
 *   2. Her biri için raporAraligi(tekrar) ile baslangic/bitis hesapla
 *   3. /api/oto-yikama/raporlar/excel?firma_id=...&baslangic=...&bitis=...
 *      endpoint'ini internal SECRET ile çağır → Excel buffer al
 *   4. lib/email.ts sendMail() ile her alıcıya gönder (Excel ek)
 *   5. son_gonderim_tarihi = now, sonraki_gonderim_tarihi = sonraki periyot
 *
 * Güvenlik: x-cron-token header (CRON_SECRET ile aynı).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendMail } from '@/lib/email'
import {
  sonrakiGonderimZamani,
  raporAraligi,
  type TekrarTipi,
} from '@/lib/oto-yikama/raporZamanlama'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const TEKRAR_LABEL: Record<TekrarTipi, string> = {
  gunluk: 'Günlük', haftalik: 'Haftalık', aylik: 'Aylık',
}

async function handle(req: NextRequest) {
  const url = new URL(req.url)
  const provided = req.headers.get('x-cron-token') ?? url.searchParams.get('secret')
  const expected = process.env.CRON_SECRET
  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const now = new Date()

  // Vakti gelmiş aktif zamanlamalar (max 20 / tur)
  const { data: planlar, error: planErr } = await admin
    .from('oto_yikama_rapor_zamanlama')
    .select('*')
    .eq('aktif', true)
    .lte('sonraki_gonderim_tarihi', now.toISOString())
    .order('sonraki_gonderim_tarihi', { ascending: true })
    .limit(20)
  if (planErr) {
    return NextResponse.json({ ok: false, error: planErr.message }, { status: 500 })
  }

  const sonuclar: any[] = []
  for (const plan of (planlar ?? [])) {
    try {
      const aralik = raporAraligi(plan.tekrar_tipi as TekrarTipi, now)

      // Firma bilgisi
      const { data: firma } = await admin
        .from('firmalar').select('firma_adi, ticari_unvan').eq('id', plan.firma_id).single()
      const firmaAd = (firma as any)?.firma_adi ?? (firma as any)?.ticari_unvan ?? '—'

      // Excel'i internal fetch ile çek — kullanıcı session yerine cron secret ile
      // bypass: /api/oto-yikama/raporlar/excel endpoint'i x-cron-token doğruysa
      // auth atlar (bkz. route.ts:36-52).
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://iogys.com.tr'
      const excelUrl = `${baseUrl}/api/oto-yikama/raporlar/excel?firma_id=${plan.firma_id}&baslangic=${aralik.baslangic}&bitis=${aralik.bitis}`
      const excelRes = await fetch(excelUrl, {
        cache: 'no-store',
        headers: { 'x-cron-token': expected },
      })
      if (!excelRes.ok) {
        const err = await excelRes.text().catch(() => '')
        throw new Error(`Excel üretilemedi: HTTP ${excelRes.status} ${err.slice(0, 200)}`)
      }
      const excelBuf = Buffer.from(await excelRes.arrayBuffer())

      // Mail içeriği
      const konu = plan.konu?.trim() ||
        `Oto Yıkama Raporu — ${firmaAd} — ${aralik.etiket}`
      const webLink = `${baseUrl}/oto-yikama/raporlar?baslangic=${aralik.baslangic}&bitis=${aralik.bitis}`
      const aciklamaTxt = plan.aciklama ? `\n\n${plan.aciklama}` : ''
      const text = [
        `Merhaba,`, ``,
        `${firmaAd} firması için ${TEKRAR_LABEL[plan.tekrar_tipi as TekrarTipi]} Oto Yıkama raporu ektedir.`,
        ``, `Dönem: ${aralik.etiket}`,
        ``, `📊 Detaylı görünüm + PDF indirme: ${webLink}`,
        aciklamaTxt,
        ``, `— İO-GYS Otomatik Rapor Sistemi`,
      ].join('\n')
      const html = `
        <div style="font-family: Arial, sans-serif; font-size: 14px; color: #0f172a; max-width: 640px;">
          <p>Merhaba,</p>
          <p><strong>${escapeHtml(firmaAd)}</strong> firması için
            <strong>${TEKRAR_LABEL[plan.tekrar_tipi as TekrarTipi]}</strong>
            Oto Yıkama raporu ektedir.</p>
          <p style="margin: 16px 0; padding: 10px 14px; background: #f1f5f9; border-radius: 6px; font-size: 13px;">
            <strong>Dönem:</strong> ${escapeHtml(aralik.etiket)}
          </p>
          <p>
            <a href="${webLink}" style="display: inline-block; padding: 10px 18px; background: #1d4ed8; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600;">
              📊 Web'de Görüntüle + PDF İndir
            </a>
          </p>
          ${plan.aciklama ? `<p style="margin-top: 16px; padding: 10px 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; font-size: 13px;">${escapeHtml(plan.aciklama)}</p>` : ''}
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="font-size: 11px; color: #94a3b8;">— İO-GYS Otomatik Rapor Sistemi</p>
        </div>
      `
      const dosya = `oto-yikama-raporu-${aralik.baslangic}_${aralik.bitis}.xlsx`

      // Her alıcıya ayrı gönder (Resend tek-tek format, bcc kullanmıyoruz)
      let basariliAdet = 0, hataAdet = 0
      const hatalar: string[] = []
      for (const eposta of (plan.alici_emails as string[])) {
        try {
          const r = await sendMail({
            to: eposta, subject: konu, text, html,
            attachments: [{
              filename: dosya, content: excelBuf,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }],
          })
          if ((r as any).ok) basariliAdet++
          else { hataAdet++; hatalar.push(`${eposta}: ${(r as any).error ?? 'skipped'}`) }
        } catch (e: any) {
          hataAdet++; hatalar.push(`${eposta}: ${e?.message ?? e}`)
        }
      }

      // Sonraki gönderim zamanını hesapla (now baz alınır)
      const sonraki = sonrakiGonderimZamani(
        plan.tekrar_tipi as TekrarTipi, plan.gun_secimi, plan.saat, now,
      )

      await admin.from('oto_yikama_rapor_zamanlama')
        .update({
          son_gonderim_tarihi: now.toISOString(),
          sonraki_gonderim_tarihi: sonraki.toISOString(),
        })
        .eq('id', plan.id)

      sonuclar.push({
        id: plan.id, firma: firmaAd, donem: aralik.etiket,
        basarili: basariliAdet, hata: hataAdet, hatalar,
        sonraki: sonraki.toISOString(),
      })
    } catch (e: any) {
      console.error('[cron/oto-yikama-rapor-gonder] plan hatası', plan.id, e?.message)
      sonuclar.push({ id: plan.id, error: e?.message ?? String(e) })
    }
  }

  await admin.from('cron_log').insert({
    tip: 'oto_yikama_rapor_gonder',
    sonuc: { sayi: sonuclar.length, sonuclar, zaman: now.toISOString() },
  })

  return NextResponse.json({ ok: true, sayi: sonuclar.length, sonuclar })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export async function GET(req: NextRequest)  { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
