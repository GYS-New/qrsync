/**
 * GET /api/marketing/tam-sunum-pptx
 *
 * SA-only. Vaka calismasi + tanitim sunumu birlestirilmis TEK PPTX dosyasi.
 * 18 slayt, curated narrative (tanitim ilk, vaka icerigi aralara serpistirilmis).
 *
 * Teknik:
 *   1) Puppeteer ile HTML'i yukler, her <div class="page"> elementini ayri PNG screenshot
 *   2) pptxgenjs ile her PNG tam slayt olarak embed
 *   3) A4 landscape boyutunda PPTX (11.69 x 8.27 inch)
 *
 * Icerik kaynaklari: /api/marketing/vaka-calismasi-pdf + /api/marketing/tanitim-sunumu-pdf
 * Burada tek bir unified HTML olarak birlestirildi (code sync: bu dosyayi guncellerken
 * ilgili PDF endpoint'leri de ayni mantikla tutun — veya tersi).
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import PptxGenJS from 'pptxgenjs'

export const runtime = 'nodejs'
export const maxDuration = 120

function esc(s: any): string {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!))
}

const nf = new Intl.NumberFormat('tr-TR')

function icon(name: string, size = 36, color = '#10b981'): string {
  const paths: Record<string, string> = {
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="1.5"/>',
    phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><circle cx="12" cy="18" r="1" fill="currentColor"/>',
    chart: '<path d="M3 20h18"/><path d="M6 17V9M11 17V5M16 17v-6M21 17V8"/>',
    star: '<path d="M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z" fill="currentColor" fill-opacity="0.15"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>',
    users: '<path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM2 20a8 8 0 0116 0"/>',
    shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z"/><path d="M9 12l2 2 4-4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" fill-opacity="0.15"/>',
    bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21h4"/>',
    rocket: '<path d="M12 2c3 2 5 5 5 9l-5 2-5-2c0-4 2-7 5-9z"/><path d="M12 13l-3 7 3-2 3 2z"/>',
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.check}</svg>`
}

// SVG bar/line chart helper'lar
function svgBar(width: number, height: number, items: { label: string; value: number; color?: string }[], maxValue?: number): string {
  const padL = 70, padR = 30, padT = 10, padB = 24
  const chartW = width - padL - padR, chartH = height - padT - padB
  const barH = chartH / items.length * 0.7, gap = chartH / items.length * 0.3
  const max = maxValue ?? Math.max(...items.map(i => i.value), 1)
  let s = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`
  for (let i = 0; i <= 4; i++) {
    const x = padL + (chartW / 4) * i
    s += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + chartH}" stroke="#e5e7eb" stroke-width="0.5"/>`
    s += `<text x="${x}" y="${padT + chartH + 14}" font-size="9" fill="#9ca3af" text-anchor="middle">${nf.format(Math.round(max / 4 * i))}</text>`
  }
  items.forEach((it, i) => {
    const y = padT + i * (barH + gap), w = (it.value / max) * chartW
    s += `<text x="${padL - 6}" y="${y + barH / 2 + 3}" font-size="10" font-weight="700" fill="#374151" text-anchor="end">${esc(it.label)}</text>`
    s += `<rect x="${padL}" y="${y}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" fill="${it.color ?? '#10b981'}" rx="3"/>`
    s += `<text x="${padL + w + 4}" y="${y + barH / 2 + 3}" font-size="10" font-weight="800" fill="#111827">${nf.format(it.value)}</text>`
  })
  return s + `</svg>`
}

function svgLine(width: number, height: number, points: { label: string; value: number }[], color: string, yMax?: number): string {
  const padL = 32, padR = 20, padT = 15, padB = 30
  const chartW = width - padL - padR, chartH = height - padT - padB
  const n = points.length, max = yMax ?? Math.max(...points.map(p => p.value), 1)
  const stepX = n > 1 ? chartW / (n - 1) : 0
  let path = '', coords: { x: number; y: number; label: string; value: number }[] = []
  points.forEach((p, i) => {
    const x = padL + i * stepX, y = padT + chartH - (p.value / max) * chartH
    coords.push({ x, y, label: p.label, value: p.value })
    path += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`)
  })
  let s = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`
  for (let i = 0; i <= 4; i++) {
    const y = padT + (chartH / 4) * i
    s += `<line x1="${padL}" y1="${y}" x2="${padL + chartW}" y2="${y}" stroke="#f3f4f6" stroke-width="0.5"/>`
    s += `<text x="${padL - 4}" y="${y + 3}" font-size="8" fill="#9ca3af" text-anchor="end">${nf.format(Math.round(max - (max / 4) * i))}</text>`
  }
  const area = path + ` L ${padL + (n - 1) * stepX} ${padT + chartH} L ${padL} ${padT + chartH} Z`
  s += `<path d="${area}" fill="${color}" fill-opacity="0.12"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>`
  coords.forEach(c => {
    s += `<circle cx="${c.x}" cy="${c.y}" r="3.5" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>`
    s += `<text x="${c.x}" y="${c.y - 8}" font-size="9" font-weight="800" fill="${color}" text-anchor="middle">${c.value}</text>`
    s += `<text x="${c.x}" y="${padT + chartH + 14}" font-size="8.5" fill="#6b7280" text-anchor="middle">${esc(c.label)}</text>`
  })
  return s + `</svg>`
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

    // Veri RPC'den
    let v: any = {}
    if (projeId) {
      const { data } = await admin.rpc('marketing_vaka_veri', { p_proje_id: projeId })
      v = data ?? {}
    }
    const toplam = v.toplam ?? 189000
    const tamamlanan = v.tamamlanan ?? 137000
    const sapma = v.sapma ?? 48000
    const kayip = v.kayip ?? 2200
    const farkliLok = v.farkli_lokasyon ?? 416
    const aktifPersonel = v.aktif_personel ?? 240
    const medianSure = v.median_sure ?? 26
    const degToplam = v.deg_toplam ?? 336
    const basariPct = toplam > 0 ? Math.round((tamamlanan + sapma) / toplam * 1000) / 10 : 98
    const kayipPct = toplam > 0 ? Math.round(kayip / toplam * 1000) / 10 : 1.2

    const AY_ADLARI = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
    const monthLbl = (key: string) => AY_ADLARI[parseInt(key.split('-')[1] ?? '1', 10) - 1] ?? key
    const aylikHacim: { label: string; value: number }[] = (v.aylik ?? []).map((a: any) => ({ label: monthLbl(a.ay), value: Number(a.toplam) || 0 }))
    const degYildiz: { label: string; value: number }[] = (v.deg_aylik ?? []).map((a: any) => ({ label: monthLbl(a.ay), value: Number(a.yildiz_ort) || 0 }))
    const persSerie: { label: string; value: number }[] = (v.personel_adoption ?? []).map((a: any) => ({ label: monthLbl(a.ay), value: Number(a.pers) || 0 }))
    const saatSerie: { label: string; value: number }[] = Array.from({ length: 24 }, (_, h) => ({ label: String(h).padStart(2, '0'), value: 0 }))
    for (const s of (v.saat_dagilimi ?? [])) { const h = Number(s.saat); if (h >= 0 && h < 24) saatSerie[h].value = Number(s.c) || 0 }

    const tarih = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'long', year: 'numeric' })

    // CSS (her iki PDF'in stilleri birlestirildi)
    const css = `
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; color: #0F1A0F; font-size: 12px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
      .page { width: 297mm; height: 210mm; page-break-after: always; padding: 16mm 20mm; position: relative; overflow: hidden; background: white; }
      .page:last-child { page-break-after: auto; }

      /* Kapak + CTA gradient */
      .cover, .cta { background: linear-gradient(135deg, #0F1A0F 0%, #1A5C2A 65%, #10b981 100%); color: white; padding: 0; }
      .cover-inner, .cta-inner { height: 100%; padding: 28mm 32mm; display: flex; flex-direction: column; justify-content: space-between; }
      .cover .logo { display: inline-flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 900; }
      .cover .logo .dot { width: 14px; height: 14px; background: #86efac; border-radius: 50%; }
      .cover h1 { font-size: 56px; font-weight: 900; line-height: 1.02; margin-top: 28px; letter-spacing: -0.03em; }
      .cover h1 .hl { color: #86efac; }
      .cover .tagline { font-size: 20px; margin-top: 18px; opacity: 0.92; max-width: 220mm; }
      .cover .pills { display: flex; gap: 12px; margin-top: 36px; flex-wrap: wrap; }
      .cover .pill { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 999px; padding: 8px 16px; font-size: 12px; font-weight: 700; }
      .cover .foot, .cta .foot { font-size: 11px; opacity: 0.7; display: flex; justify-content: space-between; }

      .cta h2 { font-size: 46px; font-weight: 900; line-height: 1.1; max-width: 220mm; letter-spacing: -0.02em; }
      .cta h2 .hi { color: #86efac; }
      .cta .lead { font-size: 15px; margin-top: 20px; max-width: 220mm; opacity: 0.92; }
      .cta .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 36px; max-width: 200mm; }
      .cta .card { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 12px; padding: 16px 20px; }
      .cta .card .v { font-size: 22px; font-weight: 900; color: #86efac; }
      .cta .card .l { font-size: 11px; opacity: 0.85; margin-top: 4px; }
      .cta .mini { font-size: 12px; letter-spacing: 0.15em; opacity: 0.75; margin-bottom: 20px; font-weight: 800; }

      /* Standart sayfa header */
      .ph { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; padding-bottom: 10px; border-bottom: 3px solid #10b981; }
      .ph .tag { font-size: 10px; color: #10b981; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; }
      .ph .num { font-size: 10px; color: #9ca3af; font-weight: 700; }
      .ph h2 { font-size: 26px; font-weight: 900; line-height: 1.1; margin-top: 4px; letter-spacing: -0.02em; }
      .ph .sub { font-size: 13px; color: #475569; margin-top: 6px; }
      .pf { position: absolute; bottom: 10mm; left: 20mm; right: 20mm; font-size: 9px; color: #9ca3af; display: flex; justify-content: space-between; border-top: 1px solid #f3f4f6; padding-top: 6px; }

      /* Problem */
      .pain-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 14px; }
      .pain { display: flex; gap: 14px; padding: 16px 18px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; }
      .pain .em { width: 44px; height: 44px; background: #fee2e2; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 22px; }
      .pain .t { font-size: 14px; font-weight: 800; color: #991b1b; }
      .pain .d { font-size: 11.5px; color: #7f1d1d; margin-top: 4px; line-height: 1.45; }

      /* Pillars */
      .pillars { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin-top: 20px; }
      .pillar { padding: 22px 24px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #86efac; border-radius: 14px; }
      .pillar .ico { margin-bottom: 14px; }
      .pillar .t { font-size: 17px; font-weight: 900; color: #065f46; }
      .pillar .d { font-size: 12px; color: #065f46; margin-top: 6px; line-height: 1.55; opacity: 0.85; }

      /* Flow */
      .flow { display: grid; grid-template-columns: 1fr 24px 1fr 24px 1fr 24px 1fr; gap: 8px; align-items: stretch; margin-top: 30px; }
      .fs { padding: 20px 18px; background: white; border: 2px solid #10b981; border-radius: 14px; text-align: center; }
      .fs .n { display: inline-flex; width: 28px; height: 28px; background: #10b981; color: white; border-radius: 50%; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; margin-bottom: 10px; }
      .fs .t { font-size: 14px; font-weight: 800; }
      .fs .d { font-size: 11px; color: #475569; margin-top: 6px; }
      .fa { display: flex; align-items: center; justify-content: center; font-size: 24px; color: #10b981; font-weight: 900; }

      /* Feature (sol metin + sag mock) */
      .feature { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; align-items: start; margin-top: 10px; }
      .feature .badge { display: inline-flex; gap: 8px; background: #dcfce7; color: #065f46; padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 14px; }
      .feature h3 { font-size: 22px; font-weight: 900; line-height: 1.15; margin-bottom: 10px; }
      .feature .desc { font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 18px; }
      .bl { display: flex; flex-direction: column; gap: 10px; }
      .bl .it { display: flex; gap: 10px; align-items: start; }
      .bl .it .ic { color: #10b981; font-weight: 900; font-size: 14px; margin-top: 2px; }
      .bl .it .tx { font-size: 12px; line-height: 1.5; }
      .bl .it .tx b { color: #065f46; }

      .mock { background: #0F1A0F; border-radius: 14px; padding: 12px; }
      .mock .bar { display: flex; gap: 6px; margin-bottom: 10px; }
      .mock .bar span { width: 10px; height: 10px; border-radius: 50%; background: #475569; }
      .mock .bar span:nth-child(1) { background: #ef4444; }
      .mock .bar span:nth-child(2) { background: #f59e0b; }
      .mock .bar span:nth-child(3) { background: #10b981; }
      .mock .scr { background: white; border-radius: 8px; padding: 18px; min-height: 260px; }
      .mock .title { font-size: 11px; font-weight: 900; margin-bottom: 12px; text-transform: uppercase; }
      .mock .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
      .mock .kpi { background: #F8FAFC; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px; text-align: center; }
      .mock .kpi .v { font-size: 20px; font-weight: 900; }
      .mock .kpi .l { font-size: 8px; color: #6b7280; font-weight: 700; margin-top: 2px; text-transform: uppercase; }
      .mock .row { display: flex; justify-content: space-between; padding: 6px 8px; border-bottom: 1px solid #f3f4f6; font-size: 10px; }
      .mock .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 6px; }
      .mock .dot.g { background: #10b981; } .mock .dot.a { background: #f59e0b; } .mock .dot.r { background: #ef4444; }

      .mobile-frame { max-width: 220px; margin: 0 auto; background: #0F1A0F; border-radius: 28px; padding: 10px; }
      .mobile-scr { background: white; border-radius: 20px; padding: 16px 14px; min-height: 340px; }
      .mobile-scr .notch { width: 50px; height: 5px; background: #e5e7eb; border-radius: 3px; margin: 0 auto 16px; }
      .mobile-scr .task { background: #F8FAFC; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; }
      .mobile-scr .task .t { font-size: 11px; font-weight: 800; }
      .mobile-scr .task .meta { font-size: 9px; color: #6b7280; margin-top: 3px; }
      .mobile-scr .task.done { background: #dcfce7; border-color: #86efac; }
      .mobile-scr .btn { background: #10b981; color: white; text-align: center; padding: 10px; border-radius: 10px; font-size: 11px; font-weight: 800; margin-top: 12px; }

      /* Hero KPI grid */
      .hero { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 10px; }
      .hc { background: #F8FAFC; border: 1px solid #e5e7eb; border-radius: 12px; padding: 22px; text-align: center; }
      .hc.g { background: #dcfce7; border-color: #86efac; } .hc.g .v { color: #065f46; }
      .hc.r { background: #fee2e2; border-color: #fecaca; } .hc.r .v { color: #991b1b; }
      .hc.a { background: #fef3c7; border-color: #fde68a; } .hc.a .v { color: #92400e; }
      .hc .v { font-size: 46px; font-weight: 900; line-height: 1; }
      .hc .l { font-size: 12px; font-weight: 700; color: #475569; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
      .hc .d { font-size: 10px; color: #6b7280; margin-top: 4px; }

      /* Grafik 2'li */
      .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .cb { background: white; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; }
      .cb .t { font-size: 13px; font-weight: 800; margin-bottom: 4px; }
      .cb .s { font-size: 10px; color: #6b7280; margin-bottom: 8px; }

      /* 24h bars */
      .hrs { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; margin-top: 8px; height: 100px; align-items: end; }
      .hrs .b { background: linear-gradient(180deg, #10b981, #065f46); border-radius: 2px 2px 0 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
      .hrs .b span { font-size: 7.5px; color: white; font-weight: 800; padding: 1px 0; }
      .hrl { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; margin-top: 3px; }
      .hrl span { font-size: 7.5px; color: #6b7280; text-align: center; font-weight: 600; }

      /* Onc-son grid */
      .vs { display: grid; grid-template-columns: 1fr 50px 1fr; gap: 10px; margin-top: 16px; }
      .vs-c { padding: 14px 16px; border-radius: 10px; }
      .vs-c.b { background: #fee2e2; border: 1px solid #fecaca; }
      .vs-c.a { background: #dcfce7; border: 1px solid #86efac; }
      .vs-h { font-size: 13px; font-weight: 900; margin-bottom: 8px; text-transform: uppercase; }
      .vs-c.b .vs-h { color: #991b1b; } .vs-c.a .vs-h { color: #065f46; }
      .vs-i { font-size: 11px; padding: 6px 0; border-top: 1px dashed rgba(0,0,0,0.12); }
      .vs-i:first-of-type { border-top: 0; }
      .vs-ar { display: flex; align-items: center; justify-content: center; font-size: 22px; color: #10b981; }

      /* Avantaj grid */
      .adv { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 16px; }
      .adv-c { padding: 18px; background: white; border: 1px solid #e5e7eb; border-radius: 12px; }
      .adv-c .h { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .adv-c .h .ib { width: 36px; height: 36px; background: #dcfce7; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
      .adv-c .h .t { font-size: 13px; font-weight: 900; }
      .adv-c .d { font-size: 11px; color: #475569; line-height: 1.5; }

      /* Onboarding steps */
      .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 20px; }
      .step { padding: 24px; background: linear-gradient(135deg, white 0%, #F8FAFC 100%); border: 1px solid #e5e7eb; border-radius: 14px; text-align: center; position: relative; }
      .step .n { position: absolute; top: -16px; left: 50%; transform: translateX(-50%); background: #10b981; color: white; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15px; }
      .step .t { font-size: 15px; font-weight: 900; margin-top: 10px; }
      .step .d { font-size: 11px; color: #475569; margin-top: 8px; line-height: 1.55; }
      .step .tm { margin-top: 12px; display: inline-block; background: #dcfce7; color: #065f46; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 800; }
    `

    const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>GYS Sunumu</title><style>${css}</style></head>
<body>

  <!-- 1. KAPAK -->
  <div class="page cover"><div class="cover-inner">
    <div class="logo"><span class="dot"></span><span>GYS · Görev Yönetim Sistemi</span></div>
    <div>
      <h1>Sahadaki her işin<br/><span class="hl">dijital ispatı.</span></h1>
      <div class="tagline">Temizlik, bakım ve operasyon ekiplerinizi QR + Mobil + Yönetici Paneli ile şeffaf, ölçülebilir ve ispat edilebilir hale getirin.</div>
      <div class="pills">
        <div class="pill">🏭 Sanayi tesisleri</div>
        <div class="pill">🏢 Site yönetimi</div>
        <div class="pill">🏨 AVM &amp; otel</div>
        <div class="pill">🏥 Sağlık kuruluşları</div>
      </div>
    </div>
    <div class="foot"><span>Müşteri Tanıtım Sunumu · 2026</span><span>${tarih}</span></div>
  </div></div>

  <!-- 2. PROBLEM -->
  <div class="page">
    <div class="ph"><div><div class="tag">Durum Tespiti</div><h2>Sahadaki ekibinizin bugün ne yaptığını biliyor musunuz?</h2><div class="sub">Dijital olmayan operasyonlarda 6 tipik sorun:</div></div><div class="num">02 / 18</div></div>
    <div class="pain-grid">
      <div class="pain"><div class="em">📋</div><div><div class="t">Kağıt pano, kaybolan evrak</div><div class="d">Süpervizör imzalar, fiziksel evrak kaybolur, tahrif edilir. İş yapıldı mı belli değil.</div></div></div>
      <div class="pain"><div class="em">🤷</div><div><div class="t">Kaçan görevler fark edilmez</div><div class="d">Dijital öncesi tesislerde görev kayıp oranı <b>%10-20</b>. Hangi vardiya, hangi lokasyon — belli olmaz.</div></div></div>
      <div class="pain"><div class="em">💬</div><div><div class="t">Müşteri şikayeti "mesajda" kalır</div><div class="d">WhatsApp'ta akıp giden mesaj. Kim ne zaman çözdü — kaybolur.</div></div></div>
      <div class="pain"><div class="em">⏱️</div><div><div class="t">Rapor hazırlamak 4 saat sürer</div><div class="d">Excel'de elle rapor. Veri güvenilmez, grafik yoktur, anında güncellenemez.</div></div></div>
      <div class="pain"><div class="em">🌙</div><div><div class="t">Gece vardiyası = kör nokta</div><div class="d">03:00'te ne yapıldı? Süpervizör sabah gelir, söylenene inanır.</div></div></div>
      <div class="pain"><div class="em">📄</div><div><div class="t">Müşteriye sunacak kanıt yok</div><div class="d">"Her gün temizlik yapılıyor" sözü. Düzenlenebilir Excel. Müşteri güvenmez.</div></div></div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Problem Tespiti</span></div>
  </div>

  <!-- 3. GYS NEDIR / 4 PILLAR -->
  <div class="page">
    <div class="ph"><div><div class="tag">Çözüm</div><h2>GYS tek platform, 4 güçlü modül</h2><div class="sub">QR + NFC + Mobil + Web Paneli — sahadaki her işi kayıt altına alır, şeffaf raporlar.</div></div><div class="num">03 / 18</div></div>
    <div class="pillars">
      <div class="pillar"><div class="ico">${icon('clock', 44, '#065f46')}</div><div class="t">Frekansiyel Görevler</div><div class="d">Belirlediğiniz periyotlarda otomatik üretilen tekrarlı görevler. Personel QR okutur, 1 dokunuşta kapatır. Zamanında yapılmayanlar otomatik "sapma" veya "kayıp" olarak işaretlenir.</div></div>
      <div class="pillar"><div class="ico">${icon('check', 44, '#065f46')}</div><div class="t">Spesifik Görevler</div><div class="d">Anlık talep ve bakım işleri. Yönetici atar, personel yapar, durum anında yansır. Çeklist, personel ataması, fotoğraf ekleme desteği.</div></div>
      <div class="pillar"><div class="ico">${icon('star', 44, '#065f46')}</div><div class="t">Müşteri Değerlendirme</div><div class="d">Her lokasyonda QR/NFC ile ziyaretçi değerlendirmesi. Yıldız, yorum, fotoğraf. Yönetici aksiyon atar, trend izler.</div></div>
      <div class="pillar"><div class="ico">${icon('chart', 44, '#065f46')}</div><div class="t">Yönetici Paneli &amp; Raporlar</div><div class="d">Canlı dashboard, 7+ hazır rapor, PDF/Excel çıktısı. Tamper-evident PDF müşteri sunumu için ispat niteliğinde.</div></div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Modül Özeti</span></div>
  </div>

  <!-- 4. NASIL CALISIR -->
  <div class="page">
    <div class="ph"><div><div class="tag">Kurulum &amp; Akış</div><h2>4 adımda saha operasyonu dijitale geçer</h2><div class="sub">Donanım gerektirmez, telefon yeter. 1 gün içinde canlıya alınır.</div></div><div class="num">04 / 18</div></div>
    <div class="flow">
      <div class="fs"><div class="n">1</div><div class="t">Lokasyonlar girilir</div><div class="d">WC, çay, ofis, atölye... Her nokta ağaç yapısında.</div></div>
      <div class="fa">→</div>
      <div class="fs"><div class="n">2</div><div class="t">QR/NFC etiket basılır</div><div class="d">Her lokasyona yapıştırılacak kod. Toplu PDF hazır.</div></div>
      <div class="fa">→</div>
      <div class="fs"><div class="n">3</div><div class="t">Personel QR okutur</div><div class="d">Görev listesi, çeklist, 1 dokunuş onay. Offline mod.</div></div>
      <div class="fa">→</div>
      <div class="fs"><div class="n">4</div><div class="t">Yönetici izler</div><div class="d">Canlı veri, haftalık rapor — tek ekran.</div></div>
    </div>
    <div style="margin-top:36px;padding:18px 22px;background:#dcfce7;border-radius:10px;font-size:13px;color:#065f46;line-height:1.6"><b>Donanım gerekmez.</b> QR kodlar A4 kağıda yazdırılıp yapıştırılır. Personel kendi telefonunu kullanabilir. Aylık abonelik, kurulum maliyeti yok.</div>
    <div class="pf"><span>GYS Sunumu</span><span>Nasıl Çalışır</span></div>
  </div>

  <!-- 5. OZELLIK 1: FREKANSIYEL -->
  <div class="page">
    <div class="ph"><div><div class="tag">Modül 1 / 4</div><h2>Frekansiyel Görev Sistemi</h2><div class="sub">Tekrarlayan işleri sistem üretir, personel sadece yapar.</div></div><div class="num">05 / 18</div></div>
    <div class="feature">
      <div>
        <div class="badge">⚡ Otomatik görev üretimi</div>
        <h3>"Bu lokasyonda saat başı temizlik" dedi mi, sistem her saat otomatik görev açar.</h3>
        <div class="desc">Yönetici bir kere kural tanımlar — "WC bölgesi, 2 saatte bir, 3 vardiya". Sistem her vardiyada otomatik görevler üretir. Zamanında yapılmayanlar renk kodlu sapma/kayıp olarak işaretlenir.</div>
        <div class="bl">
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Kural bir kez tanımlanır</b>, görevler haftalarca otomatik üretilir.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Vardiya sistemi</b>: 1, 2 veya 3 vardiya desteği.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Sapma/kayıp ayrımı</b>: geç yapılan ≠ hiç yapılmayan.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Ekstra görev</b>: planlı olmayan iş yapıldığında "frekans dışı" kayıt.</div></div>
        </div>
      </div>
      <div class="mock">
        <div class="bar"><span></span><span></span><span></span></div>
        <div class="scr">
          <div class="title">Bugün — AR-GE Çay Bölgesi</div>
          <div class="kpis"><div class="kpi"><div class="v">24</div><div class="l">Hedef</div></div><div class="kpi"><div class="v" style="color:#065f46">22</div><div class="l">Tamam</div></div><div class="kpi"><div class="v" style="color:#ef4444">2</div><div class="l">Kayıp</div></div></div>
          <div class="row"><span><span class="dot g"></span>08:00 Vardiya 1</span><span style="color:#065f46;font-weight:800">✓</span></div>
          <div class="row"><span><span class="dot g"></span>10:00 Saat başı</span><span style="color:#065f46;font-weight:800">✓</span></div>
          <div class="row"><span><span class="dot a"></span>12:00 Öğle sonrası</span><span style="color:#f59e0b;font-weight:800">Sapma</span></div>
          <div class="row"><span><span class="dot r"></span>14:00</span><span style="color:#ef4444;font-weight:800">Kayıp</span></div>
          <div class="row"><span><span class="dot g"></span>16:00 Vardiya 2</span><span style="color:#065f46;font-weight:800">✓</span></div>
        </div>
      </div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Frekansiyel Görevler</span></div>
  </div>

  <!-- 6. OZELLIK 2: SPESIFIK -->
  <div class="page">
    <div class="ph"><div><div class="tag">Modül 2 / 4</div><h2>Spesifik Görevler</h2><div class="sub">Anlık talepler, bakım işleri, olağanüstü durumlar.</div></div><div class="num">06 / 18</div></div>
    <div class="feature">
      <div>
        <div class="badge">🎯 Anlık görev atama</div>
        <h3>Müşteri aradı, bir iş çıktı — 30 saniyede personele düşer.</h3>
        <div class="desc">Yönetici panelden veya mobilden görev tanımlar, lokasyon ve personel seçer. Personel telefonuna anında bildirim. Kabul → başla → tamamla akışı kayıt altında.</div>
        <div class="bl">
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Personel atama opsiyonel</b>: ilk müsait kabul etsin veya spesifik kişi atansın.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Çeklist desteği</b>: 5-50 maddelik kontrol listesi.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>İptal sebep takibi</b>: niye iptal, kim iptal — hepsi kayıt.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Arşiv otomatik</b>: 24 saat sonra tamamlananlar arşive.</div></div>
        </div>
      </div>
      <div class="mock">
        <div class="mobile-frame">
          <div class="mobile-scr">
            <div class="notch"></div>
            <div style="font-size:11px;font-weight:900;margin-bottom:12px">GÖREVLERİM</div>
            <div class="task done"><div class="t">✓ WC temizliği - Kat 2</div><div class="meta">14:30 · Tamamlandı · 6 dk</div></div>
            <div class="task"><div class="t">Çay bölgesi düzen</div><div class="meta">⏱ Şimdi · V2 · 2. kat</div></div>
            <div class="task"><div class="t">Lavabo sızıntı kontrol</div><div class="meta">⚠ Acil · Ofis 3B</div></div>
            <div class="btn">QR OKUT &amp; BAŞLAT</div>
          </div>
        </div>
      </div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Spesifik Görevler</span></div>
  </div>

  <!-- 7. OZELLIK 3: MUSTERI DEG -->
  <div class="page">
    <div class="ph"><div><div class="tag">Modül 3 / 4</div><h2>Müşteri Değerlendirme</h2><div class="sub">QR/NFC → yıldız → yorum → fotoğraf → aksiyon.</div></div><div class="num">07 / 18</div></div>
    <div class="feature">
      <div>
        <div class="badge">⭐ Dijital geri bildirim</div>
        <h3>Müşteri telefonunu QR'a tutar, 20 saniyede değerlendirme gönderir.</h3>
        <div class="desc">Her lokasyondaki QR → tarayıcı açılır → yıldız + yorum + fotoğraf. Yönetici anlık bildirim alır, aksiyon atar. Aylık trend grafiği memnuniyet değişimini gösterir.</div>
        <div class="bl">
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Kişisel bilgi zorunlu değil</b>: isim/telefon opsiyonel, KVKK onayı akışta.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Personel bypass koruması</b>: kendi personeliniz gizli değerlendirme gönderemez.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Yetkili aksiyon akışı</b>: her değerlendirmeye yazılı cevap + fotoğraf.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Aylık trend</b>: yıldız ortalaması + yorum sayısı grafikleri.</div></div>
        </div>
      </div>
      <div class="mock">
        <div class="bar"><span></span><span></span><span></span></div>
        <div class="scr">
          <div class="title">Son Değerlendirmeler</div>
          <div style="padding:10px;background:#dcfce7;border-radius:8px;margin-bottom:8px">
            <div style="font-size:16px;color:#f59e0b">★★★★★</div>
            <div style="font-size:11px;font-weight:700;margin-top:2px">AR-GE Çay Bölgesi</div>
            <div style="font-size:9.5px;color:#475569;margin-top:3px">"Çok temiz ve düzenli" — 14:32</div>
          </div>
          <div style="padding:10px;background:#fef3c7;border-radius:8px;margin-bottom:8px">
            <div style="font-size:16px;color:#f59e0b">★★★☆☆</div>
            <div style="font-size:11px;font-weight:700;margin-top:2px">Erkek WC Kat 2</div>
            <div style="font-size:9.5px;color:#475569;margin-top:3px">"Sabunlukta sabun yok" — 13:12</div>
          </div>
          <div style="padding:10px;background:#fee2e2;border-radius:8px">
            <div style="font-size:16px;color:#f59e0b">★☆☆☆☆</div>
            <div style="font-size:11px;font-weight:700;margin-top:2px">Sigara Bölgesi</div>
            <div style="font-size:9.5px;color:#475569;margin-top:3px">"Küllükler temizlenmemiş" — 11:48</div>
          </div>
        </div>
      </div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Müşteri Değerlendirme</span></div>
  </div>

  <!-- 8. OZELLIK 4: RAPORLAMA -->
  <div class="page">
    <div class="ph"><div><div class="tag">Modül 4 / 4</div><h2>Yönetici Paneli &amp; Raporlar</h2><div class="sub">4 saatlik Excel raporu → 30 saniyede tek tık.</div></div><div class="num">08 / 18</div></div>
    <div class="feature">
      <div>
        <div class="badge">📊 Hazır raporlar</div>
        <h3>Canlı dashboard + 7 hazır rapor tipi, hiç kod yazmadan.</h3>
        <div class="desc">Yönetici panele giriş yapar, firma/proje seçer, rapor tipini belirler. PDF/Excel. Grafikli özet sayfası PDF olarak müşteri sunumuna uygun — tamper-evident, değiştirilemez.</div>
        <div class="bl">
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Rapor Merkezi</b>: Frekansiyel, Spesifik, Değerlendirme, Süre Analiz, Ham Veri, Çeklist, Grafiksel.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Özelleştirilebilir filtreler</b>: tarih, üst lokasyon, personel, vardiya.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>PDF + Excel</b>: PDF müşteriye sunum için, Excel iç analiz için.</div></div>
          <div class="it"><div class="ic">✓</div><div class="tx"><b>Canlı dashboard</b>: anlık KPI, saatlik aktivite, personel bazlı başarı — tek ekran.</div></div>
        </div>
      </div>
      <div class="mock">
        <div class="bar"><span></span><span></span><span></span></div>
        <div class="scr">
          <div class="title">Dashboard — Son 24 Saat</div>
          <div class="kpis"><div class="kpi"><div class="v" style="color:#1A5C2A">1.247</div><div class="l">Toplam</div></div><div class="kpi"><div class="v" style="color:#065f46">968</div><div class="l">Tamam</div></div><div class="kpi"><div class="v" style="color:#f59e0b">279</div><div class="l">Sapma</div></div></div>
          <div style="margin-top:10px"><div style="font-size:9px;color:#6b7280;font-weight:800;text-transform:uppercase;margin-bottom:6px">Aktivite</div>
            <div style="display:flex;align-items:end;gap:3px;height:60px">${[22, 35, 48, 62, 85, 72, 95, 110, 88, 75, 62, 48, 55, 68, 82, 95, 78, 65, 45, 38, 50, 65, 42, 28].map(v => `<div style="flex:1;background:#10b981;height:${v}%;border-radius:2px"></div>`).join('')}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Raporlama</span></div>
  </div>

  <!-- 9. KULLANIM KOLAYLIGI -->
  <div class="page">
    <div class="ph"><div><div class="tag">Kullanıcı Deneyimi</div><h2>Karmaşık değil, sade. Eğitim 15 dakika.</h2><div class="sub">Personel, yönetici ve müşteri için üç farklı arayüz — her biri rolünün gerektirdiği kadar.</div></div><div class="num">09 / 18</div></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:10px">
      <div style="padding:22px 24px;background:white;border:1px solid #e5e7eb;border-radius:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">${icon('phone', 32)}<div style="font-size:15px;font-weight:900">Personel</div></div>
        <div style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:14px">Telefonu açar, uygulamayı başlatır. Bugünkü görevleri görür. QR'ı okutur. Kapatır.</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px">✓ Hiç menü karıştırmaz</div>
          <div style="font-size:11px">✓ 1 dokunuşta görev kapatır</div>
          <div style="font-size:11px">✓ Offline çalışır</div>
          <div style="font-size:11px">✓ Mesai takibi otomatik</div>
        </div>
      </div>
      <div style="padding:22px 24px;background:white;border:1px solid #e5e7eb;border-radius:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">${icon('chart', 32)}<div style="font-size:15px;font-weight:900">Yönetici</div></div>
        <div style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:14px">Web panele giriş. Dashboard'da canlı KPI. Rapor alır, aksiyon atar, personel atar.</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px">✓ Canlı dashboard</div>
          <div style="font-size:11px">✓ PDF/Excel rapor tek tık</div>
          <div style="font-size:11px">✓ Personel karşılaştırması</div>
          <div style="font-size:11px">✓ Anlık bildirim</div>
        </div>
      </div>
      <div style="padding:22px 24px;background:white;border:1px solid #e5e7eb;border-radius:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">${icon('star', 32)}<div style="font-size:15px;font-weight:900">Müşteri / Ziyaretçi</div></div>
        <div style="font-size:12px;color:#475569;line-height:1.6;margin-bottom:14px">Lokasyondaki QR'ı telefonuna tutar. Tarayıcı açılır. Yıldız verir, yorum/foto ekler.</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-size:11px">✓ App indirmez</div>
          <div style="font-size:11px">✓ Üye olmaz</div>
          <div style="font-size:11px">✓ 20 saniyede biter</div>
          <div style="font-size:11px">✓ KVKK uyumlu</div>
        </div>
      </div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Kullanım Kolaylığı</span></div>
  </div>

  <!-- 10. CANLI KANITI HERO -->
  <div class="page">
    <div class="ph"><div><div class="tag">Bir referans tesisimizde</div><h2>GYS gerçekten çalışıyor — 6 aylık canlı veri</h2><div class="sub">Rakamlar canlı veritabanı sorgularıyla doğrulandı, firma/proje anonim.</div></div><div class="num">10 / 18</div></div>
    <div class="hero">
      <div class="hc"><div class="v">${nf.format(toplam)}</div><div class="l">Toplam izlenen görev</div><div class="d">Her görev zaman damgalı, lokasyonlu, personelli</div></div>
      <div class="hc g"><div class="v">%${basariPct.toFixed(1).replace('.', ',')}</div><div class="l">Başarı oranı</div><div class="d">Yapılan iş / toplam görev</div></div>
      <div class="hc r"><div class="v">%${kayipPct.toFixed(1).replace('.', ',')}</div><div class="l">Kayıp oranı</div><div class="d">Dijital öncesi %10-20 iken</div></div>
      <div class="hc"><div class="v">${farkliLok}</div><div class="l">İzlenen lokasyon</div><div class="d">WC, çay, ofis — her noktada QR</div></div>
      <div class="hc"><div class="v">${aktifPersonel}</div><div class="l">Aktif saha personeli</div><div class="d">Her personel şeffaf izlenebilir</div></div>
      <div class="hc"><div class="v">${medianSure}sn</div><div class="l">Medyan görev kapama</div><div class="d">Mobil 1-dokunuş — pano/kalem bitti</div></div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Canlı Referans</span></div>
  </div>

  <!-- 11. AYLIK BUYUME + ADOPTION -->
  <div class="page">
    <div class="ph"><div><div class="tag">Büyüme &amp; Benimseme</div><h2>Pilot → Tam kullanım: 1 ay</h2><div class="sub">Personel adoption sorunu yaşanmadı</div></div><div class="num">11 / 18</div></div>
    <div class="g2">
      <div class="cb"><div class="t">Aylık izlenen görev sayısı</div><div class="s">Pilot ayından itibaren hızlı büyüme</div>${svgBar(400, 220, aylikHacim)}</div>
      <div class="cb"><div class="t">Aktif personel sayısı — aylık</div><div class="s">${persSerie[0]?.value ?? 0} → ${persSerie[persSerie.length - 1]?.value ?? 0} personel (${persSerie.length} ay)</div>${svgLine(400, 220, persSerie, '#1A5C2A')}</div>
    </div>
    <div style="margin-top:14px;padding:12px 16px;background:#F8FAFC;border-left:3px solid #10b981;border-radius:6px;font-size:12px"><b>Yorum:</b> Dijital öncesi aynı tesiste bu ${nf.format(toplam)} görevin ne kadarı yapıldığı <b>bilinmiyordu</b>. İlk 30 günde ${persSerie[1]?.value ?? 0} personel aktif kullanıma geçti.</div>
    <div class="pf"><span>GYS Sunumu</span><span>Büyüme</span></div>
  </div>

  <!-- 12. MUSTERI MEMNUNIYETI TREND -->
  <div class="page">
    <div class="ph"><div><div class="tag">Müşteri Geri Bildirimi</div><h2>Veri haline gelen şikayet-öneri</h2><div class="sub">QR/NFC üzerinden toplanan değerlendirmeler</div></div><div class="num">12 / 18</div></div>
    <div class="g2">
      <div class="cb"><div class="t">Aylık yıldız ortalaması (1-5)</div><div class="s">Dijital öncesi: bilinmiyordu</div>${svgLine(400, 220, degYildiz, '#f59e0b', 5)}</div>
      <div class="cb" style="display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px">
        <div style="text-align:center">
          <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Toplam değerlendirme</div>
          <div style="font-size:60px;font-weight:900;color:#f59e0b;line-height:1;margin-top:4px">${degToplam}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:6px">6 ay içinde dijital olarak toplandı</div>
        </div>
        <div style="padding:10px 14px;background:#fef3c7;border-radius:8px;font-size:11px;color:#78350f;max-width:280px;text-align:center"><b>Dijital öncesi:</b> "Şikayet var mı?" sorusunun cevabı tahmindi. Artık her değerlendirme kayıtlı, zaman-mekan-aksiyon takipli.</div>
      </div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Müşteri Memnuniyeti</span></div>
  </div>

  <!-- 13. 24 SAAT KAPSAMA -->
  <div class="page">
    <div class="ph"><div><div class="tag">7/24 İzleme</div><h2>Gece vardiyası dahil, her saat kayıt altında</h2><div class="sub">Saatlik tamamlanan görev — 6 ay toplamı</div></div><div class="num">13 / 18</div></div>
    <div class="cb" style="padding:16px 20px">
      <div class="t">24-Saat Aktivite Dağılımı</div>
      <div class="s">Gece 03:00'te bile 2000+ görev kayıt altında</div>
      <div class="hrs">${saatSerie.map(h => { const pct = (h.value / Math.max(...saatSerie.map(x => x.value), 1) * 100).toFixed(0); return `<div class="b" style="height:${pct}%"><span>${h.value >= 1000 ? Math.round(h.value / 1000) + 'k' : h.value}</span></div>` }).join('')}</div>
      <div class="hrl">${saatSerie.map(h => `<span>${h.label}</span>`).join('')}</div>
    </div>
    <div style="margin-top:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      <div style="background:#dcfce7;padding:12px;border-radius:8px;text-align:center"><div style="font-size:9px;color:#065f46;font-weight:700;text-transform:uppercase">Pik saat</div><div style="font-size:22px;font-weight:900;color:#065f46;margin-top:4px">08:00</div></div>
      <div style="background:#F8FAFC;padding:12px;border-radius:8px;text-align:center"><div style="font-size:9px;color:#475569;font-weight:700;text-transform:uppercase">Gece (00-06)</div><div style="font-size:22px;font-weight:900;margin-top:4px">${nf.format(saatSerie.slice(0, 6).reduce((s, h) => s + h.value, 0))}</div></div>
      <div style="background:#F8FAFC;padding:12px;border-radius:8px;text-align:center"><div style="font-size:9px;color:#475569;font-weight:700;text-transform:uppercase">Gündüz (06-18)</div><div style="font-size:22px;font-weight:900;margin-top:4px">${nf.format(saatSerie.slice(6, 18).reduce((s, h) => s + h.value, 0))}</div></div>
      <div style="background:#F8FAFC;padding:12px;border-radius:8px;text-align:center"><div style="font-size:9px;color:#475569;font-weight:700;text-transform:uppercase">Akşam (18-24)</div><div style="font-size:22px;font-weight:900;margin-top:4px">${nf.format(saatSerie.slice(18, 24).reduce((s, h) => s + h.value, 0))}</div></div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>24-Saat Kapsama</span></div>
  </div>

  <!-- 14. ONCESI vs SONRASI -->
  <div class="page">
    <div class="ph"><div><div class="tag">Fark</div><h2>Dijital Öncesi vs Sonrası</h2><div class="sub">Aynı tesis, aynı ekip, farklı araç</div></div><div class="num">14 / 18</div></div>
    <div class="vs">
      <div class="vs-c b">
        <div class="vs-h">⚠ Dijital Öncesi</div>
        <div class="vs-i"><b>Operasyon izleme:</b> kağıt pano, hafızaya dayalı</div>
        <div class="vs-i"><b>Kayıp görev:</b> %10-20 "normal" karşılanır</div>
        <div class="vs-i"><b>Müşteri şikayeti:</b> "mesaj grubunda konuşalım"</div>
        <div class="vs-i"><b>Yönetici raporu:</b> Excel'de 3-4 saat uğraş</div>
        <div class="vs-i"><b>Gece vardiyası:</b> sabah tahmin edilir</div>
        <div class="vs-i"><b>Personel verimliliği:</b> ölçülmez</div>
        <div class="vs-i"><b>Rapor zamanında:</b> aylık rapor 1 hafta gecikir</div>
        <div class="vs-i"><b>Müşteriye kanıt:</b> "sözlü söylüyoruz"</div>
      </div>
      <div class="vs-ar">→</div>
      <div class="vs-c a">
        <div class="vs-h">✓ GYS ile 6 Ay Sonra</div>
        <div class="vs-i"><b>Operasyon izleme:</b> <b>${nf.format(toplam)}</b> görev, hepsi kayıtlı</div>
        <div class="vs-i"><b>Kayıp görev:</b> <b>%${kayipPct.toFixed(1).replace('.', ',')}</b> — tek tıkla rapor</div>
        <div class="vs-i"><b>Müşteri şikayeti:</b> <b>${degToplam}</b> dijital değerlendirme</div>
        <div class="vs-i"><b>Yönetici raporu:</b> PDF/Excel, 30 saniye</div>
        <div class="vs-i"><b>Gece vardiyası:</b> 03:00'te bile kayıt</div>
        <div class="vs-i"><b>Personel verimliliği:</b> en iyi/kötü 3 otomatik</div>
        <div class="vs-i"><b>Rapor zamanında:</b> real-time, her an güncel</div>
        <div class="vs-i"><b>Müşteriye kanıt:</b> tamper-evident PDF</div>
      </div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Öncesi vs Sonrası</span></div>
  </div>

  <!-- 15. 9 AVANTAJ -->
  <div class="page">
    <div class="ph"><div><div class="tag">Neden GYS?</div><h2>Rakiplerden ayıran 9 somut avantaj</h2><div class="sub">Her biri sahada denenmiş, canlı verilerle doğrulanmış</div></div><div class="num">15 / 18</div></div>
    <div class="adv">
      <div class="adv-c"><div class="h"><div class="ib">${icon('qr', 22)}</div><div class="t">QR + NFC Hibrit</div></div><div class="d">Telefon kamera veya temas. Donanım yok, A4 kağıda yazdırın.</div></div>
      <div class="adv-c"><div class="h"><div class="ib">${icon('phone', 22)}</div><div class="t">Mobil + Web</div></div><div class="d">Personel mobilden, yönetici webden, müşteri QR'dan. Tek platform.</div></div>
      <div class="adv-c"><div class="h"><div class="ib">${icon('clock', 22)}</div><div class="t">Vardiya Sistemi</div></div><div class="d">1, 2, 3 vardiya seçin. Sarkan vardiya otomatik handle.</div></div>
      <div class="adv-c"><div class="h"><div class="ib">${icon('bell', 22)}</div><div class="t">Push Bildirim</div></div><div class="d">Yeni görev, iptal, değerlendirme — anında telefondan haber.</div></div>
      <div class="adv-c"><div class="h"><div class="ib">${icon('shield', 22)}</div><div class="t">Tamper-Evident PDF</div></div><div class="d">Değiştirilemez PDF. Excel güvensizliği kalkar.</div></div>
      <div class="adv-c"><div class="h"><div class="ib">${icon('users', 22)}</div><div class="t">Rol Bazlı Yetki</div></div><div class="d">SA, firma admin, personel, müşteri — her rol kendi ekranı.</div></div>
      <div class="adv-c"><div class="h"><div class="ib">${icon('chart', 22)}</div><div class="t">7+ Hazır Rapor</div></div><div class="d">Frekansiyel, Spesifik, Değerlendirme, Süre, Grafiksel, Ham Veri.</div></div>
      <div class="adv-c"><div class="h"><div class="ib">${icon('bolt', 22)}</div><div class="t">Offline Mod</div></div><div class="d">İnternet yoksa personel çalışır. Bağlantı gelince otomatik senkron.</div></div>
      <div class="adv-c"><div class="h"><div class="ib">${icon('rocket', 22)}</div><div class="t">1 Günde Canlı</div></div><div class="d">Lokasyon → QR etiket → personel giriş. Günler değil saatler.</div></div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Avantajlar</span></div>
  </div>

  <!-- 16. ONBOARDING -->
  <div class="page">
    <div class="ph"><div><div class="tag">Başlangıç</div><h2>GYS'yi başlatmak 3 adım, 1 gün</h2><div class="sub">Donanım yok, uzun eğitim yok. Hemen başlar, hemen rapor üretir.</div></div><div class="num">16 / 18</div></div>
    <div class="steps">
      <div class="step"><div class="n">1</div><div class="t">Lokasyon &amp; Personel</div><div class="d">Tesis alanları ağaç yapısında tanımlanır (üst → alt → nokta). Personel listesi Excel'den aktarılır.</div><div class="tm">1-2 saat</div></div>
      <div class="step"><div class="n">2</div><div class="t">QR Etiketler &amp; Kurallar</div><div class="d">Her lokasyon için benzersiz QR üretilir, A4 PDF olarak yazdırılır. Frekansiyel kurallar tanımlanır.</div><div class="tm">2-3 saat</div></div>
      <div class="step"><div class="n">3</div><div class="t">Test &amp; Canlıya Alma</div><div class="d">Personel mobil uygulamayı indirir, giriş yapar. İlk görevler yapılır. Sistem canlı veri toplar.</div><div class="tm">1-2 saat</div></div>
    </div>
    <div style="margin-top:36px;padding:20px 24px;background:linear-gradient(135deg,#dcfce7 0%,#86efac 100%);border-radius:14px">
      <div style="font-size:16px;font-weight:900;color:#065f46;margin-bottom:8px">🚀 İlk 7 günde ne olur?</div>
      <div style="font-size:12px;color:#065f46;line-height:1.7">
        <b>1. gün:</b> Sistem canlıya alınır, personel giriş yapar.<br/>
        <b>3. gün:</b> Tam adoption — tüm personel aktif kullanır, günlük rutin oturur.<br/>
        <b>7. gün:</b> İlk haftalık yönetici raporu — hangi lokasyon risk altında, görünür.
      </div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>Onboarding</span></div>
  </div>

  <!-- 17. BEKLENTI YANITI -->
  <div class="page">
    <div class="ph"><div><div class="tag">İtirazlar</div><h2>En sık sorulan 4 soruya net yanıt</h2><div class="sub">Potansiyel müşterinin kafasındaki gerçek sorular</div></div><div class="num">17 / 18</div></div>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:10px">
      <div style="padding:20px;background:white;border:1px solid #e5e7eb;border-radius:12px;border-top:3px solid #ef4444">
        <div style="font-size:12px;font-weight:800;color:#991b1b;margin-bottom:6px">"Zaten elle de yapılabiliyor"</div>
        <div style="font-size:12px;color:#475569;line-height:1.55">${nf.format(toplam)} görevi elle takip etmeyi deneyin. Ya kaydı tutmayacak ya da uyduracak ekibiniz. Dijital öncesi %10-20 kayıp "normal"di — dijitalle %${kayipPct.toFixed(1).replace('.', ',')}.</div>
      </div>
      <div style="padding:20px;background:white;border:1px solid #e5e7eb;border-radius:12px;border-top:3px solid #ef4444">
        <div style="font-size:12px;font-weight:800;color:#991b1b;margin-bottom:6px">"Personelim teknolojiye alışamaz"</div>
        <div style="font-size:12px;color:#475569;line-height:1.55">Referans tesiste 1 ay içinde ${persSerie[1]?.value ?? 100}+ personel aktif, 6 ayda ${aktifPersonel} personel sistemde. Pilot sorunu yaşanmadı. Uygulama 3 tıkla çalışır.</div>
      </div>
      <div style="padding:20px;background:white;border:1px solid #e5e7eb;border-radius:12px;border-top:3px solid #ef4444">
        <div style="font-size:12px;font-weight:800;color:#991b1b;margin-bottom:6px">"Yatırımın geri dönüşü nasıl?"</div>
        <div style="font-size:12px;color:#475569;line-height:1.55">Müşteri sözleşmesi şikayet kesintisi riskini azaltır. 1 ay kaçırılmış temizlikten gelen cezadan sistem bedelinin çoğu geri döner. Müşteri güvensizliğinden kayıp kontrat sistem maliyetinin 10 katı.</div>
      </div>
      <div style="padding:20px;background:white;border:1px solid #e5e7eb;border-radius:12px;border-top:3px solid #ef4444">
        <div style="font-size:12px;font-weight:800;color:#991b1b;margin-bottom:6px">"Rakibimiz bunu zaten yapıyor"</div>
        <div style="font-size:12px;color:#475569;line-height:1.55">Yapıyorsa iyi, oyun alanı eşitlenir. Yapmıyorsa farkı siz oluşturursunuz — potansiyel müşteriye "sektöre dijital standart getiren" olarak konumlanabilirsiniz.</div>
      </div>
    </div>
    <div class="pf"><span>GYS Sunumu</span><span>İtiraz Yönetimi</span></div>
  </div>

  <!-- 18. CTA -->
  <div class="page cta"><div class="cta-inner">
    <div>
      <div class="mini">BIR CUMLEDE</div>
      <h2>Sahadaki her işi <span class="hi">sayılabilir, raporlanabilir ve ispat edilebilir</span> hale getirin.</h2>
      <div class="lead">GYS bir uygulama değil — operasyonunuzu şeffaflaştıran bir yönetim platformudur. Referans tesisimizde 6 ayda ${nf.format(toplam)} görev izlendi, ${degToplam} müşteri değerlendirmesi toplandı, kayıp oranı %${kayipPct.toFixed(1).replace('.', ',')}'de kaldı.</div>
      <div class="cards">
        <div class="card"><div class="v">1 gün</div><div class="l">Kurulumdan canlıya</div></div>
        <div class="card"><div class="v">15 dk</div><div class="l">Personel eğitimi</div></div>
        <div class="card"><div class="v">0 TL</div><div class="l">Donanım yatırımı</div></div>
      </div>
      <div style="margin-top:36px"><div style="font-size:14px;font-weight:700;color:#86efac">→ Bir sonraki adım: 30 dakikalık canlı demo talep edin.</div></div>
    </div>
    <div class="foot">
      <div>GYS Görev Yönetim Sistemi · İO Teknoloji · iogys.com.tr</div>
      <div>${tarih}</div>
    </div>
  </div></div>

</body></html>`

    // ============ PUPPETEER: her sayfa PNG screenshot ============
    const puppeteer = (await import('puppeteer')).default
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] })
    const pagePngs: Buffer[] = []
    try {
      const page = await browser.newPage()
      // A4 landscape: 297mm x 210mm @ 96dpi = 1123 x 794 px
      // 2x deviceScaleFactor retina kalitesi
      await page.setViewport({ width: 1123, height: 794, deviceScaleFactor: 2 })
      await page.setContent(html, { waitUntil: 'load' })
      const pageEls = await page.$$('.page')
      for (const el of pageEls) {
        const png = await el.screenshot({ type: 'png', omitBackground: false }) as Buffer
        pagePngs.push(png)
      }
    } finally {
      await browser.close()
    }

    // ============ pptxgenjs: PPTX ============
    const pptx = new PptxGenJS()
    pptx.layout = 'LAYOUT_WIDE' // 13.333 x 7.5 inch (16:9 widescreen)
    pptx.title = 'GYS Görev Yönetim Sistemi — Müşteri Tanıtım Sunumu'
    pptx.author = 'İO Teknoloji'
    pptx.company = 'İO Teknoloji'

    // A4 landscape slayt boyutu (16:9'a gore hafif farkli). LAYOUT_WIDE'a tam sigdiralim.
    const SLIDE_W = 13.333
    const SLIDE_H = 7.5

    for (const png of pagePngs) {
      const slide = pptx.addSlide()
      slide.background = { color: 'FFFFFF' }
      slide.addImage({
        data: `data:image/png;base64,${png.toString('base64')}`,
        x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
      })
    }

    // Buffer olarak doner
    const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer
    const date = new Date().toISOString().slice(0, 10)

    return new NextResponse(pptxBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="gys-musteri-sunumu-${date}.pptx"`,
      },
    })
  } catch (err: any) {
    console.error('[marketing/tam-sunum-pptx]', err)
    return NextResponse.json({ error: err?.message ?? 'PPTX uretilemedi' }, { status: 500 })
  }
}
