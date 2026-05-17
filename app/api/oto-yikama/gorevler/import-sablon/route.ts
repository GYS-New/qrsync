/**
 * GET /api/oto-yikama/gorevler/import-sablon?firma_id=...
 *
 * Boş bir excel şablonu döner — 3 sütun: PLAKA, LOKASYON, TARIH
 * Açıklama satırı + örnek satır + firmanın gerçek plaka/lokasyon listesi
 * referans olarak ekstra sayfalarda verilir.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Sadece SA' }, { status: 403 })
  }

  const firmaId = req.nextUrl.searchParams.get('firma_id')
  if (!firmaId) return NextResponse.json({ error: 'firma_id gerekli' }, { status: 400 })

  const admin = createAdminClient()
  if (!(await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif'))) {
    return NextResponse.json({ error: 'Oto Yıkama modülü pasif' }, { status: 403 })
  }

  // Referans verisi: araçlar + Oto Yıkama lokasyonları
  const [aracRes, ustOtoRes] = await Promise.all([
    admin.from('araclar').select('plaka, marka, model, departman').eq('firma_id', firmaId).eq('aktif', true).order('plaka'),
    admin.from('lokasyonlar').select('id').eq('firma_id', firmaId).eq('oto_yikama_lokasyon', true).eq('aktif', true),
  ])
  const ustIds = (ustOtoRes.data ?? []).map((u: any) => u.id)
  const { data: altLoklar } = ustIds.length > 0
    ? await admin.from('lokasyonlar').select('id, tanim, parent_id').in('parent_id', ustIds).eq('aktif', true).order('tanim')
    : { data: [] as any[] }

  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'İO-GYS'
  wb.created = new Date()

  const HDR_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1D4ED8' } }
  const HDR_FONT = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  const ALIGN_C = { horizontal: 'center' as const, vertical: 'middle' as const }
  const BORDER = {
    top: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
  }

  // ── Sayfa 1: Görev Şablonu ──────────────────────────────────────────────
  const ws = wb.addWorksheet('Görev Şablonu', { properties: { tabColor: { argb: 'FF1D4ED8' } } })
  ws.getColumn(1).width = 18
  ws.getColumn(2).width = 28
  ws.getColumn(3).width = 16

  // Başlık + açıklama
  const t = ws.getRow(1); t.height = 26
  t.getCell(1).value = '🚗 Oto Yıkama — Toplu Görev Şablonu'
  t.getCell(1).font = { bold: true, size: 14 }
  ws.mergeCells('A1:C1')

  const desc = ws.getRow(2); desc.height = 36
  desc.getCell(1).value = 'Her satır 1 görev olarak oluşturulur. PLAKA + LOKASYON + TARIH üçlüsü zorunlu. Tarih formatı: YYYY-MM-DD (örn 2026-05-20). Lokasyon tam tanım olmalı; alttaki "Plakalar" ve "Lokasyonlar" sekmelerinden değerleri kopyalayabilirsiniz.'
  desc.getCell(1).font = { size: 10, color: { argb: 'FF475569' } }
  desc.getCell(1).alignment = { wrapText: true, vertical: 'top' as const }
  ws.mergeCells('A2:C2')

  // Header satırı
  const h = ws.getRow(4); h.height = 24
  ;['PLAKA', 'LOKASYON', 'TARIH'].forEach((txt, i) => {
    const c = h.getCell(i + 1)
    c.value = txt
    c.style = { font: HDR_FONT, fill: HDR_FILL, alignment: ALIGN_C, border: BORDER }
  })

  // Örnek satırlar (silinmesi tavsiye edilir)
  const ornek: [string, string, string][] = [
    ['34ABC123', 'İSTASYON-1', '2026-05-20'],
    ['34ABC123', 'İSTASYON-2', '2026-05-21'],
    ['06XYZ789', 'İSTASYON-1', '2026-05-20'],
  ]
  ornek.forEach((row, i) => {
    const r = ws.getRow(5 + i); r.height = 18
    row.forEach((v, idx) => {
      const c = r.getCell(idx + 1)
      c.value = v
      c.style = {
        font: { size: 10, italic: true, color: { argb: 'FF94A3B8' } },
        fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFBEB' } },
        border: BORDER,
        alignment: { vertical: 'middle' as const },
      }
    })
  })

  // Yardımcı not
  const note = ws.getRow(9); note.height = 20
  note.getCell(1).value = '↑ Yukarıdaki örnek satırları silebilirsiniz. Kendi verilerinizi 5. satırdan itibaren yazın.'
  note.getCell(1).font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } }
  ws.mergeCells('A9:C9')

  // ── Sayfa 2: Plakalar ───────────────────────────────────────────────────
  const wsPlk = wb.addWorksheet('Plakalar', { properties: { tabColor: { argb: 'FF7C3AED' } } })
  wsPlk.getColumn(1).width = 14
  wsPlk.getColumn(2).width = 18
  wsPlk.getColumn(3).width = 18
  wsPlk.getColumn(4).width = 22
  const ph = wsPlk.getRow(1); ph.height = 24
  ;['PLAKA', 'MARKA', 'MODEL', 'DEPARTMAN'].forEach((txt, i) => {
    const c = ph.getCell(i + 1)
    c.value = txt
    c.style = { font: HDR_FONT, fill: HDR_FILL, alignment: ALIGN_C, border: BORDER }
  })
  ;(aracRes.data ?? []).forEach((a: any, i: number) => {
    const r = wsPlk.getRow(i + 2); r.height = 16
    ;[a.plaka, a.marka ?? '', a.model ?? '', a.departman ?? ''].forEach((v, idx) => {
      const c = r.getCell(idx + 1)
      c.value = v
      c.style = { font: { size: 10 }, border: BORDER }
    })
  })

  // ── Sayfa 3: Lokasyonlar ────────────────────────────────────────────────
  const wsLok = wb.addWorksheet('Lokasyonlar', { properties: { tabColor: { argb: 'FF16A34A' } } })
  wsLok.getColumn(1).width = 28
  wsLok.getColumn(2).width = 28
  const lh = wsLok.getRow(1); lh.height = 24
  ;['LOKASYON', 'ÜST LOKASYON'].forEach((txt, i) => {
    const c = lh.getCell(i + 1)
    c.value = txt
    c.style = { font: HDR_FONT, fill: HDR_FILL, alignment: ALIGN_C, border: BORDER }
  })
  // Üst lokasyon adlarını çek
  const ustMap = new Map<string, string>()
  if (ustIds.length > 0) {
    const { data: ustRows } = await admin.from('lokasyonlar').select('id, tanim').in('id', ustIds)
    for (const u of (ustRows ?? []) as any[]) ustMap.set(u.id, u.tanim)
  }
  ;(altLoklar ?? []).forEach((l: any, i: number) => {
    const r = wsLok.getRow(i + 2); r.height = 16
    ;[l.tanim, ustMap.get(l.parent_id) ?? ''].forEach((v, idx) => {
      const c = r.getCell(idx + 1)
      c.value = v
      c.style = { font: { size: 10 }, border: BORDER }
    })
  })

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="oto-yikama-gorev-sablon.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
