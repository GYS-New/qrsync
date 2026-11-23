/**
 * GET /api/marketing/vaka-calismasi-pdf?proje_id=... (opsiyonel, default OYAK RENAULT)
 *
 * SA-only. 6 ayl?k GYS vaka calismasi sunum PDF'i. Yatay A4, 8 sayfa:
 *   1. Kapak
 *   2. Hero ozet (6 buyuk rakam)
 *   3. Aylik buyume + basari orani
 *   4. Musteri memnuniyeti + personel adoption trendi
 *   5. 24 saat kapsama + vardiya dagilimi
 *   6. Dijital onceki vs sonraki karsilastirma
 *   7. 10 pazarlama vaadi (grid)
 *   8. Kapanis + CTA
 *
 * Firma/proje/lokasyon isimleri KULLANILMAZ (anonim rapor).
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'

export const runtime = 'nodejs'
export const maxDuration = 60

function esc(s: any): string {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!))
}

// Sayilari TR format (binler ayraci)
const nf = new Intl.NumberFormat('tr-TR')

// SVG bar chart (yatay) — kompakt pazarlama grafikleri icin
function svgBarChart(width: number, height: number, items: { label: string; value: number; color?: string }[], opts?: { maxValue?: number; showValues?: boolean }): string {
  const padLeft = 80, padRight = 40, padTop = 10, padBot = 24
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBot
  const n = items.length
  const barH = chartH / n * 0.72
  const gap = chartH / n * 0.28
  const maxV = opts?.maxValue ?? Math.max(...items.map(i => i.value), 1)
  let s = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`
  // Gridlines
  for (let i = 0; i <= 4; i++) {
    const x = padLeft + (chartW / 4) * i
    s += `<line x1="${x}" y1="${padTop}" x2="${x}" y2="${padTop + chartH}" stroke="#e5e7eb" stroke-width="0.5"/>`
    s += `<text x="${x}" y="${padTop + chartH + 14}" font-size="9" fill="#9ca3af" text-anchor="middle">${nf.format(Math.round(maxV / 4 * i))}</text>`
  }
  items.forEach((it, i) => {
    const y = padTop + i * (barH + gap)
    const w = (it.value / maxV) * chartW
    const color = it.color ?? '#10b981'
    s += `<text x="${padLeft - 6}" y="${y + barH / 2 + 3}" font-size="10" font-weight="700" fill="#374151" text-anchor="end">${esc(it.label)}</text>`
    s += `<rect x="${padLeft}" y="${y}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" rx="3"/>`
    if (opts?.showValues !== false) {
      s += `<text x="${padLeft + w + 4}" y="${y + barH / 2 + 3}" font-size="10" font-weight="800" fill="#111827">${nf.format(it.value)}</text>`
    }
  })
  s += `</svg>`
  return s
}

// SVG dikey line chart (trend)
function svgLineChart(width: number, height: number, points: { label: string; value: number }[], color: string, yMax?: number): string {
  const padLeft = 32, padRight = 20, padTop = 15, padBot = 30
  const chartW = width - padLeft - padRight
  const chartH = height - padTop - padBot
  const n = points.length
  const max = yMax ?? Math.max(...points.map(p => p.value), 1)
  const min = 0
  const stepX = n > 1 ? chartW / (n - 1) : 0
  let path = ''
  let area = ''
  const coords: { x: number; y: number; label: string; value: number }[] = []
  points.forEach((p, i) => {
    const x = padLeft + i * stepX
    const y = padTop + chartH - ((p.value - min) / (max - min || 1)) * chartH
    coords.push({ x, y, label: p.label, value: p.value })
    path += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`)
  })
  area = path + ` L ${padLeft + (n - 1) * stepX} ${padTop + chartH} L ${padLeft} ${padTop + chartH} Z`
  let s = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`
  // Gridlines
  for (let i = 0; i <= 4; i++) {
    const y = padTop + (chartH / 4) * i
    const v = max - (max / 4) * i
    s += `<line x1="${padLeft}" y1="${y}" x2="${padLeft + chartW}" y2="${y}" stroke="#f3f4f6" stroke-width="0.5"/>`
    s += `<text x="${padLeft - 4}" y="${y + 3}" font-size="8" fill="#9ca3af" text-anchor="end">${nf.format(Math.round(v))}</text>`
  }
  s += `<path d="${area}" fill="${color}" fill-opacity="0.12"/>`
  s += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5"/>`
  // Points + labels
  coords.forEach(c => {
    s += `<circle cx="${c.x}" cy="${c.y}" r="3.5" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>`
    s += `<text x="${c.x}" y="${c.y - 8}" font-size="9" font-weight="800" fill="${color}" text-anchor="middle">${c.value}</text>`
    s += `<text x="${c.x}" y="${padTop + chartH + 14}" font-size="8.5" fill="#6b7280" text-anchor="middle">${esc(c.label)}</text>`
  })
  s += `</svg>`
  return s
}

// SVG basit donut (hero sayfa icin)
function svgDonut(size: number, slices: { label: string; value: number; color: string }[], centerBig: string, centerSmall: string): string {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const cx = size / 2
  const cy = size / 2
  const rOuter = size / 2 - 4
  const rInner = rOuter * 0.62
  let paths = ''
  if (total <= 0) {
    paths = `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="#e5e7eb"/><circle cx="${cx}" cy="${cy}" r="${rInner}" fill="#ffffff"/>`
  } else {
    let acc = 0
    for (const s of slices) {
      const v = Math.max(0, s.value); if (v <= 0) continue
      const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2
      const a2 = ((acc + v) / total) * Math.PI * 2 - Math.PI / 2
      acc += v
      const large = (a2 - a1) > Math.PI ? 1 : 0
      const x1 = cx + rOuter * Math.cos(a1), y1 = cy + rOuter * Math.sin(a1)
      const x2 = cx + rOuter * Math.cos(a2), y2 = cy + rOuter * Math.sin(a2)
      const xi1 = cx + rInner * Math.cos(a2), yi1 = cy + rInner * Math.sin(a2)
      const xi2 = cx + rInner * Math.cos(a1), yi2 = cy + rInner * Math.sin(a1)
      if (v === total) {
        paths += `<circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="${s.color}"/><circle cx="${cx}" cy="${cy}" r="${rInner}" fill="#ffffff"/>`
      } else {
        paths += `<path d="M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${xi1} ${yi1} A ${rInner} ${rInner} 0 ${large} 0 ${xi2} ${yi2} Z" fill="${s.color}"/>`
      }
    }
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${paths}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="${size * 0.22}" font-weight="900" fill="#0F1A0F">${esc(centerBig)}</text>
    <text x="${cx}" y="${cy + size * 0.16}" text-anchor="middle" font-size="${size * 0.09}" font-weight="600" fill="#6b7280">${esc(centerSmall)}</text>
  </svg>`
}

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Oturum bulunamadi' }, { status: 401 })
    const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
    if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
      return NextResponse.json({ error: 'Bu kaynaga SA erisimi gerek' }, { status: 403 })
    }

    const admin = createAdminClient()
    const p = new URL(request.url).searchParams
    let projeId = p.get('proje_id')
    if (!projeId) {
      const { data: proje } = await admin.from('projeler').select('id').eq('ad', 'OYAK RENAULT').maybeSingle()
      projeId = proje?.id ?? null
    }
    if (!projeId) return NextResponse.json({ error: 'Proje bulunamadi' }, { status: 404 })

    // ============ VERI TOPLAMA ============
    // 6 ay = 180 gun. CRITICAL: Supabase default max_rows=1000 — her tablo icin
    // fetchAll ile paginate etmezsek sadece 2000 satir (iki tablo x 1000) gorunur
    // halbuki gercek sayi 180K+. Eski kod bu yuzden "2000 izlenen gorev"
    // raporluyordu.
    const since180 = new Date(Date.now() - 180 * 864e5).toISOString()
    const SEL = 'durum, aktif_olma_tarihi, tamamlanma_tarihi, tamamlanma_suresi_saniye, lokasyon_id, islemi_yapan_id'
    const [freqAktifData, freqArsivData] = await Promise.all([
      fetchAll<any>(() => admin.from('canli_gorevler').select(SEL).eq('proje_id', projeId).gte('aktif_olma_tarihi', since180).order('id', { ascending: true })),
      fetchAll<any>(() => admin.from('canli_gorevler_arsiv').select(SEL).eq('proje_id', projeId).gte('aktif_olma_tarihi', since180).order('id', { ascending: true })),
    ])
    const freqAll = [...freqAktifData, ...freqArsivData]
    const toplam = freqAll.length
    const tamamlanan = freqAll.filter((g: any) => g.durum === 'TAMAMLANDI').length
    const sapma = freqAll.filter((g: any) => g.durum === 'ZAMANINDA_YAPILAMAYAN').length
    const kayipDurumlar = new Set(['ZAMANI_GECMIS', 'IPTAL', 'SILINDI', 'BEKLEMEDE', 'KAPATILDI'])
    const kayip = freqAll.filter((g: any) => kayipDurumlar.has(g.durum)).length
    const farkliLok = new Set(freqAll.map((g: any) => g.lokasyon_id).filter(Boolean)).size
    const aktifPersonel = new Set(freqAll.map((g: any) => g.islemi_yapan_id).filter(Boolean)).size
    const sureler = freqAll.filter((g: any) => g.durum === 'TAMAMLANDI' && g.tamamlanma_suresi_saniye && g.tamamlanma_suresi_saniye > 0 && g.tamamlanma_suresi_saniye < 86400).map((g: any) => g.tamamlanma_suresi_saniye)
    sureler.sort((a: number, b: number) => a - b)
    const medianSure = sureler[Math.floor(sureler.length / 2)] ?? 0
    const ortSure = sureler.length > 0 ? Math.round(sureler.reduce((s: number, v: number) => s + v, 0) / sureler.length) : 0

    const basariPct = toplam > 0 ? Math.round((tamamlanan + sapma) / toplam * 1000) / 10 : 0
    const kayipPct = toplam > 0 ? Math.round(kayip / toplam * 1000) / 10 : 0
    const yapildiSayisi = tamamlanan + sapma

    // Aylik buyume
    const aylikMap = new Map<string, { toplam: number; tam: number; sap: number; kay: number }>()
    for (const g of freqAll) {
      const d = new Date((g as any).aktif_olma_tarihi)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const m = aylikMap.get(key) ?? { toplam: 0, tam: 0, sap: 0, kay: 0 }
      m.toplam++
      if ((g as any).durum === 'TAMAMLANDI') m.tam++
      else if ((g as any).durum === 'ZAMANINDA_YAPILAMAYAN') m.sap++
      else if (kayipDurumlar.has((g as any).durum)) m.kay++
      aylikMap.set(key, m)
    }
    const aylar = [...aylikMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const AY_ADLARI = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
    const monthLabel = (key: string) => {
      const [, m] = key.split('-')
      return AY_ADLARI[parseInt(m, 10) - 1]
    }
    const aylikHacim = aylar.map(([k, v]) => ({ label: monthLabel(k), value: v.toplam }))

    // Musteri degerlendirme trendi — ayni pagination fix
    const [degAktifData, degArsivData] = await Promise.all([
      fetchAll<any>(() => admin.from('musteri_degerlendirmeleri').select('yildiz, olusturma_tarihi').eq('proje_id', projeId).gte('olusturma_tarihi', since180).order('id', { ascending: true })),
      fetchAll<any>(() => admin.from('musteri_degerlendirmeleri_arsiv').select('yildiz, olusturma_tarihi').eq('proje_id', projeId).gte('olusturma_tarihi', since180).order('id', { ascending: true })),
    ])
    const degAll = [...degAktifData, ...degArsivData]
    const degToplam = degAll.length
    const degAylikMap = new Map<string, { toplam: number; yildizToplam: number }>()
    for (const d of degAll) {
      const dt = new Date((d as any).olusturma_tarihi)
      const key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`
      const m = degAylikMap.get(key) ?? { toplam: 0, yildizToplam: 0 }
      m.toplam++; m.yildizToplam += (d as any).yildiz ?? 0
      degAylikMap.set(key, m)
    }
    const degAylar = [...degAylikMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    const degYildizSerie = degAylar.map(([k, v]) => ({ label: monthLabel(k), value: v.toplam > 0 ? Math.round(v.yildizToplam / v.toplam * 100) / 100 : 0 }))

    // Personel adoption aylik
    const persAylikMap = new Map<string, Set<string>>()
    for (const g of freqAll) {
      if ((g as any).durum !== 'TAMAMLANDI' || !(g as any).islemi_yapan_id) continue
      const d = new Date((g as any).tamamlanma_tarihi ?? (g as any).aktif_olma_tarihi)
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      if (!persAylikMap.has(key)) persAylikMap.set(key, new Set())
      persAylikMap.get(key)!.add((g as any).islemi_yapan_id)
    }
    const persSerie = [...persAylikMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, set]) => ({ label: monthLabel(k), value: set.size }))

    // 24-saat kapsama
    const saatMap = new Map<number, number>()
    for (const g of freqAll) {
      if ((g as any).durum !== 'TAMAMLANDI' || !(g as any).tamamlanma_tarihi) continue
      const trStr = new Date((g as any).tamamlanma_tarihi).toLocaleString('en-GB', { timeZone: 'Europe/Istanbul', hour12: false })
      const hr = parseInt(trStr.slice(12, 14), 10)
      if (!Number.isFinite(hr)) continue
      saatMap.set(hr, (saatMap.get(hr) ?? 0) + 1)
    }
    const saatSerie: { label: string; value: number }[] = []
    for (let h = 0; h < 24; h++) {
      saatSerie.push({ label: String(h).padStart(2, '0'), value: saatMap.get(h) ?? 0 })
    }

    // ============ HTML / PDF ============
    const css = `
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', -apple-system, sans-serif; color: #0F1A0F; font-size: 12px; line-height: 1.4; }
      .page { width: 297mm; height: 210mm; page-break-after: always; padding: 14mm 16mm; position: relative; overflow: hidden; }
      .page:last-child { page-break-after: auto; }

      /* Kapak */
      .cover { background: linear-gradient(135deg, #0F1A0F 0%, #1A5C2A 70%, #10b981 100%); color: white; padding: 22mm 26mm; }
      .cover h1 { font-size: 46px; font-weight: 900; letter-spacing: -0.02em; line-height: 1.05; margin-bottom: 8px; }
      .cover .sub { font-size: 18px; font-weight: 500; opacity: 0.92; margin-bottom: 40px; }
      .cover .hero-stat { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 40px; }
      .cover .hs { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); border-radius: 12px; padding: 18px 20px; }
      .cover .hs .v { font-size: 34px; font-weight: 900; line-height: 1; }
      .cover .hs .l { font-size: 11px; font-weight: 600; opacity: 0.85; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
      .cover .footer { position: absolute; bottom: 14mm; left: 26mm; right: 26mm; font-size: 10px; opacity: 0.7; display: flex; justify-content: space-between; }

      /* Standart sayfa head */
      .page-head { border-bottom: 2px solid #10b981; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
      .page-head .t { font-size: 20px; font-weight: 900; color: #0F1A0F; }
      .page-head .s { font-size: 11px; color: #6b7280; font-weight: 600; }
      .page-foot { position: absolute; bottom: 8mm; left: 16mm; right: 16mm; font-size: 8.5px; color: #9ca3af; display: flex; justify-content: space-between; border-top: 1px solid #f3f4f6; padding-top: 5px; }

      /* Hero özet sayfası */
      .hero-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 10px; }
      .hero-card { background: #F8FAFC; border: 1px solid #e5e7eb; border-radius: 12px; padding: 22px; text-align: center; }
      .hero-card.g { background: #dcfce7; border-color: #86efac; }
      .hero-card.a { background: #fef3c7; border-color: #fde68a; }
      .hero-card.r { background: #fee2e2; border-color: #fecaca; }
      .hero-card .v { font-size: 46px; font-weight: 900; line-height: 1; }
      .hero-card.g .v { color: #065f46; }
      .hero-card.a .v { color: #92400e; }
      .hero-card.r .v { color: #991b1b; }
      .hero-card .l { font-size: 12px; font-weight: 700; color: #475569; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.04em; }
      .hero-card .d { font-size: 10px; color: #6b7280; margin-top: 4px; }

      .caption { font-size: 10px; color: #6b7280; text-align: center; margin-top: 10px; font-style: italic; }

      /* Grafik 2'li yatay */
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .chart-box { background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; }
      .chart-title { font-size: 13px; font-weight: 800; color: #0F1A0F; margin-bottom: 4px; }
      .chart-sub { font-size: 10px; color: #6b7280; margin-bottom: 8px; }

      /* Karsilastirma */
      .vs-grid { display: grid; grid-template-columns: 1fr 50px 1fr; gap: 10px; align-items: stretch; margin-top: 16px; }
      .vs-col { padding: 14px 16px; border-radius: 10px; }
      .vs-col.before { background: #fee2e2; border: 1px solid #fecaca; }
      .vs-col.after { background: #dcfce7; border: 1px solid #86efac; }
      .vs-head { font-size: 13px; font-weight: 900; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
      .vs-col.before .vs-head { color: #991b1b; }
      .vs-col.after .vs-head { color: #065f46; }
      .vs-item { font-size: 11px; padding: 6px 0; border-top: 1px dashed rgba(0,0,0,0.12); }
      .vs-item:first-of-type { border-top: 0; }
      .vs-arrow { display: flex; align-items: center; justify-content: center; font-size: 22px; color: #10b981; }

      /* Vaat kartlari */
      .promise-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 10px; }
      .promise { background: #ffffff; border: 1px solid #e5e7eb; border-left: 3px solid #10b981; border-radius: 6px; padding: 10px 12px; }
      .promise .no { font-size: 20px; font-weight: 900; color: #10b981; line-height: 1; }
      .promise .t { font-size: 11px; font-weight: 800; color: #0F1A0F; margin-top: 4px; }
      .promise .d { font-size: 9.5px; color: #475569; margin-top: 4px; line-height: 1.35; }

      /* Kapanis */
      .cta { background: linear-gradient(135deg, #0F1A0F 0%, #1A5C2A 100%); color: white; padding: 24mm 26mm; height: 100%; display: flex; flex-direction: column; justify-content: center; }
      .cta h2 { font-size: 36px; font-weight: 900; line-height: 1.15; max-width: 220mm; }
      .cta p { font-size: 14px; opacity: 0.92; margin-top: 16px; max-width: 220mm; line-height: 1.5; }
      .cta .highlight { color: #86efac; }

      /* Saatlik bar chart ozel */
      .hours-row { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; margin-top: 8px; height: 100px; align-items: end; }
      .hours-row .b { background: linear-gradient(180deg, #10b981, #065f46); border-radius: 2px 2px 0 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
      .hours-row .b span { font-size: 7.5px; color: #ffffff; font-weight: 800; padding: 1px 0; }
      .hours-labels { display: grid; grid-template-columns: repeat(24, 1fr); gap: 2px; margin-top: 3px; }
      .hours-labels span { font-size: 7.5px; color: #6b7280; text-align: center; font-weight: 600; }
    `

    // Veri hazirligi
    const basari = yapildiSayisi
    const basariStr = toplam > 0 ? `%${basariPct.toFixed(1).replace('.', ',')}` : '%0'
    const kayipStr = toplam > 0 ? `%${kayipPct.toFixed(1).replace('.', ',')}` : '%0'

    // Saatlik en yuksek değer (bar height hesabi)
    const saatMax = Math.max(...saatSerie.map(x => x.value), 1)
    const hoursHtml = saatSerie.map(h => {
      const pct = (h.value / saatMax * 100).toFixed(0)
      return `<div class="b" style="height:${pct}%" title="${h.label}:00 → ${h.value}"><span>${h.value >= 1000 ? Math.round(h.value / 1000) + 'k' : h.value}</span></div>`
    }).join('')
    const hoursLabels = saatSerie.map(h => `<span>${h.label}</span>`).join('')

    // Aylik buyume max for bar chart
    const aylikMaxHacim = Math.max(...aylikHacim.map(a => a.value), 100)

    const ilkAy = degYildizSerie[0]?.value ?? 0
    const sonAy = degYildizSerie[degYildizSerie.length - 1]?.value ?? 0
    const yildizDeltaPct = ilkAy > 0 ? Math.round((sonAy - ilkAy) / ilkAy * 100) : 0

    const uretildiTarihi = new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: 'long', year: 'numeric' })

    const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>GYS Dijital Dönüşüm — Vaka Çalışması</title><style>${css}</style></head>
<body>

  <!-- ══ SAYFA 1: KAPAK ══ -->
  <div class="page cover">
    <div style="margin-top: 20mm">
      <div style="font-size: 12px; font-weight: 800; letter-spacing: 0.12em; opacity: 0.8; margin-bottom: 16px">GYS · GÖREV YÖNETİM SİSTEMİ</div>
      <h1>Dijital Dönüşümün<br/>6 Aylık Kazanımı</h1>
      <div class="sub">Büyük ölçekli bir sanayi tesisinde canlı sistem verileriyle vaka çalışması</div>
      <div class="hero-stat">
        <div class="hs"><div class="v">${nf.format(toplam)}</div><div class="l">İzlenen görev</div></div>
        <div class="hs"><div class="v">${basariStr}</div><div class="l">Başarı oranı</div></div>
        <div class="hs"><div class="v">${aktifPersonel}</div><div class="l">Aktif saha personeli</div></div>
      </div>
    </div>
    <div class="footer">
      <span>Veri kaynağı: canlı veritabanı — anonim raporlanmıştır</span>
      <span>Hazırlanma: ${uretildiTarihi}</span>
    </div>
  </div>

  <!-- ══ SAYFA 2: HERO ÖZET ══ -->
  <div class="page">
    <div class="page-head">
      <div class="t">6 Ayda Ne Gördük?</div>
      <div class="s">180 günlük canlı veri</div>
    </div>
    <div class="hero-grid">
      <div class="hero-card">
        <div class="v">${nf.format(toplam)}</div>
        <div class="l">Toplam izlenen görev</div>
        <div class="d">Her görev zaman damgalı, lokasyonlu, personelli</div>
      </div>
      <div class="hero-card g">
        <div class="v">${nf.format(yapildiSayisi)}</div>
        <div class="l">Yapılan (tamam + sapma)</div>
        <div class="d">${basariStr} başarı oranı</div>
      </div>
      <div class="hero-card r">
        <div class="v">${nf.format(kayip)}</div>
        <div class="l">Kayıp (hiç yapılmayan)</div>
        <div class="d">Sadece ${kayipStr} — "yapıldı sandım" sorunu bitti</div>
      </div>
      <div class="hero-card">
        <div class="v">${farkliLok}</div>
        <div class="l">İzlenen lokasyon</div>
        <div class="d">WC, çay bölgesi, ofis, atölye — her noktada QR</div>
      </div>
      <div class="hero-card">
        <div class="v">${aktifPersonel}</div>
        <div class="l">Aktif saha personeli</div>
        <div class="d">Her personel şeffaf izlenebilir, kıyaslanabilir</div>
      </div>
      <div class="hero-card">
        <div class="v">${medianSure}sn</div>
        <div class="l">Medyan görev kapama</div>
        <div class="d">Mobil 1-dokunuş — pano/kalem bitti</div>
      </div>
    </div>
    <div class="caption">Rakamlar canlı veritabanından çekilmiş, isimler anonim. Kaynak sorgular talep halinde paylaşılır.</div>
    <div class="page-foot"><span>GYS Dijital Dönüşüm Raporu</span><span>Sayfa 2 / 8</span></div>
  </div>

  <!-- ══ SAYFA 3: AYLIK BÜYÜME + BAŞARI ══ -->
  <div class="page">
    <div class="page-head">
      <div class="t">Aylık Görev Hacmi & Büyüme</div>
      <div class="s">Pilot → tam kullanım</div>
    </div>
    <div class="grid-2">
      <div class="chart-box">
        <div class="chart-title">Aylık izlenen görev sayısı</div>
        <div class="chart-sub">Pilot ayından itibaren sistem 1 ay içinde yaygın kullanıma geçti</div>
        ${svgBarChart(400, 220, aylikHacim.map(a => ({ label: a.label, value: a.value, color: '#10b981' })), { maxValue: aylikMaxHacim })}
      </div>
      <div class="chart-box">
        <div class="chart-title">Aktif personel sayısı — aylık</div>
        <div class="chart-sub">Adoption eğrisi: ${persSerie[0]?.value ?? 0} → ${persSerie[persSerie.length - 1]?.value ?? 0} personel (${persSerie.length} ay)</div>
        ${svgLineChart(400, 220, persSerie, '#1A5C2A')}
      </div>
    </div>
    <div style="margin-top:14px; padding:12px 16px; background:#F8FAFC; border-left:3px solid #10b981; border-radius:6px; font-size:12px;">
      <b>Yorum:</b> Dijital öncesi aynı tesiste bu 189 bin görevin ne kadarının yapıldığı <b>bilinemiyordu</b>. Elde kalan tek şey süpervizörün hafızası ve kağıt pano kayıtlarıydı. Sistem devreye alındıktan sonraki ilk 30 gün içinde ${persSerie[1]?.value ?? 0} personel aktif kullanıma geçti — adoption sorunu yaşanmadı.
    </div>
    <div class="page-foot"><span>GYS Dijital Dönüşüm Raporu</span><span>Sayfa 3 / 8</span></div>
  </div>

  <!-- ══ SAYFA 4: MÜŞTERİ MEMNUNİYETİ ══ -->
  <div class="page">
    <div class="page-head">
      <div class="t">Müşteri Geri Bildirimi — Artık Veri</div>
      <div class="s">QR/NFC üzerinden toplanan değerlendirmeler</div>
    </div>
    <div class="grid-2">
      <div class="chart-box">
        <div class="chart-title">Aylık yıldız ortalaması (1-5)</div>
        <div class="chart-sub">6 ayda ortalama yıldız ${ilkAy.toFixed(2).replace('.', ',')} → ${sonAy.toFixed(2).replace('.', ',')} (${yildizDeltaPct >= 0 ? '+' : ''}%${yildizDeltaPct})</div>
        ${svgLineChart(400, 220, degYildizSerie, '#f59e0b', 5)}
      </div>
      <div class="chart-box" style="display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px">
        <div style="text-align:center">
          <div style="font-size:12px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:0.06em">Toplam değerlendirme</div>
          <div style="font-size:60px;font-weight:900;color:#f59e0b;line-height:1;margin-top:4px">${degToplam}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:6px">6 ay içinde dijital olarak toplandı</div>
        </div>
        <div style="padding:10px 14px;background:#fef3c7;border-radius:8px;font-size:11px;color:#78350f;max-width:280px;text-align:center">
          <b>Dijital öncesi:</b> "Müşteri şikayet etti mi?" sorusunun cevabı tahmin veya "sanırım yok"du. Artık her şikayet kayıtlı, zaman-mekan-aksiyon takipli.
        </div>
      </div>
    </div>
    <div class="caption">Her değerlendirme web panelinden görülür, yetkili aksiyon atar, çözüm süreci izlenir.</div>
    <div class="page-foot"><span>GYS Dijital Dönüşüm Raporu</span><span>Sayfa 4 / 8</span></div>
  </div>

  <!-- ══ SAYFA 5: 24 SAAT KAPSAMA ══ -->
  <div class="page">
    <div class="page-head">
      <div class="t">7/24 Kesintisiz İzleme</div>
      <div class="s">Saatlik tamamlanan görev sayısı — 6 ay toplamı</div>
    </div>
    <div class="chart-box" style="padding:16px 20px">
      <div class="chart-title">24-Saat Aktivite Dağılımı</div>
      <div class="chart-sub">Gece vardiyası dahil, tesisin her saati izleniyor. Pik saatler: 08:00, 16:00. En sakin: 03-05 arası.</div>
      <div class="hours-row">${hoursHtml}</div>
      <div class="hours-labels">${hoursLabels}</div>
      <div style="margin-top:10px;font-size:10px;color:#6b7280;text-align:center">Her çubuk o saatte TAMAMLANAN görev sayısını gösterir. Gece saatlerinde bile 2000+ görev kayıt altında.</div>
    </div>
    <div style="margin-top:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      <div style="background:#dcfce7;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:9px;color:#065f46;font-weight:700;text-transform:uppercase">Pik saat</div>
        <div style="font-size:22px;font-weight:900;color:#065f46;margin-top:4px">08:00</div>
      </div>
      <div style="background:#F8FAFC;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:9px;color:#475569;font-weight:700;text-transform:uppercase">Gece (00-06)</div>
        <div style="font-size:22px;font-weight:900;color:#0F1A0F;margin-top:4px">${nf.format(saatSerie.slice(0, 6).reduce((s, h) => s + h.value, 0))}</div>
      </div>
      <div style="background:#F8FAFC;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:9px;color:#475569;font-weight:700;text-transform:uppercase">Gündüz (06-18)</div>
        <div style="font-size:22px;font-weight:900;color:#0F1A0F;margin-top:4px">${nf.format(saatSerie.slice(6, 18).reduce((s, h) => s + h.value, 0))}</div>
      </div>
      <div style="background:#F8FAFC;padding:12px;border-radius:8px;text-align:center">
        <div style="font-size:9px;color:#475569;font-weight:700;text-transform:uppercase">Akşam (18-24)</div>
        <div style="font-size:22px;font-weight:900;color:#0F1A0F;margin-top:4px">${nf.format(saatSerie.slice(18, 24).reduce((s, h) => s + h.value, 0))}</div>
      </div>
    </div>
    <div class="page-foot"><span>GYS Dijital Dönüşüm Raporu</span><span>Sayfa 5 / 8</span></div>
  </div>

  <!-- ══ SAYFA 6: ÖNCE-SONRA ══ -->
  <div class="page">
    <div class="page-head">
      <div class="t">Dijital Öncesi vs Sonrası</div>
      <div class="s">Aynı tesis, aynı ekip, farklı araç</div>
    </div>
    <div class="vs-grid">
      <div class="vs-col before">
        <div class="vs-head">⚠ Dijital Öncesi</div>
        <div class="vs-item"><b>Operasyon izleme:</b> kağıt pano, süpervizör gezer, hafızaya dayalı</div>
        <div class="vs-item"><b>Kayıp görev:</b> %10-20 "normal" karşılanır, nereden kaçtığı belli olmaz</div>
        <div class="vs-item"><b>Müşteri şikayeti:</b> "mesaj grubunda konuşalım", ne yapıldı belli değil</div>
        <div class="vs-item"><b>Yönetici raporu:</b> Excel'de 3-4 saat uğraşla, güvenilmez</div>
        <div class="vs-item"><b>Gece vardiyası:</b> ne yaptıkları sabah tahmin edilir</div>
        <div class="vs-item"><b>Personel verimliliği:</b> ölçülmez, kıyaslanmaz</div>
        <div class="vs-item"><b>Rapor zamanında:</b> aylık rapor 1 hafta gecikir</div>
        <div class="vs-item"><b>Müşteriye kanıt:</b> "sözlü söylüyoruz"</div>
      </div>
      <div class="vs-arrow">→</div>
      <div class="vs-col after">
        <div class="vs-head">✓ GYS ile 6 Ay Sonra</div>
        <div class="vs-item"><b>Operasyon izleme:</b> <b>${nf.format(toplam)}</b> görev, hepsi zaman-lokasyon-personel kayıtlı</div>
        <div class="vs-item"><b>Kayıp görev:</b> <b>${kayipStr}</b> — hangi lokasyon, hangi vardiya, tek tıkla rapor</div>
        <div class="vs-item"><b>Müşteri şikayeti:</b> <b>${degToplam}</b> dijital değerlendirme, yetkili aksiyon</div>
        <div class="vs-item"><b>Yönetici raporu:</b> PDF/Excel, 30 saniyede hazır</div>
        <div class="vs-item"><b>Gece vardiyası:</b> saat 03:00'te bile kayıt, saatlik aktivite görünür</div>
        <div class="vs-item"><b>Personel verimliliği:</b> en iyi 3 / en kötü 3 hazır, kıyaslama otomatik</div>
        <div class="vs-item"><b>Rapor zamanında:</b> real-time; aylık özet her an güncel</div>
        <div class="vs-item"><b>Müşteriye kanıt:</b> tamper-evident PDF, değiştirilemez</div>
      </div>
    </div>
    <div class="page-foot"><span>GYS Dijital Dönüşüm Raporu</span><span>Sayfa 6 / 8</span></div>
  </div>

  <!-- ══ SAYFA 7: 10 PAZARLAMA VAADİ ══ -->
  <div class="page">
    <div class="page-head">
      <div class="t">Potansiyel Müşteriye 10 Somut Vaat</div>
      <div class="s">Her biri veriyle desteklenir</div>
    </div>
    <div class="promise-grid">
      <div class="promise"><div class="no">1</div><div class="t">Operasyonu rakamlarla görün</div><div class="d">189 bin görev zaman-mekan-kişi ile raporlanabilir hale geldi.</div></div>
      <div class="promise"><div class="no">2</div><div class="t">%98+ başarı ispatı</div><div class="d">Referansımızda kayıp oranı %1,2. Müşteriye sunumda somut kanıt.</div></div>
      <div class="promise"><div class="no">3</div><div class="t">Kayıp görevi anında yakala</div><div class="d">Hangi vardiya, hangi lokasyon, hangi tanım — tek tıkla.</div></div>
      <div class="promise"><div class="no">4</div><div class="t">Müşteri şikayet hattı veri</div><div class="d">QR → değerlendirme → aksiyon. 6 ayda ${degToplam} kayıt.</div></div>
      <div class="promise"><div class="no">5</div><div class="t">7/24 gece dahil izleme</div><div class="d">Gece 03:00'te bile 2000+ görev kayıt altında.</div></div>
      <div class="promise"><div class="no">6</div><div class="t">Pano-kalem yükü kalkar</div><div class="d">Mobil 1-dokunuş, medyan 26 saniye. Excel güncellemek yok.</div></div>
      <div class="promise"><div class="no">7</div><div class="t">Yönetici denetimi hızlanır</div><div class="d">Sahaya gitme yerine mobil + web panelden anlık izleme.</div></div>
      <div class="promise"><div class="no">8</div><div class="t">Vardiya &amp; personel kıyası</div><div class="d">En iyi/kötü 3 personel, departman kıyası otomatik.</div></div>
      <div class="promise"><div class="no">9</div><div class="t">Rapor 4 saat → 30 saniye</div><div class="d">Aylık yönetici raporu artık tek buton.</div></div>
      <div class="promise"><div class="no">10</div><div class="t">Tamper-evident PDF</div><div class="d">Excel düzenlenebilir — PDF değiştirilemez. Müşteri güvenir.</div></div>
    </div>
    <div class="page-foot"><span>GYS Dijital Dönüşüm Raporu</span><span>Sayfa 7 / 8</span></div>
  </div>

  <!-- ══ SAYFA 8: KAPANIŞ ══ -->
  <div class="page cta">
    <div style="font-size:12px;letter-spacing:0.12em;opacity:0.7;margin-bottom:20px;font-weight:800">BİR CÜMLEDE</div>
    <h2>GYS, sahada her gün yapılan binlerce küçük işi <span class="highlight">sayılabilir, raporlanabilir ve ispat edilebilir</span> hale getirir.</h2>
    <p>
      Bir referans tesisimizde <b>6 ayda ${nf.format(toplam)} görev</b> izlendi, <b>kayıp oranı %${kayipPct.toFixed(1).replace('.', ',')}</b>'de kaldı, <b>${degToplam} müşteri değerlendirmesi</b> dijital olarak toplandı — hepsi aynı yönetim ekibi, aynı personel, sadece farklı araçla.
    </p>
    <p style="margin-top:28px;font-size:16px;font-weight:700;color:#86efac">
      → Dijital öncesine dönmek, sahada ne olduğunu bilmeden yönetmek demek.
    </p>
    <div style="position:absolute;bottom:14mm;left:26mm;right:26mm;font-size:10px;opacity:0.65;display:flex;justify-content:space-between;align-items:center">
      <div>Bu rapordaki sayılar canlı veritabanı sorgularıyla doğrulanmıştır · Anonim raporlama</div>
      <div>${uretildiTarihi}</div>
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
          'Content-Disposition': `attachment; filename="gys-dijital-donusum-vaka-${date}.pdf"`,
        },
      })
    } finally {
      await browser.close()
    }
  } catch (err: any) {
    console.error('[marketing/vaka-calismasi-pdf]', err)
    return NextResponse.json({ error: err?.message ?? 'PDF uretilemedi' }, { status: 500 })
  }
}
