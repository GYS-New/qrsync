/**
 * GET /api/reports/genel-rapor-pdf?firmaId=...
 *
 * Server-side HTML template + Puppeteer → A4 PDF.
 * NOT: Grafikler için Excel şablonu daha zengin; PDF sadece KPI + detay
 * tabloları içerir. Görsel grafik istenirse Excel indirilip "Save as PDF"
 * ile dönüştürülebilir. (Excel şablonu chart'ları KPI formülleriyle bağlı.)
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGenelRaporData } from '@/lib/reports/genel-rapor-data'

export const runtime = 'nodejs'
export const maxDuration = 60

function esc(s: any): string {
  return String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!))
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
    })

    const toplamHedef       = data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0) || data.toplamGorev
    const toplamGerceklesen = data.toplamTamamlanan + data.toplamSapma
    const genelOran         = toplamHedef > 0 ? Math.round(toplamGerceklesen / toplamHedef * 100) : 0

    const css = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Inter', -apple-system, sans-serif; color: #111827; font-size: 11px; }
      .page { page-break-after: always; padding: 14px 18px; }
      .page:last-child { page-break-after: auto; }
      h1 { font-size: 18px; font-weight: 800; margin-bottom: 6px; color: #0F1A0F; }
      h2 { font-size: 14px; font-weight: 700; margin: 12px 0 8px; color: #1A5C2A; border-bottom: 2px solid #1A5C2A; padding-bottom: 4px; }
      .meta { display: grid; grid-template-columns: 110px 1fr 110px 1fr; gap: 4px 12px; background: #EFF6FF; padding: 8px 12px; border-radius: 4px; font-size: 10.5px; margin: 8px 0 12px; }
      .meta b { color: #475569; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      thead { background: #1A5C2A; color: white; }
      th, td { padding: 5px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
      thead th { font-weight: 700; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.4px; }
      tbody tr:nth-child(even) { background: #F8FAFC; }
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
      .kpi { background: #F8FAFC; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; text-align: center; }
      .kpi .label { font-size: 9.5px; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
      .kpi .value { font-size: 18px; font-weight: 900; color: #111827; margin-top: 4px; }
      .footer { margin-top: 10px; font-size: 9px; color: #9ca3af; text-align: center; }
    `

    function tableRows(rows: any[][]): string {
      return rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
    }

    const kpiCards = `
      <div class="kpi-grid">
        <div class="kpi"><div class="label">Hedef Frekans</div><div class="value">${toplamHedef}</div></div>
        <div class="kpi"><div class="label">Tamamlanan</div><div class="value">${data.toplamTamamlanan}</div></div>
        <div class="kpi"><div class="label">Sapma</div><div class="value">${data.toplamSapma}</div></div>
        <div class="kpi"><div class="label">Kayıp</div><div class="value">${data.toplamKayip}</div></div>
        <div class="kpi"><div class="label">Ekstra</div><div class="value">${data.toplamEkstra ?? data.frekansDisiGorevler.length}</div></div>
        <div class="kpi"><div class="label">Gerçekleşen</div><div class="value">${toplamGerceklesen}</div></div>
        <div class="kpi"><div class="label">Başarı</div><div class="value">%${data.genelBasari}</div></div>
        <div class="kpi"><div class="label">Genel Oran</div><div class="value">%${genelOran}</div></div>
      </div>
    `

    const html = `<!DOCTYPE html>
<html lang="tr"><head><meta charset="UTF-8"><title>Frekansiyel Görevler Raporu</title><style>${css}</style></head>
<body>
  <!-- Sayfa 1: Özet -->
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
    <p style="font-size:10px;color:#6b7280;margin-top:8px;font-style:italic">
      Grafik görünümü için Excel indir → Excel'de "Kaydet As → PDF" yaparak grafikli PDF elde edebilirsiniz.
    </p>
  </div>

  <!-- Sayfa 2: Grup Metrikleri tablosu -->
  <div class="page">
    <h2>Grup Metrikleri</h2>
    <table>
      <thead><tr>
        <th>SN</th><th>Grup</th><th>Üst Lok.</th><th>Lokasyon</th><th>V.Frekans</th>
        <th>Hedef</th><th>Tamam.</th><th>Ekstra</th><th>Sapma</th><th>Kayıp</th><th>Başarı</th><th>Genel</th>
      </tr></thead>
      <tbody>${tableRows(data.grupMetrikleri.map((g, i) => [
        i + 1, g.grup, g.ustLokasyon, g.lokasyon, g.gunlukFrekans,
        g.hedef, g.tamamlanan, g.ekstra ?? 0, g.sapma, g.kayip, `%${g.basariOrani}`, `%${g.genelOran}`,
      ]))}</tbody>
    </table>
  </div>

  <!-- Sayfa 3: Tamamlanan -->
  <div class="page">
    <h2>Tamamlanan Frekanslar (${data.tamamlananGorevler.length})</h2>
    <table>
      <thead><tr>
        <th>SN</th><th>Personel</th><th>Üst Lok.</th><th>Lokasyon</th><th>Görev No</th>
        <th>Görev</th><th>Tarih-Saat</th><th>Durum</th>
      </tr></thead>
      <tbody>${tableRows(data.tamamlananGorevler.map(t =>
        [t.sn, t.personel, t.ustLokasyon, t.lokasyon, t.gorevNo, t.gorevTanimi, t.tarihSaat, t.durum]
      ))}</tbody>
    </table>
  </div>

  <!-- Sayfa 4: Sapmalar -->
  <div class="page">
    <h2>Sapmalar (${data.sapmaGorevler.length})</h2>
    <table>
      <thead><tr>
        <th>SN</th><th>Personel</th><th>Üst Lok.</th><th>Lokasyon</th><th>Görev No</th>
        <th>Görev</th><th>Tarih-Saat</th><th>Sapma Nedeni</th>
      </tr></thead>
      <tbody>${tableRows(data.sapmaGorevler.map(s =>
        [s.sn, s.personel, s.ustLokasyon, s.lokasyon, s.gorevNo, s.gorevTanimi, s.tarihSaat, s.sapmaNedeni]
      ))}</tbody>
    </table>
  </div>

  <!-- Sayfa 5: Kayıp -->
  <div class="page">
    <h2>Kayıp Frekanslar (${data.kayipGorevler.length})</h2>
    <table>
      <thead><tr>
        <th>SN</th><th>Üst Lok.</th><th>Lokasyon</th><th>Görev No</th>
        <th>Görev</th><th>Tarih</th><th>Personel</th><th>Durum</th><th>Kayıp Nedeni</th>
      </tr></thead>
      <tbody>${tableRows(data.kayipGorevler.map(k => {
        const tanim = (k.vardiyaNo && !/VARD[İI]YA/i.test(String(k.gorevTanimi ?? '')))
          ? `${k.gorevTanimi}  ·  V${k.vardiyaNo}` : k.gorevTanimi
        return [k.sn, k.ustLokasyon, k.lokasyon, k.gorevNo, tanim, k.tarih, k.iptalEden ?? 'sistem', k.durum, k.kayipNedeni]
      }))}</tbody>
    </table>
  </div>

  <!-- Sayfa 6: Frekans Dışı -->
  <div class="page">
    <h2>Frekans Dışı / Ekstra Görevler (${data.frekansDisiGorevler.length})</h2>
    <table>
      <thead><tr>
        <th>SN</th><th>Üst Lok.</th><th>Grup</th><th>Lokasyon</th>
        <th>Görev</th><th>Tarih-Saat</th><th>Süre</th><th>Personel</th><th>Gerekçe</th>
      </tr></thead>
      <tbody>${tableRows(data.frekansDisiGorevler.map(f =>
        [f.sn, f.ustLokasyon, f.grupTanimi, f.lokasyonTanimi, f.aciklama, f.tarihSaat, f.gorevSuresi, f.personel, f.gerekce || '']
      ))}</tbody>
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
      await page.setContent(html, { waitUntil: 'networkidle0' })
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
