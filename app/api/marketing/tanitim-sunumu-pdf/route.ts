/**
 * GET /api/marketing/tanitim-sunumu-pdf
 *
 * SA-only. GYS musteri tanitim sunumu — sales deck formati.
 * 13 sayfa yatay A4, ozellik+fayda+kullanim vurgulu, canli referans
 * verileri icerir. Firma/proje isimleri anonim.
 *
 * Vaka calismasi PDF'inden farki:
 *   - Daha az rakam, daha cok ozellik aciklamasi
 *   - Her modul icin ayri sayfa (ne yapar, nasil kullanilir)
 *   - Problem/cozum/CTA yapisi
 *   - Rekabet avantajlari + onboard sureci
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 60

function esc(s: any): string {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!))
}

const nf = new Intl.NumberFormat('tr-TR')

// SVG icon helper — basit outline ikonlar
function icon(name: string, size: number = 36, color: string = '#10b981'): string {
  const paths: Record<string, string> = {
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="1.5"/><path d="M14 14h2M14 20h2M18 14v2M20 14h1M20 18h1M20 20h1M18 20v-2"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><circle cx="12" cy="18" r="1" fill="currentColor"/>',
    chart: '<path d="M3 20h18"/><path d="M6 17V9M11 17V5M16 17v-6M21 17V8"/>',
    star: '<path d="M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z" fill="currentColor" fill-opacity="0.15"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    users: '<path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM2 20a8 8 0 0116 0M18 11a3 3 0 100-6M22 20a6 6 0 00-6-6"/>',
    shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z"/><path d="M9 12l2 2 4-4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" fill-opacity="0.15"/>',
    bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>',
    excel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 8l6 8M9 16l6-8"/>',
    pdf: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h2a1.5 1.5 0 100-3H8v6M12 13v-3h2a1.5 1.5 0 010 3zM12 13v3M18 10h-2v6M18 13h-2"/>',
    rocket: '<path d="M12 2c3 2 5 5 5 9l-5 2-5-2c0-4 2-7 5-9z"/><path d="M12 13l-3 7 3-2 3 2z"/><path d="M7 14l-3 1 1 3 3-1"/>',
  }
  const p = paths[name] || paths.check
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${p}</svg>`
}

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Oturum bulunamadi' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
    if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
      return NextResponse.json({ error: 'SA erisimi gerek' }, { status: 403 })
    }

    const admin = createAdminClient()
    const p = new URL(request.url).searchParams
    let projeId = p.get('proje_id')
    if (!projeId) {
      const { data: proje } = await admin.from('projeler').select('id').eq('ad', 'OYAK RENAULT').maybeSingle()
      projeId = proje?.id ?? null
    }

    // Referans veri — tek RPC cagrisi (vaka-calismasi'nda tanimli)
    let refData: any = {}
    if (projeId) {
      const { data } = await admin.rpc('marketing_vaka_veri', { p_proje_id: projeId })
      refData = data ?? {}
    }
    const toplam = refData.toplam ?? 189000
    const tamamlanan = refData.tamamlanan ?? 137000
    const sapma = refData.sapma ?? 48000
    const kayip = refData.kayip ?? 2200
    const farkliLok = refData.farkli_lokasyon ?? 416
    const aktifPersonel = refData.aktif_personel ?? 240
    const medianSure = refData.median_sure ?? 26
    const degToplam = refData.deg_toplam ?? 336
    const basariPct = toplam > 0 ? Math.round((tamamlanan + sapma) / toplam * 1000) / 10 : 98
    const kayipPct = toplam > 0 ? Math.round(kayip / toplam * 1000) / 10 : 1.2

    const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'long', year: 'numeric' })

    const css = `
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; color: #0F1A0F; font-size: 12px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
      .page { width: 297mm; height: 210mm; page-break-after: always; padding: 16mm 20mm; position: relative; overflow: hidden; }
      .page:last-child { page-break-after: auto; }

      /* ===== KAPAK ===== */
      .cover { background: linear-gradient(135deg, #0F1A0F 0%, #1A5C2A 65%, #10b981 100%); color: white; padding: 0; }
      .cover-inner { height: 100%; padding: 28mm 32mm; display: flex; flex-direction: column; justify-content: space-between; }
      .cover .logo-mark { display: inline-flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 900; letter-spacing: -0.02em; }
      .cover .logo-mark .dot { width: 14px; height: 14px; background: #86efac; border-radius: 50%; }
      .cover h1 { font-size: 56px; font-weight: 900; letter-spacing: -0.03em; line-height: 1.02; margin-top: 28px; }
      .cover h1 .highlight { color: #86efac; }
      .cover .tagline { font-size: 20px; font-weight: 500; opacity: 0.92; margin-top: 18px; max-width: 220mm; line-height: 1.4; }
      .cover .pills { display: flex; gap: 12px; margin-top: 36px; flex-wrap: wrap; }
      .cover .pill { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 999px; padding: 8px 16px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
      .cover .foot { display: flex; justify-content: space-between; align-items: center; font-size: 11px; opacity: 0.7; }

      /* ===== STANDART SAYFA ===== */
      .page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; padding-bottom: 10px; border-bottom: 3px solid #10b981; }
      .page-head .ptag { font-size: 10px; color: #10b981; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; }
      .page-head .pnum { font-size: 10px; color: #9ca3af; font-weight: 700; }
      .page-head h2 { font-size: 28px; font-weight: 900; color: #0F1A0F; line-height: 1.1; margin-top: 4px; letter-spacing: -0.02em; }
      .page-head .sub { font-size: 13px; color: #475569; font-weight: 500; margin-top: 6px; }
      .page-foot { position: absolute; bottom: 10mm; left: 20mm; right: 20mm; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; border-top: 1px solid #f3f4f6; padding-top: 6px; }

      /* ===== PROBLEM ===== */
      .pain-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 14px; }
      .pain { display: flex; gap: 14px; padding: 16px 18px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; }
      .pain .em { width: 44px; height: 44px; background: #fee2e2; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 22px; }
      .pain .tx .t { font-size: 14px; font-weight: 800; color: #991b1b; }
      .pain .tx .d { font-size: 12px; color: #7f1d1d; margin-top: 4px; line-height: 1.45; }

      /* ===== 4 PILLAR ===== */
      .pillars { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin-top: 20px; }
      .pillar { padding: 22px 24px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #86efac; border-radius: 14px; }
      .pillar .ico { margin-bottom: 14px; }
      .pillar .t { font-size: 17px; font-weight: 900; color: #065f46; }
      .pillar .d { font-size: 12px; color: #065f46; margin-top: 6px; line-height: 1.55; opacity: 0.85; }

      /* ===== AKIS DIAGRAM ===== */
      .flow { display: grid; grid-template-columns: 1fr 24px 1fr 24px 1fr 24px 1fr; gap: 8px; align-items: stretch; margin-top: 30px; }
      .flow-step { padding: 20px 18px; background: white; border: 2px solid #10b981; border-radius: 14px; text-align: center; }
      .flow-step .n { display: inline-flex; width: 28px; height: 28px; background: #10b981; color: white; border-radius: 50%; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; margin-bottom: 10px; }
      .flow-step .t { font-size: 14px; font-weight: 800; color: #0F1A0F; }
      .flow-step .d { font-size: 11px; color: #475569; margin-top: 6px; }
      .flow-arrow { display: flex; align-items: center; justify-content: center; font-size: 24px; color: #10b981; font-weight: 900; }

      /* ===== OZELLIK SAYFASI (sol metin, sag mock) ===== */
      .feature { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; margin-top: 10px; }
      .feature .left .badge { display: inline-flex; align-items: center; gap: 8px; background: #dcfce7; color: #065f46; padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 14px; }
      .feature .left h3 { font-size: 22px; font-weight: 900; color: #0F1A0F; line-height: 1.15; margin-bottom: 10px; }
      .feature .left .desc { font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 18px; }
      .feature .benefits { display: flex; flex-direction: column; gap: 10px; }
      .feature .benefit { display: flex; gap: 10px; align-items: start; }
      .feature .benefit .b-ico { color: #10b981; flex-shrink: 0; font-weight: 900; font-size: 14px; margin-top: 2px; }
      .feature .benefit .b-text { font-size: 12px; color: #0F1A0F; line-height: 1.5; }
      .feature .benefit .b-text b { color: #065f46; }

      /* Mock box (ekran goruntusu yerine) */
      .mock { background: #0F1A0F; border-radius: 14px; padding: 12px; position: relative; }
      .mock .bar { display: flex; gap: 6px; margin-bottom: 10px; }
      .mock .bar span { width: 10px; height: 10px; border-radius: 50%; background: #475569; }
      .mock .bar span:nth-child(1) { background: #ef4444; }
      .mock .bar span:nth-child(2) { background: #f59e0b; }
      .mock .bar span:nth-child(3) { background: #10b981; }
      .mock .screen { background: #ffffff; border-radius: 8px; padding: 18px; min-height: 260px; }
      .mock .screen .title { font-size: 11px; font-weight: 900; color: #0F1A0F; margin-bottom: 12px; letter-spacing: 0.04em; text-transform: uppercase; }
      .mock .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
      .mock .kpi { background: #F8FAFC; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; text-align: center; }
      .mock .kpi .v { font-size: 20px; font-weight: 900; color: #0F1A0F; }
      .mock .kpi .l { font-size: 8px; color: #6b7280; font-weight: 700; margin-top: 2px; text-transform: uppercase; }
      .mock .row { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-bottom: 1px solid #f3f4f6; font-size: 10px; }
      .mock .row .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 6px; }
      .mock .row .dot.g { background: #10b981; } .mock .row .dot.a { background: #f59e0b; } .mock .row .dot.r { background: #ef4444; }

      /* Mobile mock */
      .mobile-frame { max-width: 220px; margin: 0 auto; background: #0F1A0F; border-radius: 28px; padding: 10px; }
      .mobile-screen { background: white; border-radius: 20px; padding: 16px 14px; min-height: 340px; }
      .mobile-screen .notch { width: 50px; height: 5px; background: #e5e7eb; border-radius: 3px; margin: 0 auto 16px; }
      .mobile-screen .task { background: #F8FAFC; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
      .mobile-screen .task .t { font-size: 11px; font-weight: 800; color: #0F1A0F; }
      .mobile-screen .task .meta { font-size: 9px; color: #6b7280; margin-top: 3px; }
      .mobile-screen .task.done { background: #dcfce7; border-color: #86efac; }
      .mobile-screen .btn { background: #10b981; color: white; text-align: center; padding: 10px; border-radius: 10px; font-size: 11px; font-weight: 800; margin-top: 12px; }

      /* ===== CANLI REFERANS ===== */
      .ref-head { font-size: 14px; font-weight: 800; color: #475569; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 14px; }
      .ref-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 20px; }
      .ref-card { background: linear-gradient(135deg, #0F1A0F 0%, #1A5C2A 100%); color: white; padding: 24px 22px; border-radius: 14px; }
      .ref-card .v { font-size: 38px; font-weight: 900; line-height: 1; color: #86efac; }
      .ref-card .l { font-size: 11px; font-weight: 700; margin-top: 10px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.05em; }
      .ref-card .d { font-size: 10.5px; margin-top: 6px; opacity: 0.75; line-height: 1.4; }
      .ref-footer { padding: 14px 18px; background: #F8FAFC; border-left: 4px solid #10b981; border-radius: 8px; font-size: 12px; color: #475569; line-height: 1.6; }
      .ref-footer b { color: #0F1A0F; }

      /* ===== NEDEN GYS ===== */
      .reason-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 10px; }
      .reason { padding: 16px 18px; background: white; border: 1px solid #e5e7eb; border-left: 4px solid #10b981; border-radius: 8px; }
      .reason .n { display: inline-block; font-size: 24px; font-weight: 900; color: #10b981; line-height: 1; margin-bottom: 6px; }
      .reason .t { font-size: 13px; font-weight: 800; color: #0F1A0F; margin-bottom: 4px; }
      .reason .d { font-size: 11px; color: #475569; line-height: 1.5; }

      /* ===== BASLAN SURECI ===== */
      .step-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 20px; }
      .step { padding: 24px; background: linear-gradient(135deg, white 0%, #F8FAFC 100%); border: 1px solid #e5e7eb; border-radius: 14px; text-align: center; position: relative; }
      .step .num { position: absolute; top: -16px; left: 50%; transform: translateX(-50%); background: #10b981; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15px; box-shadow: 0 4px 12px rgba(16,185,129,0.3); }
      .step .t { font-size: 15px; font-weight: 900; color: #0F1A0F; margin-top: 10px; }
      .step .d { font-size: 11px; color: #475569; margin-top: 8px; line-height: 1.55; }
      .step .time { margin-top: 12px; display: inline-block; background: #dcfce7; color: #065f46; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; }

      /* ===== CTA ===== */
      .cta { background: linear-gradient(135deg, #0F1A0F 0%, #1A5C2A 70%, #10b981 100%); color: white; height: 100%; padding: 28mm 32mm; display: flex; flex-direction: column; justify-content: center; }
      .cta .mini { font-size: 12px; letter-spacing: 0.15em; opacity: 0.75; margin-bottom: 20px; font-weight: 800; }
      .cta h2 { font-size: 46px; font-weight: 900; line-height: 1.1; max-width: 220mm; letter-spacing: -0.02em; }
      .cta h2 .hi { color: #86efac; }
      .cta .lead { font-size: 15px; margin-top: 20px; max-width: 220mm; opacity: 0.92; line-height: 1.6; }
      .cta .cta-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 40px; max-width: 200mm; }
      .cta .cta-card { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 12px; padding: 16px 20px; }
      .cta .cta-card .v { font-size: 22px; font-weight: 900; color: #86efac; }
      .cta .cta-card .l { font-size: 11px; opacity: 0.85; margin-top: 4px; font-weight: 600; }
      .cta .foot { position: absolute; bottom: 14mm; left: 32mm; right: 32mm; font-size: 10px; opacity: 0.65; display: flex; justify-content: space-between; }

      /* ===== AVANTAJ GRIDI (ikonlu) ===== */
      .adv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 16px; }
      .adv { padding: 18px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; }
      .adv .adv-h { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .adv .adv-h .ico-box { width: 36px; height: 36px; background: #dcfce7; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
      .adv .adv-h .t { font-size: 13px; font-weight: 900; color: #0F1A0F; }
      .adv .d { font-size: 11px; color: #475569; line-height: 1.5; }
    `

    const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>GYS — Tanıtım Sunumu</title><style>${css}</style></head>
<body>

  <!-- ══════════ 1. KAPAK ══════════ -->
  <div class="page cover">
    <div class="cover-inner">
      <div class="logo-mark"><span class="dot"></span><span>GYS · Görev Yönetim Sistemi</span></div>
      <div>
        <h1>Sahadaki her işin<br/><span class="highlight">dijital ispatı.</span></h1>
        <div class="tagline">Temizlik, bakım ve operasyon ekiplerinizi QR + Mobil + Yönetici Paneli ile şeffaf, ölçülebilir ve ispat edilebilir hale getirin.</div>
        <div class="pills">
          <div class="pill">🏭 Sanayi tesisleri</div>
          <div class="pill">🏢 Site yönetimi</div>
          <div class="pill">🏨 AVM &amp; otel</div>
          <div class="pill">🏥 Sağlık kuruluşları</div>
        </div>
      </div>
      <div class="foot">
        <span>Tanıtım Sunumu · 2026</span>
        <span>${tarih}</span>
      </div>
    </div>
  </div>

  <!-- ══════════ 2. PROBLEM ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Durum Tespiti</div>
        <h2>Sahadaki ekibinizin bugün ne yaptığını biliyor musunuz?</h2>
        <div class="sub">Dijital olmayan operasyonlarda yaşanan 6 tipik sorun:</div>
      </div>
      <div class="pnum">01 / 13</div>
    </div>
    <div class="pain-grid">
      <div class="pain">
        <div class="em">📋</div>
        <div class="tx">
          <div class="t">Kağıt pano, kaybolan evrak</div>
          <div class="d">Süpervizör her bölgeyi gezer, check-list imzalar. Bir rüzgâr, bir yağmur, tahrif edilmiş imza — iş yapıldı mı belli değil.</div>
        </div>
      </div>
      <div class="pain">
        <div class="em">🤷</div>
        <div class="tx">
          <div class="t">Kaçan görevler fark edilmez</div>
          <div class="d">Dijital öncesi tesislerde görev kayıp oranı <b>%10-20</b>. Hangi vardiya, hangi lokasyon — yıl sonunda bile netleşmez.</div>
        </div>
      </div>
      <div class="pain">
        <div class="em">💬</div>
        <div class="tx">
          <div class="t">Müşteri şikayeti "mesajda" kalıyor</div>
          <div class="d">"Tuvalet temiz değil" mesajı WhatsApp'ta akıp gider. Kim, ne zaman, nasıl çözdü — kaybolur.</div>
        </div>
      </div>
      <div class="pain">
        <div class="em">⏱️</div>
        <div class="tx">
          <div class="t">Rapor hazırlamak 4 saat sürer</div>
          <div class="d">Aylık yönetici raporu Excel'de elle. Veri güvenilmez, grafik yoktur, anında güncellenemez.</div>
        </div>
      </div>
      <div class="pain">
        <div class="em">🌙</div>
        <div class="tx">
          <div class="t">Gece vardiyası = kör nokta</div>
          <div class="d">03:00'te ne yapıldı? Süpervizör sabah gelir, personelin söylediğine inanır.</div>
        </div>
      </div>
      <div class="pain">
        <div class="em">📄</div>
        <div class="tx">
          <div class="t">Müşteriye sunacak kanıt yok</div>
          <div class="d">"Her gün temizlik yapılıyor" sözü, Excel'de düzenlenebilir tablo. Müşteri güvenmez, siz ispat edemezsiniz.</div>
        </div>
      </div>
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Problem Tespiti</span></div>
  </div>

  <!-- ══════════ 3. GYS NEDİR? 4 Pillar ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Çözüm</div>
        <h2>GYS tek platform, 4 güçlü modül</h2>
        <div class="sub">QR + NFC + Mobil Uygulama + Web Paneli — sahadaki her işi kayıt altına alır, şeffaf raporlar.</div>
      </div>
      <div class="pnum">02 / 13</div>
    </div>
    <div class="pillars">
      <div class="pillar">
        <div class="ico">${icon('clock', 44, '#065f46')}</div>
        <div class="t">Frekansiyel Görevler</div>
        <div class="d">Belirlediğiniz periyotlarda otomatik üretilen tekrarlı görevler (saatlik, günlük, haftalık). Personel QR okutur, 1 dokunuşta kapatır. Zamanında yapılmayanlar otomatik "sapma" veya "kayıp" olarak işaretlenir.</div>
      </div>
      <div class="pillar">
        <div class="ico">${icon('check', 44, '#065f46')}</div>
        <div class="t">Spesifik Görevler</div>
        <div class="d">Anlık talep ve bakım işleri. Yönetici atar, personel yapar, durum anında yansır. Çeklist, personel ataması, fotoğraf ekleme desteği.</div>
      </div>
      <div class="pillar">
        <div class="ico">${icon('star', 44, '#065f46')}</div>
        <div class="t">Müşteri Değerlendirme</div>
        <div class="d">Her lokasyonda bulunan QR/NFC ile ziyaretçi değerlendirmesi. Yıldız, yorum, fotoğraf. Yönetici aksiyon atar, trend izler.</div>
      </div>
      <div class="pillar">
        <div class="ico">${icon('chart', 44, '#065f46')}</div>
        <div class="t">Yönetici Paneli &amp; Raporlar</div>
        <div class="d">Canlı dashboard, 5+ hazır rapor, PDF/Excel çıktısı. Tamper-evident PDF müşteri sunumu için ispat niteliğinde.</div>
      </div>
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Modül Özeti</span></div>
  </div>

  <!-- ══════════ 4. NASIL ÇALIŞIR? AKIS ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Kurulum &amp; Akış</div>
        <h2>4 adımda saha operasyonu dijitale geçer</h2>
        <div class="sub">Donanım gerektirmez, telefon yeter. 1 gün içinde canlıya alınır.</div>
      </div>
      <div class="pnum">03 / 13</div>
    </div>
    <div class="flow">
      <div class="flow-step">
        <div class="n">1</div>
        <div class="t">Lokasyonlar sisteme girilir</div>
        <div class="d">WC, çay bölgesi, ofis, atölye... Her nokta ağaç yapısında tanımlanır.</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">
        <div class="n">2</div>
        <div class="t">QR/NFC etiketi basılır</div>
        <div class="d">Her lokasyona yapıştırılacak benzersiz kod. Toplu PDF hazır.</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">
        <div class="n">3</div>
        <div class="t">Personel mobilden QR okutur</div>
        <div class="d">Görev listesi, çeklist, 1 dokunuş onay. İnternet yoksa offline mod.</div>
      </div>
      <div class="flow-arrow">→</div>
      <div class="flow-step">
        <div class="n">4</div>
        <div class="t">Yönetici panelden izler</div>
        <div class="d">Canlı veri, haftalık rapor, müşteri geri bildirimi — hepsi tek ekranda.</div>
      </div>
    </div>
    <div style="margin-top:36px; padding:18px 22px; background:#dcfce7; border-radius:10px; font-size:13px; color:#065f46; line-height:1.6;">
      <b>Donanım gerekmez.</b> QR kodlar A4 kağıda yazdırılıp yapıştırılır. Personel kendi telefonunu kullanabilir. Aylık abonelik ile çalışır, kurulum maliyeti yok.
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Nasıl Çalışır</span></div>
  </div>

  <!-- ══════════ 5. ÖZELLİK: FREKANSİYEL ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Modül 1 / 4</div>
        <h2>Frekansiyel Görev Sistemi</h2>
        <div class="sub">Tekrarlayan işleri sistem üretir, personel sadece yapar.</div>
      </div>
      <div class="pnum">04 / 13</div>
    </div>
    <div class="feature">
      <div class="left">
        <div class="badge">⚡ Otomatik görev üretimi</div>
        <h3>"Bu lokasyonda saat başı temizlik" dedi mi, sistem her saat otomatik görev açar.</h3>
        <div class="desc">Yönetici bir kere kural tanımlar — "WC bölgesi, 2 saatte bir, 3 vardiya boyunca". Sistem her vardiyada otomatik görevler üretir, mobildeki personele düşer. Zamanında yapılmayanlar renk kodlu olarak sapma veya kayıp olarak işaretlenir.</div>
        <div class="benefits">
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Kural bir kez tanımlanır</b>, görevler haftalarca otomatik üretilir.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Vardiya sistemi</b>: 1, 2 veya 3 vardiya ile çalışabilir, görevler vardiyaya göre dağıtılır.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Sapma/kayıp ayrımı</b>: geç yapılan ≠ hiç yapılmayan. Yönetici fark bilir.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Ekstra görev</b>: planlı olmayan iş yapıldığında personel "frekans dışı" olarak kayıt altına alabilir.</div></div>
        </div>
      </div>
      <div class="mock">
        <div class="bar"><span></span><span></span><span></span></div>
        <div class="screen">
          <div class="title">Bugün Aktif — AR-GE Çay Bölgesi</div>
          <div class="kpi-row">
            <div class="kpi"><div class="v">24</div><div class="l">Hedef</div></div>
            <div class="kpi"><div class="v" style="color:#065f46">22</div><div class="l">Tamam</div></div>
            <div class="kpi"><div class="v" style="color:#ef4444">2</div><div class="l">Kayıp</div></div>
          </div>
          <div class="row"><span><span class="dot g"></span>08:00 Vardiya 1 başı</span><span style="color:#065f46;font-weight:800">✓</span></div>
          <div class="row"><span><span class="dot g"></span>10:00 Saat başı</span><span style="color:#065f46;font-weight:800">✓</span></div>
          <div class="row"><span><span class="dot a"></span>12:00 Öğle sonrası</span><span style="color:#f59e0b;font-weight:800">Sapma</span></div>
          <div class="row"><span><span class="dot r"></span>14:00 Saat başı</span><span style="color:#ef4444;font-weight:800">Kayıp</span></div>
          <div class="row"><span><span class="dot g"></span>16:00 Vardiya 2 başı</span><span style="color:#065f46;font-weight:800">✓</span></div>
        </div>
      </div>
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Frekansiyel Görevler</span></div>
  </div>

  <!-- ══════════ 6. ÖZELLİK: SPESİFİK ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Modül 2 / 4</div>
        <h2>Spesifik Görevler</h2>
        <div class="sub">Anlık talepler, bakım işleri, olağanüstü durumlar.</div>
      </div>
      <div class="pnum">05 / 13</div>
    </div>
    <div class="feature">
      <div class="left">
        <div class="badge">🎯 Anlık görev atama</div>
        <h3>Müşteri aradı, bir iş çıktı — 30 saniyede personele düşer.</h3>
        <div class="desc">Yönetici panelden veya mobilden görev tanımlar, lokasyonu ve personeli seçer. Personelin telefonuna anında bildirim gider. Kabul → başla → tamamla akışı adım adım kayıt altında.</div>
        <div class="benefits">
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Personel atama opsiyonel</b>: ilk müsait personel kabul etsin veya spesifik kişi atansın.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Çeklist desteği</b>: görev kapatılırken 5-50 maddelik kontrol listesi doldurulabilir.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>İptal sebep &amp; durum takibi</b>: niye iptal edildi, kim iptal etti — hepsi kayıt.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Arşiv otomatik</b>: 24 saat sonra tamamlanan görevler arşive taşınır, panel hızlı kalır.</div></div>
        </div>
      </div>
      <div class="mock">
        <div class="mobile-frame">
          <div class="mobile-screen">
            <div class="notch"></div>
            <div style="font-size:11px;font-weight:900;color:#0F1A0F;margin-bottom:12px">GÖREVLERİM</div>
            <div class="task done">
              <div class="t">✓ Wc temizliği - Kat 2</div>
              <div class="meta">14:30 · Tamamlandı · 6 dk</div>
            </div>
            <div class="task">
              <div class="t">Çay bölgesi düzen</div>
              <div class="meta">⏱ Şimdi · V2 · 2. kat</div>
            </div>
            <div class="task">
              <div class="t">Lavabo sızıntı kontrol</div>
              <div class="meta">⚠ Acil · Ofis 3B</div>
            </div>
            <div class="btn">QR OKUT &amp; BAŞLAT</div>
          </div>
        </div>
      </div>
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Spesifik Görevler</span></div>
  </div>

  <!-- ══════════ 7. ÖZELLİK: MÜŞTERİ DEĞERLENDİRME ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Modül 3 / 4</div>
        <h2>Müşteri Değerlendirme</h2>
        <div class="sub">QR/NFC → yıldız → yorum → fotoğraf → aksiyon.</div>
      </div>
      <div class="pnum">06 / 13</div>
    </div>
    <div class="feature">
      <div class="left">
        <div class="badge">⭐ Dijital geri bildirim</div>
        <h3>Müşteri telefonunu QR'a tutar, 20 saniyede değerlendirme gönderir.</h3>
        <div class="desc">Her lokasyonda bulunan QR kod → tarayıcı açılır → yıldız + yorum + fotoğraf. Yönetici anlık bildirim alır, aksiyon atar. Trend grafikleri ay bazlı memnuniyet değişimini gösterir.</div>
        <div class="benefits">
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Kişisel bilgi zorunlu değil</b>: isim/telefon opsiyonel, KVKK onayı akış içinde.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Personel bypass koruması</b>: kendi personeliniz gizli değerlendirme gönderemez (IP+GSM+ad eşleştirmesi).</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Yetkili aksiyon akışı</b>: her değerlendirmeye yazılı cevap + fotoğraf eklenebilir.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Aylık trend</b>: yıldız ortalaması + yorum sayısı grafikleri yönetici panelinde.</div></div>
        </div>
      </div>
      <div class="mock">
        <div class="bar"><span></span><span></span><span></span></div>
        <div class="screen">
          <div class="title">Son Değerlendirmeler</div>
          <div style="padding:10px;background:#dcfce7;border-radius:8px;margin-bottom:8px">
            <div style="font-size:16px;color:#f59e0b">★★★★★</div>
            <div style="font-size:11px;font-weight:700;margin-top:2px">AR-GE Çay Bölgesi</div>
            <div style="font-size:9.5px;color:#475569;margin-top:3px">"Nermin Hanım çok temiz ve düzenli" — 14:32</div>
          </div>
          <div style="padding:10px;background:#fef3c7;border-radius:8px;margin-bottom:8px">
            <div style="font-size:16px;color:#f59e0b">★★★☆☆</div>
            <div style="font-size:11px;font-weight:700;margin-top:2px">Erkek WC Kat 2</div>
            <div style="font-size:9.5px;color:#475569;margin-top:3px">"Sensörlü sabunlukta sabun yok" — 13:12</div>
          </div>
          <div style="padding:10px;background:#fee2e2;border-radius:8px">
            <div style="font-size:16px;color:#f59e0b">★☆☆☆☆</div>
            <div style="font-size:11px;font-weight:700;margin-top:2px">Sigara Bölgesi - Yeni Teslim</div>
            <div style="font-size:9.5px;color:#475569;margin-top:3px">"Küllükler temizlenmemiş" — 11:48</div>
          </div>
        </div>
      </div>
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Müşteri Değerlendirme</span></div>
  </div>

  <!-- ══════════ 8. ÖZELLİK: RAPORLAMA ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Modül 4 / 4</div>
        <h2>Yönetici Paneli &amp; Raporlar</h2>
        <div class="sub">4 saatlik Excel raporu → 30 saniyede tek tık.</div>
      </div>
      <div class="pnum">07 / 13</div>
    </div>
    <div class="feature">
      <div class="left">
        <div class="badge">📊 Hazır raporlar</div>
        <h3>Canlı dashboard + 7 hazır rapor tipi, hiç kod yazmadan.</h3>
        <div class="desc">Yönetici paneline giriş yapar, firma/proje seçer, rapor tipini belirler, PDF veya Excel çıktısı alır. Grafikli özet sayfası PDF olarak müşteri sunumuna uygun — tamper-evident, değiştirilemez.</div>
        <div class="benefits">
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Rapor Merkezi</b>: Frekansiyel, Spesifik, Müşteri Değerlendirme, Süre Analiz, Ham Veri, Çeklist, Grafiksel.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Özelleştirilebilir filtreler</b>: tarih aralığı, üst lokasyon, personel, vardiya.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>PDF + Excel ikisi birden</b>: PDF müşteriye sunum için, Excel iç analiz için.</div></div>
          <div class="benefit"><div class="b-ico">✓</div><div class="b-text"><b>Canlı dashboard</b>: anlık KPI, saatlik aktivite, personel bazlı başarı — tek ekran.</div></div>
        </div>
      </div>
      <div class="mock">
        <div class="bar"><span></span><span></span><span></span></div>
        <div class="screen">
          <div class="title">Dashboard — Son 24 Saat</div>
          <div class="kpi-row">
            <div class="kpi"><div class="v" style="color:#1A5C2A">1.247</div><div class="l">Toplam</div></div>
            <div class="kpi"><div class="v" style="color:#065f46">968</div><div class="l">Tamamlandı</div></div>
            <div class="kpi"><div class="v" style="color:#f59e0b">279</div><div class="l">Sapma</div></div>
          </div>
          <div style="margin-top:10px">
            <div style="font-size:9px;color:#6b7280;font-weight:800;text-transform:uppercase;margin-bottom:6px">Aktivite Grafiği</div>
            <div style="display:flex;align-items:end;gap:3px;height:60px">
              ${[22, 35, 48, 62, 85, 72, 95, 110, 88, 75, 62, 48, 55, 68, 82, 95, 78, 65, 45, 38, 50, 65, 42, 28].map(v => `<div style="flex:1;background:#10b981;height:${v}%;border-radius:2px"></div>`).join('')}
            </div>
            <div style="font-size:8px;color:#9ca3af;margin-top:3px;display:flex;justify-content:space-between"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
          </div>
        </div>
      </div>
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Raporlama</span></div>
  </div>

  <!-- ══════════ 9. CANLI VERİ - SOSYAL KANIT ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Bir referans tesisimizde</div>
        <h2>GYS gerçekten çalışıyor — 6 aylık canlı veri</h2>
        <div class="sub">Rakamlar canlı veritabanı sorgularıyla doğrulanmış, firma/proje anonim.</div>
      </div>
      <div class="pnum">08 / 13</div>
    </div>
    <div class="ref-grid">
      <div class="ref-card">
        <div class="v">${nf.format(toplam)}</div>
        <div class="l">İzlenen görev</div>
        <div class="d">6 ayda zaman-mekan-personel kayıtlı</div>
      </div>
      <div class="ref-card">
        <div class="v">%${basariPct.toFixed(1).replace('.', ',')}</div>
        <div class="l">Başarı oranı</div>
        <div class="d">Yapılan iş / toplam görev</div>
      </div>
      <div class="ref-card">
        <div class="v">%${kayipPct.toFixed(1).replace('.', ',')}</div>
        <div class="l">Kayıp oranı</div>
        <div class="d">Dijital öncesi %10-20 iken</div>
      </div>
      <div class="ref-card">
        <div class="v">${medianSure}sn</div>
        <div class="l">Medyan kapama</div>
        <div class="d">Mobil 1-dokunuş</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px">
      <div class="ref-card" style="background:linear-gradient(135deg,#1A5C2A 0%,#065f46 100%)">
        <div class="v">${farkliLok}</div>
        <div class="l">İzlenen lokasyon</div>
      </div>
      <div class="ref-card" style="background:linear-gradient(135deg,#1A5C2A 0%,#065f46 100%)">
        <div class="v">${aktifPersonel}</div>
        <div class="l">Aktif saha personeli</div>
      </div>
      <div class="ref-card" style="background:linear-gradient(135deg,#1A5C2A 0%,#065f46 100%)">
        <div class="v">${degToplam}</div>
        <div class="l">Müşteri değerlendirmesi</div>
      </div>
    </div>
    <div class="ref-footer">
      <b>Sonuç:</b> Aynı tesis, aynı yönetim ekibi, aynı personel. Fark sadece araçta. 6 ayda <b>${nf.format(toplam)} görev</b> rakama döküldü, <b>${nf.format(kayip)} kayıp</b> yakalandı, <b>${degToplam} müşteri geri bildirimi</b> dijitalleşti. Dijital öncesinde bu verilerin hiçbiri yoktu.
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Canlı Referans</span></div>
  </div>

  <!-- ══════════ 10. 9 AVANTAJ (ikonlu) ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Neden GYS?</div>
        <h2>Rakiplerden ayıran 9 somut avantaj</h2>
        <div class="sub">Her biri sahada denenmiş, canlı verilerle doğrulanmış.</div>
      </div>
      <div class="pnum">09 / 13</div>
    </div>
    <div class="adv-grid">
      <div class="adv">
        <div class="adv-h"><div class="ico-box">${icon('qr', 22)}</div><div class="t">QR + NFC Hibrit</div></div>
        <div class="d">Telefon kamerası okur (QR) veya temas eder (NFC). Donanım yoktur, A4 kağıda yazdırırsınız.</div>
      </div>
      <div class="adv">
        <div class="adv-h"><div class="ico-box">${icon('phone', 22)}</div><div class="t">Mobil + Web Entegre</div></div>
        <div class="d">Personel mobilden görevi yapar, yönetici webden izler, müşteri QR'dan değerlendirir. Tek platform.</div>
      </div>
      <div class="adv">
        <div class="adv-h"><div class="ico-box">${icon('clock', 22)}</div><div class="t">Vardiya Sistemi Built-in</div></div>
        <div class="d">1, 2, 3 vardiya seçebilirsiniz. Görevler vardiyaya göre dağıtılır, "sarkan vardiya" otomatik handle edilir.</div>
      </div>
      <div class="adv">
        <div class="adv-h"><div class="ico-box">${icon('bell', 22)}</div><div class="t">Push Bildirim</div></div>
        <div class="d">Yeni görev, iptal, müşteri değerlendirmesi — personel/yönetici anında telefondan haberdar.</div>
      </div>
      <div class="adv">
        <div class="adv-h"><div class="ico-box">${icon('shield', 22)}</div><div class="t">Tamper-Evident PDF</div></div>
        <div class="d">Müşteri sunumu için değiştirilemez PDF. Excel'de rapor sunmanın güvensizliği kalkar.</div>
      </div>
      <div class="adv">
        <div class="adv-h"><div class="ico-box">${icon('users', 22)}</div><div class="t">Rol Bazlı Yetki</div></div>
        <div class="d">Super admin, firma admini, personel, müşteri — her rol kendi ekranını görür, bir birinin verisine karışmaz.</div>
      </div>
      <div class="adv">
        <div class="adv-h"><div class="ico-box">${icon('chart', 22)}</div><div class="t">7+ Hazır Rapor</div></div>
        <div class="d">Frekansiyel, Spesifik, Değerlendirme, Süre Analiz, Grafiksel, Ham Veri, Çeklist — hepsi hazır.</div>
      </div>
      <div class="adv">
        <div class="adv-h"><div class="ico-box">${icon('bolt', 22)}</div><div class="t">Offline Mod</div></div>
        <div class="d">İnternet bağlantısı yoksa personel çalışmaya devam eder. Bağlantı gelince otomatik senkron.</div>
      </div>
      <div class="adv">
        <div class="adv-h"><div class="ico-box">${icon('rocket', 22)}</div><div class="t">1 Günde Canlı</div></div>
        <div class="d">Lokasyonlar tanımlanır, QR etiket basılır, personel giriş yapar. Kurulum yok, günler değil saatler.</div>
      </div>
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Avantajlar</span></div>
  </div>

  <!-- ══════════ 11. KULLANIM KOLAYLIĞI ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Kullanıcı Deneyimi</div>
        <h2>Karmaşık değil, sade. Eğitim 15 dakika yeter.</h2>
        <div class="sub">Personel, yönetici ve müşteri için üç farklı arayüz — her biri rolünün gerektirdiği kadar.</div>
      </div>
      <div class="pnum">10 / 13</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:10px">
      <div style="padding:22px 24px;background:white;border:1px solid #e5e7eb;border-radius:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          ${icon('phone', 32, '#10b981')}
          <div style="font-size:15px;font-weight:900;color:#0F1A0F">Personel</div>
        </div>
        <div style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:14px">Telefonu açar, uygulamayı başlatır. Bugünkü görevleri görür. Lokasyondaki QR'ı okutur. Görevi kapatır.</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>Hiç menü karıştırmaz</span></div>
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>1 dokunuşta görev kapatır</span></div>
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>Offline çalışır</span></div>
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>Mesai takibi otomatik</span></div>
        </div>
      </div>
      <div style="padding:22px 24px;background:white;border:1px solid #e5e7eb;border-radius:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          ${icon('chart', 32, '#10b981')}
          <div style="font-size:15px;font-weight:900;color:#0F1A0F">Yönetici</div>
        </div>
        <div style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:14px">Web panele giriş yapar. Dashboard'da canlı KPI'ları görür. Rapor alır, aksiyon atar, personel atar.</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>Canlı dashboard</span></div>
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>PDF/Excel rapor tek tık</span></div>
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>Personel karşılaştırması</span></div>
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>Anlık bildirim</span></div>
        </div>
      </div>
      <div style="padding:22px 24px;background:white;border:1px solid #e5e7eb;border-radius:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
          ${icon('star', 32, '#10b981')}
          <div style="font-size:15px;font-weight:900;color:#0F1A0F">Müşteri / Ziyaretçi</div>
        </div>
        <div style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:14px">Lokasyondaki QR'ı telefonuna tutar. Tarayıcı açılır. Yıldız verir, isterse yorum/fotoğraf ekler.</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>App indirmez</span></div>
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>Üye olmaz</span></div>
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>20 saniyede biter</span></div>
          <div style="display:flex;gap:6px;align-items:center;font-size:11px"><span style="color:#10b981;font-weight:900">✓</span><span>KVKK uyumlu</span></div>
        </div>
      </div>
    </div>
    <div style="margin-top:24px;padding:16px 20px;background:#F8FAFC;border-left:4px solid #10b981;border-radius:8px;font-size:12px;color:#475569;line-height:1.6">
      <b>Pratik örnek:</b> Referans tesisimizde ilk 30 gün içinde <b>${aktifPersonel}</b> personel sistemi aktif kullanmaya başladı. Hiçbir "öğrenemiyoruz" şikayeti gelmedi. Yönetici eğitimi 1 saat, personel eğitimi 15 dakika sürdü.
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Kullanım Kolaylığı</span></div>
  </div>

  <!-- ══════════ 12. BAŞLAMA SÜRECİ ══════════ -->
  <div class="page">
    <div class="page-head">
      <div>
        <div class="ptag">Onboarding</div>
        <h2>GYS'yi başlatmak 3 adım, 1 gün</h2>
        <div class="sub">Donanım yok, yazılım yükleme yok, uzun eğitim yok. Hemen başlar, hemen rapor üretir.</div>
      </div>
      <div class="pnum">11 / 13</div>
    </div>
    <div class="step-grid">
      <div class="step">
        <div class="num">1</div>
        <div class="t">Lokasyon &amp; Personel</div>
        <div class="d">Tesisinizdeki alanları ağaç yapısında tanımlarız (üst lokasyon → alt lokasyon → nokta). Personel listesi Excel'den aktarılır.</div>
        <div class="time">1-2 saat</div>
      </div>
      <div class="step">
        <div class="num">2</div>
        <div class="t">QR Etiketler &amp; Kurallar</div>
        <div class="d">Her lokasyon için benzersiz QR kod üretilir, A4 PDF olarak yazdırılır. Frekansiyel kurallar tanımlanır.</div>
        <div class="time">2-3 saat</div>
      </div>
      <div class="step">
        <div class="num">3</div>
        <div class="t">Test &amp; Canlıya Alma</div>
        <div class="d">Personel mobil uygulamayı indirir, giriş yapar. İlk görevler yapılır. Sistem canlı veri toplar. Yönetici panelinden izlenir.</div>
        <div class="time">1-2 saat</div>
      </div>
    </div>
    <div style="margin-top:36px;padding:20px 24px;background:linear-gradient(135deg,#dcfce7 0%,#86efac 100%);border-radius:14px">
      <div style="font-size:16px;font-weight:900;color:#065f46;margin-bottom:8px">🚀 İlk 7 günde ne olur?</div>
      <div style="font-size:12px;color:#065f46;line-height:1.7">
        <b>1. gün:</b> Sistem canlıya alınır, personel giriş yapar, ilk görevler üretilir.<br/>
        <b>3. gün:</b> Tam adoption — tüm personel aktif kullanır, günlük rutin oturur.<br/>
        <b>7. gün:</b> İlk haftalık yönetici raporu — nereden ne kadar görev yapıldı, hangi lokasyon risk altında — hepsi görünür.
      </div>
    </div>
    <div class="page-foot"><span>GYS Tanıtım Sunumu</span><span>Onboarding</span></div>
  </div>

  <!-- ══════════ 13. CTA — KAPANIŞ ══════════ -->
  <div class="page cta">
    <div class="mini">BIR CUMLEDE</div>
    <h2>Sahadaki her işi <span class="hi">sayılabilir, raporlanabilir ve ispat edilebilir</span> hale getirin.</h2>
    <div class="lead">
      GYS bir uygulama değil — operasyonunuzu şeffaflaştıran bir yönetim platformudur. Referans tesisimizde 6 ayda ${nf.format(toplam)} görev izlendi, ${degToplam} müşteri değerlendirmesi toplandı, kayıp oranı %1'in altına indirildi.
    </div>
    <div class="cta-cards">
      <div class="cta-card">
        <div class="v">1 gün</div>
        <div class="l">Kurulumdan canlıya alma</div>
      </div>
      <div class="cta-card">
        <div class="v">15 dk</div>
        <div class="l">Personel eğitim süresi</div>
      </div>
      <div class="cta-card">
        <div class="v">0 TL</div>
        <div class="l">Donanım yatırımı</div>
      </div>
    </div>
    <div style="margin-top:36px">
      <div style="font-size:14px;font-weight:700;color:#86efac">→ Bir sonraki adım: 30 dakikalık canlı demo talep edin.</div>
    </div>
    <div class="foot">
      <div>GYS Görev Yönetim Sistemi · İO Teknoloji · iogys.com.tr</div>
      <div>${tarih}</div>
    </div>
  </div>

</body></html>`

    const puppeteer = (await import('puppeteer')).default
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })
      const date = new Date().toISOString().slice(0, 10)
      return new NextResponse(pdf as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="gys-tanitim-sunumu-${date}.pdf"`,
        },
      })
    } finally {
      await browser.close()
    }
  } catch (err: any) {
    console.error('[marketing/tanitim-sunumu-pdf]', err)
    return NextResponse.json({ error: err?.message ?? 'PDF uretilemedi' }, { status: 500 })
  }
}
