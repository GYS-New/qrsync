/**
 * POST /api/admin/yedekler/restore
 *
 * Belirli tarih/tablo yedeğini DB'ye geri yükler. id bazlı upsert ile çalışır:
 *   - Yedekteki kayıt DB'de varsa → güncelleme
 *   - Yedekteki kayıt DB'de yoksa → ekleme
 *   - DB'de olup yedekte olmayan kayıtlar SİLİNMEZ (güvenlik için)
 *
 * Body:
 *   { tarih: 'YYYY-MM-DD', tablo: string, onay: string }
 *   onay = `RESTORE-{tablo}` olmalı (yanlışlıkla tetiklemeyi engellemek için)
 *
 * Audit_log kaydı zorunlu — kim ne zaman hangi yedeği geri yükledi.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { gunzipSync } from 'zlib'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Restore izinli tablolar — destekleyici/config tabloları
const ALLOWED_TABLES = new Set([
  'canli_gorevler', 'canli_gorevler_arsiv',
  'gorevler', 'gorevler_arsiv',
  'gorev_kurallari',
  'musteri_degerlendirmeleri', 'musteri_degerlendirmeleri_arsiv',
  'musteri_degerlendirme_aksiyonlari', 'musteri_degerlendirme_aksiyonlari_arsiv',
  'personel_mesai_kayitlari', 'personel_mesai_kayitlari_arsiv',
  'checklist_sonuc_basliklari', 'checklist_sonuc_basliklari_arsiv',
  'checklist_sonuc_maddeleri', 'checklist_sonuc_maddeleri_arsiv',
  'lokasyonlar', 'lokasyon_gruplari', 'lokasyon_grup_uyeleri',
  'kullanici_lokasyon_yetkileri',
  'simulasyon', 'simulasyon_kural_atamalar',
])

const BATCH_SIZE = 500

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
    if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
      return NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const tarih = String(body.tarih ?? '')
    const tablo = String(body.tablo ?? '')
    const onay = String(body.onay ?? '')

    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz tarih' }, { status: 400 })
    }
    if (!ALLOWED_TABLES.has(tablo)) {
      return NextResponse.json({ ok: false, error: `Restore izinli olmayan tablo: ${tablo}` }, { status: 400 })
    }
    if (onay !== `RESTORE-${tablo}`) {
      return NextResponse.json({ ok: false, error: 'Onay kodu eksik veya yanlış. RESTORE-<tablo_adi> yazılmalı.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const path = `${tarih}/${tablo}.json.gz`

    const baslangic = Date.now()
    const { data: blob, error: dlErr } = await admin.storage.from('backups').download(path)
    if (dlErr || !blob) {
      return NextResponse.json({ ok: false, error: `Yedek dosya bulunamadı: ${path}` }, { status: 404 })
    }

    const buf = Buffer.from(await blob.arrayBuffer())
    const rows = JSON.parse(gunzipSync(buf).toString('utf-8')) as any[]
    if (!Array.isArray(rows)) {
      return NextResponse.json({ ok: false, error: 'Yedek format hatası: dizi bekleniyor' }, { status: 400 })
    }

    // Batch upsert
    let basariliBatch = 0
    let hataBatch = 0
    const hatalar: string[] = []
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const { error } = await admin.from(tablo).upsert(batch as any, { onConflict: 'id', ignoreDuplicates: false })
      if (error) {
        hataBatch++
        hatalar.push(`batch ${Math.floor(i / BATCH_SIZE)}: ${error.message}`)
        if (hatalar.length >= 5) break  // İlk 5 batch hatasından sonra dur
      } else {
        basariliBatch++
      }
    }

    const sure = Math.round((Date.now() - baslangic) / 1000)
    const detay = {
      tarih, tablo,
      toplam_satir: rows.length,
      basarili_batch: basariliBatch,
      hata_batch: hataBatch,
      sure_saniye: sure,
      ilk_hatalar: hatalar.slice(0, 5),
    }

    // Audit log zorunlu
    try {
      await admin.from('audit_log').insert({
        tip: 'yedek_restore',
        tablo,
        kullanici_id: user.id,
        basarili: hataBatch === 0,
        satir_sayisi: rows.length,
        hata_mesaji: hatalar.length > 0 ? hatalar.join('; ').slice(0, 1000) : null,
        detay,
      })
    } catch (e) {
      console.error('[yedek_restore] audit_log hata:', e)
    }

    if (hataBatch > 0) {
      return NextResponse.json({ ok: false, error: `Restore kısmen başarısız: ${hatalar[0]}`, ...detay }, { status: 500 })
    }
    return NextResponse.json({ ok: true, ...detay })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Restore başarısız' }, { status: 500 })
  }
}
