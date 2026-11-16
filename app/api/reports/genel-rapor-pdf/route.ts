/**
 * GET /api/reports/genel-rapor-pdf?firmaId=...
 *
 * Server-side HTML template + Puppeteer → A4 PDF.
 * İÇERİK: Özet KPI + Grafikler (pie + departman barlari) + Grup Metrikleri.
 * Detay listeler (Tamamlanan/Sapma/Kayıp/Frekans Dışı) BU PDF'TE YER ALMAZ —
 * 15 günlük büyük raporda 20K satır Puppeteer'ı dakikalarca uğraştırıp
 * timeout'a sürüklüyordu. Detay için Excel İndir kullanılır.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGenelRaporData } from '@/lib/reports/genel-rapor-data'

export const runtime = 'nodejs'
export const maxDuration = 60

function esc(s: any): string {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!))
}

// SVG donut chart jeneratoru. Slices [{label, value, color}] alir, cember
// yayinda path cizer. toplam=0 ise bos donut doner.
function svgDonut(size: number, slices: { label: string; value: number; color: string }[], centerValue: string, centerLabel: string): string {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 2
  const rInner = rOuter * 0.62
  let paths = ''
  if (total <= 0) {
    paths = `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="#e5e7eb" />
             <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="#ffffff" />`
  } else {
    let acc = 0
    for (const s of slices) {
      const v = Math.max(0, s.value)
      if (v <= 0) continue
      const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2
      const a2 = ((acc + v) / total) * Math.PI * 2 - Math.PI / 2
      acc += v
      const large = (a2 - a1) > Math.PI ? 1 : 0
      const x1 = cx + rOuter * Math.cos(a1)
      const y1 = cy + rOuter * Math.sin(a1)
      const x2 = cx + rOuter * Math.cos(a2)
      const y2 = cy + rOuter * Math.sin(a2)
      const xi1 = cx + rInner * Math.cos(a2)
      const yi1 = cy + rInner * Math.sin(a2)
      const xi2 = cx + rInner * Math.cos(a1)
      const yi2 = cy + rInner * Math.sin(a1)
      // Tam cember tek slice (360deg) -> path bozulur, iki yarim cember ciz
      if (v === total) {
        paths += `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="${s.color}" />
                  <circle cx="${cx}" cy="${cy}" r="${rInner}" fill="#ffffff" />`
      } else {
        paths += `<path d="M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${rInner} ${rInner} 0 ${large} 0 ${xi2} ${yi2} Z" fill="${s.color}" />`
      }
    }
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${paths}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="${size * 0.14}" font-weight="900" fill="#111827">${esc(centerValue)}</text>
    <text x="${cx}" y="${cy + size * 0.1}" text-anchor="middle" font-size="${size * 0.07}" font-weight="600" fill="#6b7280">${esc(centerLabel)}</text>
  </svg>`
}

// Departman karti: ust lokasyon icin 3-bar yatay cubuk grafik.
function departmanCard(d: { ustLokasyonAd: string; hedef: number; tamamlanan: number; sapma: number; kayip: number }): string {
  const max = Math.max(d.hedef, d.tamamlanan + d.sapma + d.kayip, 1)
  const pctBar = (v: number) => `${(Math.max(0, v) / max * 100).toFixed(1)}%`
  const basari = d.hedef > 0 ? ((d.tamamlanan + d.sapma) / d.hedef * 100).toFixed(0) : '0'
  return `
    <div class="dep-card">
      <div class="dep-head">
        <span class="dep-name">${esc(d.ustLokasyonAd)}</span>
        <span class="dep-hedef">Hedef: ${d.hedef}</span>
      </div>
      <div class="dep-bars">
        <div class="dep-row"><span class="dep-label">Tamam</span><div class="dep-bar"><div class="dep-fill tam" style="width:${pctBar(d.tamamlanan)}"></div></div><span class="dep-val">${d.tamamlanan}</span></div>
        <div class="dep-row"><span class="dep-label">Sapma</span><div class="dep-bar"><div class="dep-fill sap" style="width:${pctBar(d.sapma)}"></div></div><span class="dep-val">${d.sapma}</span></div>
        <div class="dep-row"><span class="dep-label">Kayıp</span><div class="dep-bar"><div class="dep-fill kay" style="width:${pctBar(d.kayip)}"></div></div><span class="dep-val">${d.kayip}</span></div>
      </div>
      <div class="dep-foot">Başarı: <b>%${basari}</b></div>
    </div>
  `
}

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 })

    const p = new URL(request.url).searchParams
    const firmaId = p.get('firmaId')
    if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    // PDF özet-only: detay satirlari (tamamlanan/sapma/kayip/frekans_disi gorev
    // listeleri) cekilmez. Grup Metrikleri + departmanMetrikleri agg'leri yine
    // hesaplanir. Büyük raporda bu tek degisiklik backend hizini 10x+ artirir.
    const data = await buildGenelRaporData({
      firmaId,
      projeId:          p.get('projeId')          || null,
      ustLokasyonId:    p.get('ustLokasyonId')    || null,
      altLokasyonId:    p.get('altLokasyonId')    || null,
      altAltLokasyonId: p.get('altAltLokasyonId') || null,
      raporBaslangic: p.get('raporBaslangic') || null,
      raporBitis:     p.get('raporBitis')     || null,
      raporuAlan:     p.get('raporuAlan')     || null,
      vardiya: (p.get('vardiya') as any) || 'all',
      includeDetails: false,
    })

    const toplamHedef       = data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0) || data.toplamGorev
    const toplamEks         = data.toplamEkstra ?? 0
    const toplamTamKural    = data.toplamTamamlanan - toplamEks
    const toplamGerceklesen = toplamTamKural + data.toplamSapma + toplamEks
    const fmtPct = (v: number, t: number) =>
      t > 0 ? `%${(v / t * 100).toFixed(2).replace('.', ',')}` : '%0,00'
    const genelOran = fmtPct(toplamGerceklesen, toplamHedef)
    const basariOran = fmtPct(toplamTamKural + data.toplamSapma, toplamHedef)
    const basariNum = toplamHedef > 0 ? Math.round((toplamTamKural + data.toplamSapma) / toplamHedef * 100) : 0

    const departmanlar = data.ozetAgg?.departmanMetrikleri ?? []

    const css = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', -apple-system, sans-serif; color: #111827; font-size: 11px; }
      .page { page-break-after: always; padding: 14px 18px; }
      .page:last-child { page-break-after: auto; }
      h1 { font-size: 18px; font-weight: 800; margin-bottom: 6px; color: #0F1A0F; }
      h2 { font-size: 13px; font-weight: 700; margin: 10px 0 8px; color: #1A5C2A; border-bottom: 2px solid #1A5C2A; padding-bottom: 3px; text-transform: uppercase; letter-spacing: 0.04em; }
      .meta { display: grid; grid-template-columns: 110px 1fr 110px 1fr; gap: 4px 12px; background: #EFF6FF; padding: 8px 12px; border-radius: 4px; font-size: 10.5px; margin: 8px 0 12px; }
      .meta b { color: #475569; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      thead { background: #1A5C2A; color: white; }
      th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
      thead th { font-weight: 700; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; }
      tbody tr:nth-child(even) { background: #F8FAFC; }
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 14px; }
      .kpi { background: #F8FAFC; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; text-align: center; }
      .kpi .label { font-size: 9.5px; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
      .kpi .value { font-size: 18px; font-weight: 900; color: #111827; margin-top: 4px; }

      .genel-oran-wrap { margin: 10px 0 14px; }
      .genel-oran-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; font-size: 11px; }
      .genel-oran-bar { height: 16px; background: #f3f4f6; border-radius: 4px; overflow: hidden; display: flex; }
      .genel-oran-bar > div { height: 100%; }
      .gob-tam { background: #10b981; }
      .gob-sap { background: #f59e0b; }
      .gob-eks { background: #9ca3af; }
      .gob-kay { background: #ef4444; }
      .genel-oran-legend { display: flex; gap: 10px; margin-top: 6px; font-size: 9.5px; color: #475569; flex-wrap: wrap; }
      .genel-oran-legend .sq { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 3px; vertical-align: middle; }

      .pie-wrap { display: grid; grid-template-columns: 280px 1fr; gap: 20px; align-items: center; margin: 10px 0; }
      .pie-legend { display: flex; flex-direction: column; gap: 5px; font-size: 11px; }
      .pie-legend .row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #F8FAFC; border-radius: 4px; }
      .pie-legend .row .lbl { display: flex; align-items: center; gap: 6px; color: #374151; font-weight: 600; }
      .pie-legend .row .sq { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
      .pie-legend .row .val { font-weight: 900; color: #111827; font-size: 12px; }
      .pie-legend .row .pct { color: #6b7280; font-weight: 600; margin-left: 4px; font-size: 10px; }

      .dep-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .dep-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; background: #ffffff; }
      .dep-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
      .dep-name { font-size: 11px; font-weight: 800; color: #111827; text-transform: uppercase; letter-spacing: 0.03em; }
      .dep-hedef { font-size: 9px; color: #6b7280; font-weight: 600; }
      .dep-bars { display: flex; flex-direction: column; gap: 3px; }
      .dep-row { display: grid; grid-template-columns: 40px 1fr 36px; gap: 5px; align-items: center; font-size: 9px; }
      .dep-label { color: #6b7280; font-weight: 600; }
      .dep-bar { height: 8px; background: #f3f4f6; border-radius: 3px; overflow: hidden; }
      .dep-fill { height: 100%; border-radius: 3px; }
      .dep-fill.tam { background: #10b981; }
      .dep-fill.sap { background: #f59e0b; }
      .dep-fill.kay { background: #ef4444; }
      .dep-val { font-size: 9.5px; font-weight: 800; color: #374151; text-align: right; }
      .dep-foot { margin-top: 5px; text-align: right; font-size: 9px; color: #6b7280; }
      .dep-foot b { color: #1A5C2A; font-weight: 900; }

      .footer { margin-top: 10px; font-size: 9px; color: #9ca3af; text-align: center; }
      .info-note { margin-top: 6px; padding: 6px 10px; background: #FEF3C7; border-left: 3px solid #F59E0B; border-radius: 3px; font-size: 10px; color: #78350F; }
    `

    // Pie chart slices: Tamamlandi (sadece kural) + Sapma + Frekans Disi + Kayip
    const pieSlices = [
      { label: 'Tamamlanan',   value: toplamTamKural,  color: '#10b981' },
      { label: 'Sapma',        value: data.toplamSapma, color: '#f59e0b' },
      { label: 'Frekans Dışı', value: toplamEks,        color: '#9ca3af' },
      { label: 'Kayıp',        value: data.toplamKayip, color: '#ef4444' },
    ]
    const pieTotal = pieSlices.reduce((s, x) => s + Math.max(0, x.value), 0) || toplamHedef

    // Genel Oran bar: hedef uzunluk referans; her parca kendi yuzdesi.
    const gobTamPct = toplamHedef > 0 ? (toplamTamKural / toplamHedef * 100).toFixed(2) : '0'
    const gobSapPct = toplamHedef > 0 ? (data.toplamSapma / toplamHedef * 100).toFixed(2) : '0'
    const gobEksPct = toplamHedef > 0 ? (toplamEks / toplamHedef * 100).toFixed(2) : '0'
    const gobKayPct = toplamHedef > 0 ? (data.toplamKayip / toplamHedef * 100).toFixed(2) : '0'

    const kpiCards = `
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Hedef Frekans</div><div class="value">${toplamHedef}</div></div>
        <div class="kpi"><div class="label">Gerçekleşen</div><div class="value">${toplamGerceklesen}</div></div>
        <div class="kpi"><div class="label">Tamamlanan</div><div class="value">${toplamTamKural}</div></div>
        <div class="kpi"><div class="label">Sapma</div><div class="value">${data.toplamSapma}</div></div>
        <div class="kpi"><div class="label">Frekans Dışı</div><div class="value">${toplamEks}</div></div>
        <div class="kpi"><div class="label">Kayıp</div><div class="value">${data.toplamKayip}</div></div>
        <div class="kpi"><div class="label">Başarı</div><div class="value">${basariOran}</div></div>
        <div class="kpi"><div class="label">Genel Oran</div><div class="value">${genelOran}</div></div>
      </div>
    `

    const genelOranBar = `
      <div class="genel-oran-wrap">
        <div class="genel-oran-head"><span><b>Genel Oran:</b> ${toplamGerceklesen} gerçekleşen / ${toplamHedef} hedef</span><span><b>${genelOran}</b></span></div>
        <div class="genel-oran-bar">
          <div class="gob-tam" style="width:${gobTamPct}%"></div>
          <div class="gob-sap" style="width:${gobSapPct}%"></div>
          <div class="gob-eks" style="width:${gobEksPct}%"></div>
          <div class="gob-kay" style="width:${gobKayPct}%"></div>
        </div>
        <div class="genel-oran-legend">
          <span><span class="sq" style="background:#10b981"></span>Tamamlanan %${gobTamPct}</span>
          <span><span class="sq" style="background:#f59e0b"></span>Sapma %${gobSapPct}</span>
          <span><span class="sq" style="background:#9ca3af"></span>Frekans Dışı %${gobEksPct}</span>
          <span><span class="sq" style="background:#ef4444"></span>Kayıp %${gobKayPct}</span>
        </div>
      </div>
    `

    const pieLegendRows = pieSlices.map(s => {
      const pct = pieTotal > 0 ? `%${(Math.max(0, s.value) / pieTotal * 100).toFixed(1)}` : '%0,0'
      return `<div class="row">
        <span class="lbl"><span class="sq" style="background:${s.color}"></span>${esc(s.label)}</span>
        <span><span class="val">${s.value}</span><span class="pct">${pct}</span></span>
      </div>`
    }).join('')

    const pieBlock = `
      <div class="pie-wrap">
        <div>${svgDonut(240, pieSlices, `%${basariNum}`, 'Başarı')}</div>
        <div class="pie-legend">${pieLegendRows}</div>
      </div>
    `

    const departmanBlock = departmanlar.length === 0
      ? `<p style="color:#6b7280; font-size:10px; margin:10px 0;">Departman verisi yok.</p>`
      : `<div class="dep-grid">${departmanlar.map(departmanCard).join('')}</div>`

    const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>Frekansiyel Görevler Raporu</title><style>${css}</style></head>
<body>
  <!-- Sayfa 1: Özet & Genel Oran -->
  <div class="page">
    <h1>Frekansiyel Görevler Raporu</h1>
    <div class="meta">
      <b>Firma:</b><span>${esc(data.firmaAdi || '—')}</span>
      <b>Proje:</b><span>${esc(data.projeAdi || '—')}</span>
      <b>Üst Lokasyon:</b><span>${esc(data.ustLokTanim || 'Tümü')}</span>
      <b>Alt Lokasyon:</b><span>${esc(data.altLokTanim || 'Tümü')}</span>
      <b>Dönem:</b><span>${esc(data.raporTarihLabel || '—')}</span>
      <b>Gün Sayısı:</b><span>${data.gunSayisi}</span>
      <b>Raporu Alan:</b><span>${esc(data.raporuAlan || '—')}</span>
      <b>Tarih:</b><span>${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</span>
    </div>
    ${kpiCards}
    ${genelOranBar}
    <h2>Genel Dağılım</h2>
    ${pieBlock}
    <div class="info-note">Detay görev listeleri (Tamamlanan / Sapma / Kayıp / Frekans Dışı) bu PDF'te yer almaz — tam listeyi <b>Excel İndir</b> ile alabilirsiniz.</div>
  </div>

  <!-- Sayfa 2: Departman Analizi -->
  <div class="page">
    <h2>Departman Analizi</h2>
    ${departmanBlock}
  </div>

  <!-- Sayfa 3: Grup Metrikleri tablosu -->
  <div class="page">
    <h2>Grup Metrikleri</h2>
    <table>
      <thead><tr>
        <th>SN</th><th>Grup</th><th>Üst Lok.</th><th>Lokasyon</th><th>V.Frekans</th>
        <th>Hedef</th><th>Tamam.</th><th>Frekans Dışı</th><th>Sapma</th><th>Kayıp</th><th>Başarı</th><th>Genel</th>
      </tr></thead>
      <tbody>${data.grupMetrikleri.map((g, i) => `<tr>
        <td>${i + 1}</td><td>${esc(g.grup)}</td><td>${esc(g.ustLokasyon)}</td><td>${esc(g.lokasyon)}</td>
        <td>${esc(g.gunlukFrekans)}</td><td>${g.hedef}</td><td>${g.tamamlanan}</td><td>${g.ekstra ?? 0}</td>
        <td>${g.sapma}</td><td>${g.kayip}</td><td>${esc(g.basariOrani)}</td><td>${esc(g.genelOran)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div class="footer">QR-Sync · İO-GYS · ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</div>
  </div>
</body></html>`

    const puppeteer = (await import('puppeteer')).default
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    try {
      const page = await browser.newPage()
      // 'load' event 'networkidle0'dan daha hizli; HTML'de external network
      // kaynagi yok (tum SVG inline) -> load yeterli.
      await page.setContent(html, { waitUntil: 'load' })
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '8mm', right: '8mm', bottom: '10mm', left: '8mm' },
      })

      const date = new Date().toISOString().slice(0, 10)
      return new NextResponse(pdf as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="frekansiyel-rapor-${date}.pdf"`,
        },
      })
    } finally {
      await browser.close()
    }
  } catch (err: any) {
    console.error('[genel-rapor-pdf]', err)
    return NextResponse.json({ error: err?.message ?? 'PDF oluşturma hatası' }, { status: 500 })
  }
}
