/**
 * GET /api/reports/genel-rapor-pdf?firmaId=...
 *
 * Server-side HTML template + Puppeteer → A4 LANDSCAPE PDF, iki sayfa:
 *   Sayfa 1 (5 blok alt alta):
 *     1. Genel Performans Özeti
 *     2. Departman Analizi
 *     3. Frekans Dağılımı & Grup Bazlı Tamamlanan
 *     4. Sapma Frekanslar
 *     5. Kayıp Frekanslar
 *   Sayfa 2: Grup Metrikleri tablosu (yatay, compact)
 * Detay görev listeleri yok — tam liste için Excel İndir.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGenelRaporData } from '@/lib/reports/genel-rapor-data'

export const runtime = 'nodejs'
export const maxDuration = 60

function esc(s: any): string {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!))
}

// SVG donut chart. Slices [{label,value,color}]; toplam=0 ise bos gri cember.
function svgDonut(size: number, slices: { label: string; value: number; color: string }[], centerValue: string, centerLabel: string): string {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 2
  const rInner = rOuter * 0.60
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
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="${size * 0.22}" font-weight="900" fill="#111827">${esc(centerValue)}</text>
    <text x="${cx}" y="${cy + size * 0.18}" text-anchor="middle" font-size="${size * 0.1}" font-weight="600" fill="#6b7280">${esc(centerLabel)}</text>
  </svg>`
}

// Yatay cubuk listesi. Gruplari relative bar + rakam ile tek-sutun olarak basar.
function barList(items: { label: string; value: number }[], color: string): string {
  if (items.length === 0) return `<div class="empty">Veri yok</div>`
  const sorted = [...items].sort((a, b) => b.value - a.value)
  const max = Math.max(...sorted.map(x => x.value), 1)
  return sorted.map(it => `
    <div class="bar-row">
      <span class="bar-label">${esc(it.label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(it.value / max * 100).toFixed(1)}%;background:${color}"></div></div>
      <span class="bar-val">${it.value}</span>
    </div>
  `).join('')
}

// Departman mini-card: 3 cubuk (Tamam/Sapma/Kayip) + hedef + basari.
function departmanCard(d: { ustLokasyonAd: string; hedef: number; tamamlanan: number; sapma: number; kayip: number }): string {
  const max = Math.max(d.hedef, d.tamamlanan + d.sapma + d.kayip, 1)
  const bar = (v: number) => `${(Math.max(0, v) / max * 100).toFixed(1)}%`
  const basari = d.hedef > 0 ? ((d.tamamlanan + d.sapma) / d.hedef * 100).toFixed(0) : '0'
  return `
    <div class="dep-card">
      <div class="dep-head">
        <span class="dep-name">${esc(d.ustLokasyonAd)}</span>
        <span class="dep-hedef">H: ${d.hedef}</span>
      </div>
      <div class="dep-bars">
        <div class="dep-row"><span class="dep-lbl">T</span><div class="dep-track"><div class="dep-fill tam" style="width:${bar(d.tamamlanan)}"></div></div><span class="dep-v">${d.tamamlanan}</span></div>
        <div class="dep-row"><span class="dep-lbl">S</span><div class="dep-track"><div class="dep-fill sap" style="width:${bar(d.sapma)}"></div></div><span class="dep-v">${d.sapma}</span></div>
        <div class="dep-row"><span class="dep-lbl">K</span><div class="dep-track"><div class="dep-fill kay" style="width:${bar(d.kayip)}"></div></div><span class="dep-v">${d.kayip}</span></div>
      </div>
      <div class="dep-foot"><b>%${basari}</b></div>
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
    const basariNum = toplamHedef > 0 ? Math.round((toplamTamKural + data.toplamSapma + toplamEks) / toplamHedef * 100) : 0

    const departmanlar = data.ozetAgg?.departmanMetrikleri ?? []

    // Grup bazli agg — frontend ozetData.grupBazli ile ayni formul
    const grupAgg = new Map<string, { tamamlanan: number; hedef: number; sapma: number; kayip: number; frekansDisi: number }>()
    for (const g of data.grupMetrikleri) {
      const ex = grupAgg.get(g.grup) ?? { tamamlanan: 0, hedef: 0, sapma: 0, kayip: 0, frekansDisi: 0 }
      grupAgg.set(g.grup, {
        tamamlanan: ex.tamamlanan + g.tamamlanan,
        hedef: ex.hedef + g.hedef,
        sapma: ex.sapma + g.sapma,
        kayip: ex.kayip + g.kayip,
        frekansDisi: ex.frekansDisi + (g.ekstra ?? 0),
      })
    }
    const grupBazli = [...grupAgg.entries()].map(([grup, v]) => ({ grup, ...v }))

    // Pie slices
    const freqPieSlices = [
      { label: 'Tamamlanan',   value: toplamTamKural,   color: '#10b981' },
      { label: 'Sapma',        value: data.toplamSapma, color: '#f59e0b' },
      { label: 'Frekans Dışı', value: toplamEks,        color: '#9ca3af' },
      { label: 'Kayıp',        value: data.toplamKayip, color: '#ef4444' },
    ]
    const sapmaNum = toplamHedef > 0 ? Math.round(data.toplamSapma / toplamHedef * 100) : 0
    const sapmaPieSlices = [
      { label: 'Sapma',       value: data.toplamSapma,            color: '#f59e0b' },
      { label: 'Hedef Kalan', value: Math.max(0, toplamHedef - data.toplamSapma), color: '#f3f4f6' },
    ]
    const kayipNum = toplamHedef > 0 ? Math.round(data.toplamKayip / toplamHedef * 100) : 0
    const kayipPieSlices = [
      { label: 'Kayıp',       value: data.toplamKayip,            color: '#ef4444' },
      { label: 'Hedef Kalan', value: Math.max(0, toplamHedef - data.toplamKayip), color: '#f3f4f6' },
    ]

    const gobTamPct = toplamHedef > 0 ? (toplamTamKural / toplamHedef * 100) : 0
    const gobSapPct = toplamHedef > 0 ? (data.toplamSapma / toplamHedef * 100) : 0
    const gobEksPct = toplamHedef > 0 ? (toplamEks / toplamHedef * 100) : 0
    const gobKayPct = toplamHedef > 0 ? (data.toplamKayip / toplamHedef * 100) : 0
    const genelOranNum = toplamHedef > 0 ? (toplamGerceklesen / toplamHedef * 100) : 0

    const css = `
      @page { size: A4 landscape; margin: 6mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', -apple-system, sans-serif; color: #111827; font-size: 8.5px; line-height: 1.22; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1.5px solid #1A5C2A; }
      .page-head .title { font-size: 12px; font-weight: 800; color: #0F1A0F; }
      .page-head .meta-inline { font-size: 7.5px; color: #475569; }
      .page-head .meta-inline b { color: #0F1A0F; }

      /* Block 1: Genel Performans */
      .b1 { display: grid; grid-template-columns: 150px 1fr; gap: 8px; align-items: center; margin-bottom: 5px; }
      .b1-oran-big { text-align: center; padding: 6px 6px; background: #F8FAFC; border: 1px solid #e5e7eb; border-radius: 5px; }
      .b1-oran-big .val { font-size: 26px; font-weight: 900; color: ${genelOranNum >= 80 ? '#10b981' : genelOranNum >= 50 ? '#f59e0b' : '#ef4444'}; line-height: 1; }
      .b1-oran-big .lbl { font-size: 7px; color: #6b7280; font-weight: 700; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.08em; }
      .b1-right { display: flex; flex-direction: column; gap: 3px; }
      .b1-head { display: flex; justify-content: space-between; align-items: center; font-size: 7.5px; }
      .b1-head b { color: #0F1A0F; }
      .b1-bar { height: 11px; background: #f3f4f6; border-radius: 2px; overflow: hidden; display: flex; }
      .b1-bar > div { height: 100%; }
      .b1-tam { background: #10b981; }
      .b1-sap { background: #f59e0b; }
      .b1-eks { background: #9ca3af; }
      .b1-kay { background: #ef4444; }
      .b1-kpis { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 2px; }
      .kpi { background: #F8FAFC; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 5px; text-align: center; }
      .kpi .label { font-size: 6.5px; color: #6b7280; text-transform: uppercase; font-weight: 700; letter-spacing: 0.03em; }
      .kpi .value { font-size: 12px; font-weight: 900; color: #111827; margin-top: 2px; }
      .kpi.sap { background: #FEF3C7; border-color: #FDE68A; } .kpi.sap .value { color: #D97706; }
      .kpi.kay { background: #FEE2E2; border-color: #FECACA; } .kpi.kay .value { color: #DC2626; }
      .kpi.eks { background: #F3F4F6; }

      /* Block 2: Departman Analizi */
      .b2-title { font-size: 9px; font-weight: 800; color: #0F1A0F; text-transform: uppercase; letter-spacing: 0.05em; margin: 5px 0 3px; padding-bottom: 2px; border-bottom: 1px solid #e5e7eb; }
      .dep-grid { display: grid; gap: 3px; }
      .dep-card { border: 1px solid #e5e7eb; border-radius: 3px; padding: 3px 4px; background: #ffffff; min-width: 0; }
      .dep-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px; min-width: 0; }
      .dep-name { font-size: 7px; font-weight: 800; color: #111827; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
      .dep-hedef { font-size: 6.5px; color: #6b7280; font-weight: 700; flex-shrink: 0; margin-left: 2px; }
      .dep-bars { display: flex; flex-direction: column; gap: 1.5px; }
      .dep-row { display: grid; grid-template-columns: 8px 1fr 22px; gap: 2px; align-items: center; font-size: 6.5px; }
      .dep-lbl { color: #6b7280; font-weight: 800; }
      .dep-track { height: 5px; background: #f3f4f6; border-radius: 2px; overflow: hidden; }
      .dep-fill { height: 100%; }
      .dep-fill.tam { background: #10b981; }
      .dep-fill.sap { background: #f59e0b; }
      .dep-fill.kay { background: #ef4444; }
      .dep-v { font-size: 6.5px; font-weight: 800; color: #374151; text-align: right; }
      .dep-foot { margin-top: 2px; text-align: right; font-size: 7px; color: #1A5C2A; font-weight: 900; }

      /* Alt 3 blok: alt alta, her biri donut + 2-sütun bar list.
         page-break-inside: avoid ile blok ortadan kesilmez — tasarsa komple blok
         sonraki sayfaya kayar (kullanici geri bildirim: Kayip header'i 1'de
         icerik 2'de kalmisti). */
      .freq-block { border: 1px solid #e5e7eb; border-radius: 4px; padding: 5px 8px; background: #ffffff; margin-top: 4px; page-break-inside: avoid; }
      .freq-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; padding-bottom: 2px; border-bottom: 1px solid #e5e7eb; }
      .freq-head .h3 { font-size: 9px; font-weight: 800; color: #111827; text-transform: uppercase; letter-spacing: 0.05em; }
      .freq-head .count { font-size: 7.5px; font-weight: 700; color: #6b7280; padding: 1px 7px; border-radius: 999px; background: #F3F4F6; }
      .freq-body { display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: flex-start; }
      .freq-donut { display: flex; flex-direction: column; align-items: center; }
      .freq-donut-legend { margin-top: 3px; display: flex; flex-direction: column; gap: 1px; font-size: 7px; width: 100%; }
      .freq-donut-legend .ll { display: flex; justify-content: space-between; gap: 3px; }
      .freq-donut-legend .sq { display: inline-block; width: 6px; height: 6px; border-radius: 1px; margin-right: 2px; vertical-align: middle; }
      .freq-donut-legend .nm { color: #475569; font-weight: 600; }
      .freq-donut-legend .vl { color: #111827; font-weight: 800; }
      .freq-bars { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 14px; }
      .bar-row { display: grid; grid-template-columns: 100px 1fr 30px; gap: 4px; align-items: center; font-size: 7px; }
      .bar-label { color: #475569; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
      .bar-track { height: 6px; background: #f3f4f6; border-radius: 2px; overflow: hidden; }
      .bar-fill { height: 100%; border-radius: 2px; }
      .bar-val { font-size: 7.5px; font-weight: 800; color: #111827; text-align: right; }
      .empty { color: #9ca3af; font-size: 7px; font-style: italic; padding: 4px; }

      /* Sayfa 2: Grup Metrikleri tablosu */
      .grup-head { font-size: 12px; font-weight: 800; color: #0F1A0F; margin-bottom: 5px; padding-bottom: 4px; border-bottom: 1.5px solid #1A5C2A; }
      table { width: 100%; border-collapse: collapse; font-size: 8px; }
      thead { background: #1A5C2A; color: white; }
      thead th { font-weight: 700; font-size: 7.5px; text-transform: uppercase; letter-spacing: 0.3px; padding: 4px 5px; text-align: left; }
      tbody td { padding: 3px 5px; border-bottom: 1px solid #e5e7eb; }
      tbody tr:nth-child(even) { background: #F8FAFC; }
      tbody tr { page-break-inside: avoid; }
      .num { text-align: right; }

      /* Sayfa 2 ek iki sutun: hedefe uygun | altinda */
      .grup-split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
      .grup-col { min-width: 0; }
      .grup-col-head { display: flex; justify-content: space-between; align-items: center; font-size: 9px; font-weight: 800; padding: 5px 10px; border-radius: 4px; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.04em; }
      .grup-col-head.uygun { background: #dcfce7; color: #065f46; border-left: 4px solid #10b981; }
      .grup-col-head.altinda { background: #fee2e2; color: #991b1b; border-left: 4px solid #ef4444; }
      .grup-col-head .count { padding: 1px 8px; border-radius: 999px; background: #ffffff; font-size: 8px; color: #111827; }
      table.grup-mini { font-size: 7.5px; }
      table.grup-mini thead { background: #475569; }
      table.grup-mini thead th { padding: 3px 5px; font-size: 7px; }
      table.grup-mini tbody td { padding: 3px 5px; }
      .empty-row { text-align: center; color: #9ca3af; font-style: italic; padding: 10px; }
    `

    const metaInline = `
      <b>Firma:</b> ${esc(data.firmaAdi || '—')} · <b>Proje:</b> ${esc(data.projeAdi || '—')} ·
      <b>Üst Lok:</b> ${esc(data.ustLokTanim || 'Tümü')} · <b>Dönem:</b> ${esc(data.raporTarihLabel || '—')}
      (${data.gunSayisi} gün) · <b>Raporu Alan:</b> ${esc(data.raporuAlan || '—')}
    `

    const block1 = `
      <div class="b1">
        <div class="b1-oran-big">
          <div class="val">${genelOran}</div>
          <div class="lbl">Genel Oran</div>
        </div>
        <div class="b1-right">
          <div class="b1-head">
            <span><b>${toplamGerceklesen}</b> gerçekleşen</span>
            <span style="display:inline-flex;gap:6px;font-size:7px">
              <span style="color:#10b981"><b>${toplamTamKural}</b> Tamamlanan ${fmtPct(toplamTamKural, toplamHedef)}</span>
              <span style="color:#f59e0b"><b>${data.toplamSapma}</b> Sapma ${fmtPct(data.toplamSapma, toplamHedef)}</span>
              <span style="color:#6b7280"><b>${toplamEks}</b> Frekans Dışı ${fmtPct(toplamEks, toplamHedef)}</span>
              <span style="color:#ef4444"><b>${data.toplamKayip}</b> Kayıp ${fmtPct(data.toplamKayip, toplamHedef)}</span>
            </span>
            <span><b>${toplamHedef}</b> hedef</span>
          </div>
          <div class="b1-bar">
            <div class="b1-tam" style="width:${gobTamPct.toFixed(2)}%"></div>
            <div class="b1-sap" style="width:${gobSapPct.toFixed(2)}%"></div>
            <div class="b1-eks" style="width:${gobEksPct.toFixed(2)}%"></div>
            <div class="b1-kay" style="width:${gobKayPct.toFixed(2)}%"></div>
          </div>
          <div class="b1-kpis">
            <div class="kpi"><div class="label">Hedef</div><div class="value">${toplamHedef}</div></div>
            <div class="kpi"><div class="label">Gerçekleşen</div><div class="value">${toplamGerceklesen}</div></div>
            <div class="kpi"><div class="label">Tamamlanan</div><div class="value" style="color:#10b981">${toplamTamKural}</div></div>
            <div class="kpi sap"><div class="label">Sapma</div><div class="value">${data.toplamSapma}</div></div>
            <div class="kpi eks"><div class="label">Frekans Dışı</div><div class="value">${toplamEks}</div></div>
            <div class="kpi kay"><div class="label">Kayıp</div><div class="value">${data.toplamKayip}</div></div>
            <div class="kpi"><div class="label">Rapor Dönemi</div><div class="value">${data.gunSayisi} gün</div></div>
          </div>
        </div>
      </div>
    `

    // Departman Analizi: kolonlar departman sayisina gore dinamik (min 8, max 14)
    const depCols = Math.min(Math.max(departmanlar.length, 8), 14)
    const block2 = `
      <div class="b2-title">Departman Analizi</div>
      <div class="dep-grid" style="grid-template-columns:repeat(${depCols}, 1fr)">
        ${departmanlar.length === 0 ? `<div class="empty">Veri yok</div>` : departmanlar.map(departmanCard).join('')}
      </div>
    `

    const donutLegendRows = (slices: { label: string; value: number; color: string }[], total: number) => slices.map(s => {
      const pct = total > 0 ? `%${(Math.max(0, s.value) / total * 100).toFixed(1)}` : '%0'
      return `<div class="ll"><span class="nm"><span class="sq" style="background:${s.color}"></span>${esc(s.label)}</span><span class="vl">${s.value} <span style="color:#9ca3af">(${pct})</span></span></div>`
    }).join('')

    const block3 = `
      <div class="freq-block">
        <div class="freq-head">
          <span class="h3">Frekans Dağılımı & Grup Bazlı Tamamlanan</span>
          <span class="count">${grupBazli.length} grup</span>
        </div>
        <div class="freq-body">
          <div class="freq-donut">
            ${svgDonut(110, freqPieSlices, `%${basariNum}`, 'Başarı')}
            <div class="freq-donut-legend">${donutLegendRows(freqPieSlices, toplamHedef)}</div>
          </div>
          <div class="freq-bars">${barList(grupBazli.map(g => ({ label: g.grup, value: g.tamamlanan })), '#10b981')}</div>
        </div>
      </div>
    `

    const block4 = `
      <div class="freq-block">
        <div class="freq-head">
          <span class="h3">Sapma Frekanslar</span>
          <span class="count">${data.toplamSapma} kayıt</span>
        </div>
        <div class="freq-body">
          <div class="freq-donut">
            ${svgDonut(110, sapmaPieSlices, `%${sapmaNum}`, 'Sapma')}
            <div class="freq-donut-legend">
              <div class="ll"><span class="nm"><span class="sq" style="background:#f59e0b"></span>Sapma</span><span class="vl">${data.toplamSapma}</span></div>
              <div class="ll"><span class="nm"><span class="sq" style="background:#f3f4f6;border:1px solid #d1d5db"></span>Hedef Kalan</span><span class="vl">${Math.max(0, toplamHedef - data.toplamSapma)}</span></div>
            </div>
          </div>
          <div class="freq-bars">${barList(grupBazli.filter(g => g.sapma > 0).map(g => ({ label: g.grup, value: g.sapma })), '#f59e0b')}</div>
        </div>
      </div>
    `

    const block5 = `
      <div class="freq-block">
        <div class="freq-head">
          <span class="h3">Kayıp Frekanslar</span>
          <span class="count">${data.toplamKayip} kayıt</span>
        </div>
        <div class="freq-body">
          <div class="freq-donut">
            ${svgDonut(110, kayipPieSlices, `%${kayipNum}`, 'Kayıp')}
            <div class="freq-donut-legend">
              <div class="ll"><span class="nm"><span class="sq" style="background:#ef4444"></span>Kayıp</span><span class="vl">${data.toplamKayip}</span></div>
              <div class="ll"><span class="nm"><span class="sq" style="background:#f3f4f6;border:1px solid #d1d5db"></span>Hedef Kalan</span><span class="vl">${Math.max(0, toplamHedef - data.toplamKayip)}</span></div>
            </div>
          </div>
          <div class="freq-bars">${barList(grupBazli.filter(g => g.kayip > 0).map(g => ({ label: g.grup, value: g.kayip })), '#ef4444')}</div>
        </div>
      </div>
    `

    // Sayfa 2 ek listeler: hedefe uygun gruplar | hedef altinda kalan gruplar
    // Backend formulu (lib/reports/genel-rapor-data.ts:741):
    //   gerceklesen = tamamlanan + ekstra (frekansDisi) — ekstra basariyi ARTIRIR
    //   basariOrani = gerceklesen / hedef * 100
    // Sapma GENEL orana girer (genelOran), basariya degil.
    type GrupAgg = { grup: string; hedef: number; tamamlanan: number; sapma: number; kayip: number; frekansDisi: number }
    const gerceklesenOf = (g: GrupAgg) => g.tamamlanan + g.frekansDisi
    const basariPct = (g: GrupAgg) => g.hedef > 0 ? gerceklesenOf(g) / g.hedef * 100 : 0
    const uygunGruplar = grupBazli
      .filter(g => g.hedef > 0 && basariPct(g) >= 100)
      .sort((a, b) => basariPct(b) - basariPct(a))
    const altindaGruplar = grupBazli
      .filter(g => g.hedef > 0 && basariPct(g) < 100)
      .sort((a, b) => basariPct(a) - basariPct(b))

    const grupMiniRow = (g: GrupAgg, basariColor: string) => {
      const b = basariPct(g)
      const bStr = `%${b.toFixed(2).replace('.', ',')}`
      return `<tr>
        <td>${esc(g.grup)}</td>
        <td class="num">${g.hedef}</td>
        <td class="num">${gerceklesenOf(g)}</td>
        <td class="num" style="color:${basariColor};font-weight:800">${bStr}</td>
      </tr>`
    }

    // Sayfa 2: Grup Metrikleri tablosu + alt iki liste (hedefe uygun | altinda)
    const grupMetrikleriTable = `
      <div class="page">
        <div class="grup-head">Grup Metrikleri — ${esc(data.firmaAdi || '—')} · ${esc(data.projeAdi || '—')} · ${esc(data.raporTarihLabel || '—')}</div>
        <table>
          <thead><tr>
            <th>SN</th><th>Grup</th><th>Üst Lokasyon</th><th>Lokasyon</th>
            <th class="num">V.Frekans</th><th class="num">Hedef</th><th class="num">Tamamlanan</th>
            <th class="num">Frekans Dışı</th><th class="num">Sapma</th><th class="num">Kayıp</th>
            <th class="num">Başarı</th><th class="num">Genel</th>
          </tr></thead>
          <tbody>${data.grupMetrikleri.map((g, i) => `<tr>
            <td>${i + 1}</td><td>${esc(g.grup)}</td><td>${esc(g.ustLokasyon)}</td><td>${esc(g.lokasyon)}</td>
            <td class="num">${esc(g.gunlukFrekans)}</td><td class="num">${g.hedef}</td><td class="num">${g.tamamlanan}</td>
            <td class="num">${g.ekstra ?? 0}</td><td class="num">${g.sapma}</td><td class="num">${g.kayip}</td>
            <td class="num">${esc(g.basariOrani)}</td><td class="num">${esc(g.genelOran)}</td>
          </tr>`).join('')}</tbody>
        </table>

        <div class="grup-split">
          <div class="grup-col">
            <div class="grup-col-head uygun">
              <span>FREKANS HEDEFİNE UYGUN GRUPLAR</span>
              <span class="count">${uygunGruplar.length}</span>
            </div>
            <table class="grup-mini">
              <thead><tr><th>GRUP</th><th class="num">HEDEF</th><th class="num">GERÇEK.</th><th class="num">BAŞARI</th></tr></thead>
              <tbody>${uygunGruplar.length === 0
                ? `<tr><td colspan="4" class="empty-row">Bu aralıkta hedefi karşılayan grup yok</td></tr>`
                : uygunGruplar.map(g => grupMiniRow(g, '#10b981')).join('')
              }</tbody>
            </table>
          </div>
          <div class="grup-col">
            <div class="grup-col-head altinda">
              <span>FREKANS HEDEFİN ALTINDA KALAN GRUPLAR</span>
              <span class="count">${altindaGruplar.length}</span>
            </div>
            <table class="grup-mini">
              <thead><tr><th>GRUP</th><th class="num">HEDEF</th><th class="num">GERÇEK.</th><th class="num">BAŞARI</th></tr></thead>
              <tbody>${altindaGruplar.length === 0
                ? `<tr><td colspan="4" class="empty-row">Tüm gruplar hedefi karşıladı</td></tr>`
                : altindaGruplar.map(g => grupMiniRow(g, '#ef4444')).join('')
              }</tbody>
            </table>
          </div>
        </div>
      </div>
    `

    const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>Frekansiyel Görevler Raporu</title><style>${css}</style></head>
<body>
  <div class="page">
    <div class="page-head">
      <div class="title">Frekansiyel Görevler Raporu</div>
      <div class="meta-inline">${metaInline}</div>
    </div>
    ${block1}
    ${block2}
    ${block3}
    ${block4}
    ${block5}
  </div>
  ${grupMetrikleriTable}
</body></html>`

    const puppeteer = (await import('puppeteer')).default
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '6mm', right: '6mm', bottom: '6mm', left: '6mm' },
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
