/**
 * POST /api/oto-yikama/gorevler/import-excel
 * multipart/form-data: file + firma_id + dry_run (opsiyonel '1')
 *
 * Excel'i parse eder: her satır PLAKA + LOKASYON + TARIH.
 * Doğrulama: plaka aktif/var, lokasyon Oto Yıkama altında, tarih geçerli,
 * duplicate (aynı (arac, lokasyon, hedef_tarih) zaten varsa) atla.
 *
 * dry_run=1 ise sadece önizleme döner (insert yapmaz).
 * Aksi halde olustur endpoint'i mantığıyla aynı şekilde insert eder.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function normalizeStr(v: any): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  return String(v).trim()
}

function excelSerialToDate(n: number): string | null {
  // Excel epoch: 1900-01-01 = 1 (with leap bug)
  if (!Number.isFinite(n) || n < 1) return null
  const ms = (n - 25569) * 86400 * 1000
  const d = new Date(ms)
  if (!Number.isFinite(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseTarih(v: any): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const day = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  if (typeof v === 'number') return excelSerialToDate(v)
  const s = normalizeStr(v)
  if (DATE_RE.test(s)) return s
  // DD.MM.YYYY veya DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (m) {
    const [, dd, mm, yy] = m
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  }
  return null
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id, rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Form okunamadı' }, { status: 400 })

  const file = form.get('file') as File | null
  const firmaId = form.get('firma_id') as string | null
  const dryRun = String(form.get('dry_run') ?? '') === '1'

  if (!file) return NextResponse.json({ ok: false, error: 'file gerekli' }, { status: 400 })
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })

  const admin = createAdminClient()
  if (!(await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif'))) {
    return NextResponse.json({ ok: false, error: 'Oto Yıkama modülü pasif' }, { status: 403 })
  }

  // Excel parse
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const arrayBuffer = await file.arrayBuffer()
  await wb.xlsx.load(arrayBuffer)

  const ws = wb.getWorksheet('Görev Şablonu') ?? wb.worksheets[0]
  if (!ws) return NextResponse.json({ ok: false, error: 'Excel sayfası bulunamadı' }, { status: 400 })

  type Satir = { satir: number; plaka: string; lokasyon: string; tarih: string; hata?: string }
  const ham: Satir[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    // İlk birkaç satır şablon başlığı — header'ı bulup atlatmak yerine
    // sade kontrol: ilk hücre 'PLAKA' ise header, atla
    const v1 = normalizeStr(row.getCell(1).value)
    if (!v1) return
    if (v1.toUpperCase() === 'PLAKA' || v1.startsWith('🚗') || v1.startsWith('↑')) return

    const plaka = normalizeStr(row.getCell(1).value).toUpperCase().replace(/\s+/g, '')
    const lokasyon = normalizeStr(row.getCell(2).value)
    const tarih = parseTarih(row.getCell(3).value)
    if (!plaka && !lokasyon && !tarih) return // tamamen boş satır

    const sat: Satir = { satir: rowNumber, plaka, lokasyon, tarih: tarih ?? '' }
    if (!plaka) sat.hata = 'PLAKA boş'
    else if (!lokasyon) sat.hata = 'LOKASYON boş'
    else if (!tarih) sat.hata = 'TARIH geçersiz (YYYY-MM-DD)'
    ham.push(sat)
  })

  if (ham.length === 0) {
    return NextResponse.json({ ok: false, error: 'Excel\'de okunabilir satır yok' }, { status: 400 })
  }

  // Lookup tabloları
  const plakaSet = new Set(ham.map(h => h.plaka).filter(Boolean))
  const lokSet = new Set(ham.map(h => h.lokasyon).filter(Boolean))

  const { data: araclar } = await admin
    .from('araclar')
    .select('id, plaka, aktif')
    .eq('firma_id', firmaId)
    .in('plaka', [...plakaSet])
  const aracMap = new Map<string, { id: string; aktif: boolean }>(
    (araclar ?? []).map((a: any) => [String(a.plaka).toUpperCase().replace(/\s+/g, ''), { id: a.id, aktif: a.aktif }]),
  )

  // Lokasyonlar: Oto Yıkama altı + tam tanım eşleşmeli
  const { data: ustOto } = await admin
    .from('lokasyonlar').select('id').eq('firma_id', firmaId).eq('oto_yikama_lokasyon', true).eq('aktif', true)
  const ustIds = (ustOto ?? []).map((u: any) => u.id)
  const { data: altLoks } = ustIds.length > 0
    ? await admin.from('lokasyonlar').select('id, tanim, aktif').in('parent_id', ustIds).eq('aktif', true)
    : { data: [] as any[] }
  const lokMap = new Map<string, string>(
    (altLoks ?? []).map((l: any) => [String(l.tanim).trim(), l.id]),
  )

  // Duplicate kontrolü: var olan metadata kayıtları
  const tarihList = [...new Set(ham.map(h => h.tarih).filter(Boolean))]
  const aracIdList = [...new Set([...aracMap.values()].map(a => a.id))]
  const { data: mevcutMeta } = aracIdList.length > 0 && tarihList.length > 0
    ? await admin
      .from('oto_yikama_gorev_metadata')
      .select('arac_id, hedef_tarih')
      .in('arac_id', aracIdList)
      .in('hedef_tarih', tarihList)
    : { data: [] as any[] }
  const mevcutSet = new Set(
    (mevcutMeta ?? []).map((m: any) => `${m.arac_id}__${m.hedef_tarih}`),
  )

  // Doğrulama
  type Plan = { satir: number; plaka: string; arac_id: string; lokasyon: string; lokasyon_id: string; tarih: string }
  const planli: Plan[] = []
  const hatalilar: Satir[] = []
  const duplicates: Satir[] = []
  for (const s of ham) {
    if (s.hata) { hatalilar.push(s); continue }
    const arac = aracMap.get(s.plaka)
    if (!arac) { hatalilar.push({ ...s, hata: `Plaka sistemde yok: ${s.plaka}` }); continue }
    if (!arac.aktif) { hatalilar.push({ ...s, hata: `Plaka pasif: ${s.plaka}` }); continue }
    const lokId = lokMap.get(s.lokasyon)
    if (!lokId) { hatalilar.push({ ...s, hata: `Lokasyon Oto Yıkama altında yok: ${s.lokasyon}` }); continue }
    const key = `${arac.id}__${s.tarih}`
    if (mevcutSet.has(key)) { duplicates.push({ ...s, hata: 'Zaten görev var (aynı plaka+tarih)' }); continue }
    planli.push({ satir: s.satir, plaka: s.plaka, arac_id: arac.id, lokasyon: s.lokasyon, lokasyon_id: lokId, tarih: s.tarih })
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      ozet: { okunan: ham.length, eklenecek: planli.length, hatali: hatalilar.length, duplicate: duplicates.length },
      eklenecek_ornek: planli.slice(0, 30),
      hatalilar: hatalilar.slice(0, 30),
      duplicates: duplicates.slice(0, 30),
    })
  }

  // Insert — batch
  // Durum: hedef_tarih > bugün → HAZIR (cron 00:01 TR'de ACIK'a alır), bugün/geçmiş → direkt ACIK
  const bugunTR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
  let eklenen = 0
  const insertHatalari: string[] = []
  const BATCH = 100
  for (let i = 0; i < planli.length; i += BATCH) {
    const chunk = planli.slice(i, i + BATCH)
    // 1) gorevler
    const gorevRows = chunk.map(c => ({
      firma_id: firmaId,
      tanim: `Oto Yıkama - ${c.plaka}`,
      lokasyon_id: c.lokasyon_id,
      atanan_kullanici_id: null,
      durum: c.tarih > bugunTR ? 'HAZIR' : 'ACIK',
      olusturan_id: me.id,
    }))
    const { data: inserted, error: gErr } = await admin.from('gorevler').insert(gorevRows).select('id')
    if (gErr || !inserted || inserted.length !== chunk.length) {
      insertHatalari.push(`Batch ${i}: ${gErr?.message ?? 'beklenen satır eşleşmedi'}`)
      continue
    }
    // 2) metadata
    const metaRows = inserted.map((g: any, idx: number) => ({
      gorev_id: g.id,
      arac_id: chunk[idx].arac_id,
      plaka_snapshot: chunk[idx].plaka,
      hedef_tarih: chunk[idx].tarih,
    }))
    const { error: mErr } = await admin.from('oto_yikama_gorev_metadata').insert(metaRows)
    if (mErr) {
      // Rollback
      await admin.from('gorevler').delete().in('id', inserted.map((g: any) => g.id))
      insertHatalari.push(`Batch ${i} metadata: ${mErr.message}`)
      continue
    }
    eklenen += chunk.length
  }

  try {
    await admin.from('audit_log').insert({
      tip: 'oto_yikama_excel_import',
      tablo: 'gorevler',
      kullanici_id: me.id,
      firma_id: firmaId,
      satir_sayisi: eklenen,
      basarili: insertHatalari.length === 0,
      hata_mesaji: insertHatalari.length > 0 ? insertHatalari.join('; ').slice(0, 1000) : null,
      detay: { okunan: ham.length, eklenecek: planli.length, eklenen, hatali: hatalilar.length, duplicate: duplicates.length },
    })
  } catch {}

  return NextResponse.json({
    ok: true,
    ozet: { okunan: ham.length, eklenecek: planli.length, eklenen, hatali: hatalilar.length, duplicate: duplicates.length },
    insert_hatalari: insertHatalari.slice(0, 10),
    hatalilar: hatalilar.slice(0, 30),
    duplicates: duplicates.slice(0, 30),
  })
}
