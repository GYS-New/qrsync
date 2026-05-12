/**
 * POST/GET /api/cron/yedekleme
 *
 * Her gece TR 00:30'da çalışır. Kritik tabloları JSON+gzip olarak Supabase
 * Storage 'backups' bucket'ına yazar. Yapı:
 *   backups/YYYY-MM-DD/<tablo_adi>.json.gz
 *
 * Yapı şöyle:
 *   - Her tablo için tam çekim (paginated) → JSON array
 *   - JSON.stringify + gzip
 *   - Storage'a upsert (aynı gün ikinci kez çalışırsa üzerine yazar)
 *   - 90 günden eski yedekleri sil (retention)
 *   - audit_log + cron_log kaydı
 *
 * Restore tarafı /api/admin/yedekler endpoint'inden SA tarafından çağrılır.
 *
 * Güvenlik: x-cron-token header gerekli (Railway-managed cron veya
 * SA tarafından /api/admin/cron-tetikle üzerinden tetiklenir).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { gzipSync } from 'zlib'

export const dynamic = 'force-dynamic'
export const maxDuration = 300  // 5 dakika; büyük dump için

// Yedek alınacak tablolar — kritik veri + config. Boyut tahmini hesaplandı.
// PAGE_SIZE: tek seferde Supabase'den çekilen satır sayısı (max 1000 / RPC sınırı).
const BACKUP_TABLES = [
  'canli_gorevler',
  'canli_gorevler_arsiv',
  'gorevler',
  'gorevler_arsiv',
  'gorev_kurallari',
  'musteri_degerlendirmeleri',
  'musteri_degerlendirmeleri_arsiv',
  'musteri_degerlendirme_aksiyonlari',
  'musteri_degerlendirme_aksiyonlari_arsiv',
  'personel_mesai_kayitlari',
  'personel_mesai_kayitlari_arsiv',
  'checklist_sonuc_basliklari',
  'checklist_sonuc_basliklari_arsiv',
  'checklist_sonuc_maddeleri',
  'checklist_sonuc_maddeleri_arsiv',
  'audit_log',
  'lokasyonlar',
  'lokasyon_gruplari',
  'lokasyon_grup_uyeleri',
  'kullanici_lokasyon_yetkileri',
  'users',
  'firmalar',
  'projeler',
  'simulasyon',
  'simulasyon_kural_atamalar',
  'cron_log',
] as const

const PAGE_SIZE = 1000
const RETENTION_DAYS = 90

type TabloSonuc = {
  tablo: string
  satir: number
  byte_ham: number
  byte_gzip: number
  hata?: string
}

async function tabloyuCek(admin: any, tablo: string): Promise<any[]> {
  const all: any[] = []
  let from = 0
  while (true) {
    const { data, error } = await admin.from(tablo).select('*').range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`${tablo}: ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

async function tabloyuYedekle(admin: any, tablo: string, tarih: string): Promise<TabloSonuc> {
  try {
    const rows = await tabloyuCek(admin, tablo)
    const json = JSON.stringify(rows)
    const buf = Buffer.from(json, 'utf-8')
    const gz = gzipSync(buf, { level: 6 })

    const path = `${tarih}/${tablo}.json.gz`
    const { error: upErr } = await admin.storage
      .from('backups')
      .upload(path, gz, {
        contentType: 'application/gzip',
        upsert: true,
      })
    if (upErr) throw new Error(`upload: ${upErr.message}`)

    return { tablo, satir: rows.length, byte_ham: buf.length, byte_gzip: gz.length }
  } catch (e: any) {
    return { tablo, satir: 0, byte_ham: 0, byte_gzip: 0, hata: e?.message ?? 'bilinmeyen hata' }
  }
}

async function eskiYedekleriSil(admin: any, tarih: string): Promise<{ silinen_klasor: number; hata?: string }> {
  try {
    // Bugünden RETENTION_DAYS öncesi cutoff
    const cutoff = new Date(`${tarih}T00:00:00+03:00`)
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    // Tüm klasörleri listele (root)
    const { data: klasorler, error: listErr } = await admin.storage
      .from('backups')
      .list('', { limit: 1000 })
    if (listErr) throw new Error(`list: ${listErr.message}`)

    let silinen = 0
    for (const k of klasorler ?? []) {
      // Klasör adı 'YYYY-MM-DD' formatında olmalı
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k.name)) continue
      if (k.name >= cutoffStr) continue  // retention içinde

      // Bu klasördeki tüm dosyaları listele + sil
      const { data: dosyalar } = await admin.storage
        .from('backups')
        .list(k.name, { limit: 1000 })
      if (!dosyalar?.length) continue

      const paths = dosyalar.map((d: any) => `${k.name}/${d.name}`)
      const { error: rmErr } = await admin.storage.from('backups').remove(paths)
      if (rmErr) console.error(`[yedekleme] silme hatası ${k.name}:`, rmErr.message)
      else silinen++
    }
    return { silinen_klasor: silinen }
  } catch (e: any) {
    return { silinen_klasor: 0, hata: e?.message ?? 'bilinmeyen hata' }
  }
}

async function handle(req: NextRequest) {
  const cronToken = req.headers.get('x-cron-token')
  const envSecret = process.env.CRON_SECRET
  if (!cronToken || !envSecret || cronToken !== envSecret) {
    return NextResponse.json({ ok: false, error: 'cron auth required' }, { status: 401 })
  }

  const admin = createAdminClient()
  const baslangic = Date.now()

  // TR günü (yedek klasör adı)
  const tarih = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })

  // Tüm tabloları paralel olarak değil sıralı işle (memory peak'i engellemek için)
  const sonuclar: TabloSonuc[] = []
  for (const tablo of BACKUP_TABLES) {
    const r = await tabloyuYedekle(admin, tablo, tarih)
    sonuclar.push(r)
  }

  // Retention temizliği
  const retention = await eskiYedekleriSil(admin, tarih)

  const sure = Math.round((Date.now() - baslangic) / 1000)
  const basariliTablo = sonuclar.filter(r => !r.hata).length
  const toplamSatir = sonuclar.reduce((s, r) => s + r.satir, 0)
  const toplamHam = sonuclar.reduce((s, r) => s + r.byte_ham, 0)
  const toplamGzip = sonuclar.reduce((s, r) => s + r.byte_gzip, 0)
  const hatalar = sonuclar.filter(r => r.hata).map(r => `${r.tablo}: ${r.hata}`)

  const rapor = {
    calisma_zamani: new Date().toISOString(),
    tarih,
    sure_saniye: sure,
    basarili_tablo: basariliTablo,
    toplam_tablo: BACKUP_TABLES.length,
    toplam_satir: toplamSatir,
    boyut_ham_byte: toplamHam,
    boyut_gzip_byte: toplamGzip,
    retention_silinen_klasor: retention.silinen_klasor,
    retention_hata: retention.hata,
    tablolar: sonuclar,
    hatalar,
  }

  // cron_log
  try {
    await admin.from('cron_log').insert({ tip: 'yedekleme', sonuc: rapor as any })
  } catch (e) { console.error('[yedekleme] cron_log:', e) }

  // audit_log — kritik işlem
  try {
    await admin.from('audit_log').insert({
      tip: 'yedekleme',
      tablo: 'storage.objects',
      basarili: hatalar.length === 0,
      satir_sayisi: toplamSatir,
      hata_mesaji: hatalar.length > 0 ? hatalar.join('; ').slice(0, 1000) : null,
      detay: {
        tarih, sure_saniye: sure,
        basarili_tablo: basariliTablo, toplam_tablo: BACKUP_TABLES.length,
        boyut_gzip_byte: toplamGzip,
        retention_silinen: retention.silinen_klasor,
      },
    })
  } catch (e) { console.error('[yedekleme] audit_log:', e) }

  return NextResponse.json({ ok: hatalar.length === 0, ...rapor })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
