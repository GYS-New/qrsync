/**
 * POST /api/admin/yedekler/restore-firma
 *
 * Bir firmayı yedekten geri yükler. Sadece o firma_id'ye ait kayıtlar
 * upsert edilir — diğer firmalar dokunulmaz.
 *
 * Restore sırası (FK dependency):
 *  1. firmalar
 *  2. projeler
 *  3. lokasyonlar
 *  4. lokasyon_gruplari
 *  5. lokasyon_grup_uyeleri (grup_id IN o firmanın grupları)
 *  6. users
 *  7. gorev_kurallari
 *  8. kullanici_lokasyon_yetkileri (user_id IN o firmanın users'ı)
 *
 * Body:
 *   { tarih: 'YYYY-MM-DD', firma_id: uuid, onay: string }
 *   onay = `RESTORE-FIRMA-{firma_id_first8}` (yanlışlıkla tetiklemeyi engellemek için)
 *
 * Yetki: SA only. Audit log zorunlu.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { gunzipSync } from 'zlib'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 500

// Restore sırası — FK dependency'ye uygun
const RESTORE_TABLOLAR = [
  'firmalar',
  'projeler',
  'lokasyonlar',
  'lokasyon_gruplari',
  'lokasyon_grup_uyeleri',
  'users',
  'gorev_kurallari',
  'kullanici_lokasyon_yetkileri',
] as const

type RestoreSonuc = {
  tablo: string
  yedek_satir: number
  filtre_satir: number
  upsert_basarili: number
  upsert_hata: number
  hata_mesaji?: string
}

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
    const firmaId = String(body.firma_id ?? '')
    const onay = String(body.onay ?? '')

    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz tarih (YYYY-MM-DD)' }, { status: 400 })
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(firmaId)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz firma_id (uuid)' }, { status: 400 })
    }
    const beklenenOnay = `RESTORE-FIRMA-${firmaId.slice(0, 8)}`
    if (onay !== beklenenOnay) {
      return NextResponse.json({ ok: false, error: `Onay kodu eksik/yanlış. Beklenen: ${beklenenOnay}` }, { status: 400 })
    }

    const admin = createAdminClient()
    const baslangic = Date.now()

    // Yedek dosyalarını sırayla indir
    async function yedekOku(tablo: string): Promise<any[] | null> {
      const path = `${tarih}/${tablo}.json.gz`
      const { data: blob, error } = await admin.storage.from('backups').download(path)
      if (error || !blob) return null
      const buf = Buffer.from(await blob.arrayBuffer())
      const json = gunzipSync(buf).toString('utf-8')
      const arr = JSON.parse(json)
      return Array.isArray(arr) ? arr : null
    }

    // 1. Önce firmalar yedeğini oku ve firmayı bul (yoksa hata)
    const firmalarYedek = await yedekOku('firmalar')
    if (!firmalarYedek) {
      return NextResponse.json({ ok: false, error: `Yedek dosyası bulunamadı: ${tarih}/firmalar.json.gz` }, { status: 404 })
    }
    const firmaKaydi = firmalarYedek.find((f: any) => f.id === firmaId)
    if (!firmaKaydi) {
      return NextResponse.json({
        ok: false,
        error: `Firma ${firmaId} bu yedekte (${tarih}) BULUNAMADI. Daha eski bir yedek deneyin.`,
      }, { status: 404 })
    }

    // Sonuçları toplamak için
    const sonuclar: RestoreSonuc[] = []
    let firmaGrupIdler: string[] = []
    let firmaUserIdler: string[] = []

    async function upsertBatch(tablo: string, rows: any[]): Promise<{ basarili: number; hata: number; mesaj?: string }> {
      let basarili = 0
      let hata = 0
      let ilkHata: string | undefined
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const { error } = await admin.from(tablo).upsert(batch as any, { onConflict: 'id', ignoreDuplicates: false })
        if (error) {
          hata += batch.length
          if (!ilkHata) ilkHata = error.message
        } else {
          basarili += batch.length
        }
      }
      return { basarili, hata, mesaj: ilkHata }
    }

    // Lokasyonlar için özel restore: (1) orphan checklist_sablon_id NULL'a çek,
    // (2) önce parent (parent_id NULL), sonra child sırasıyla upsert
    async function upsertLokasyonlar(rows: any[]): Promise<{ basarili: number; hata: number; mesaj?: string }> {
      // Mevcut checklist_sablonlari ID seti
      const { data: sablonRows } = await admin.from('checklist_sablonlari').select('id')
      const sablonIds = new Set<string>((sablonRows ?? []).map((s: any) => s.id))
      // Orphan referansları NULL'a çek
      const temizlenmis = rows.map((l: any) => ({
        ...l,
        checklist_sablon_id: l.checklist_sablon_id && sablonIds.has(l.checklist_sablon_id)
          ? l.checklist_sablon_id
          : null,
      }))
      // 2 pass: önce parent_id NULL, sonra dolu
      const root = temizlenmis.filter((l: any) => !l.parent_id)
      const child = temizlenmis.filter((l: any) => l.parent_id)
      const r1 = await upsertBatch('lokasyonlar', root)
      if (r1.hata > 0) return r1
      const r2 = await upsertBatch('lokasyonlar', child)
      return {
        basarili: r1.basarili + r2.basarili,
        hata: r1.hata + r2.hata,
        mesaj: r2.mesaj ?? r1.mesaj,
      }
    }

    // Tablo bazlı filtre fonksiyonları
    function filtrele(tablo: string, rows: any[]): any[] {
      if (tablo === 'firmalar') {
        return rows.filter((r: any) => r.id === firmaId)
      }
      if (tablo === 'lokasyon_grup_uyeleri') {
        const set = new Set(firmaGrupIdler)
        return rows.filter((r: any) => set.has(r.grup_id))
      }
      if (tablo === 'kullanici_lokasyon_yetkileri') {
        const set = new Set(firmaUserIdler)
        return rows.filter((r: any) => set.has(r.user_id))
      }
      // diğerleri: firma_id eşitliği
      return rows.filter((r: any) => r.firma_id === firmaId)
    }

    // Sırayla işle
    for (const tablo of RESTORE_TABLOLAR) {
      const yedek = tablo === 'firmalar' ? firmalarYedek : await yedekOku(tablo)
      if (!yedek) {
        sonuclar.push({ tablo, yedek_satir: 0, filtre_satir: 0, upsert_basarili: 0, upsert_hata: 0, hata_mesaji: 'Yedek dosyası yok' })
        continue
      }
      const filtreli = filtrele(tablo, yedek)
      if (filtreli.length === 0) {
        sonuclar.push({ tablo, yedek_satir: yedek.length, filtre_satir: 0, upsert_basarili: 0, upsert_hata: 0 })
        continue
      }
      // Lokasyonlar için özel restore (orphan sablon temizliği + parent/child sırası)
      const { basarili, hata, mesaj } = tablo === 'lokasyonlar'
        ? await upsertLokasyonlar(filtreli)
        : await upsertBatch(tablo, filtreli)
      sonuclar.push({
        tablo,
        yedek_satir: yedek.length,
        filtre_satir: filtreli.length,
        upsert_basarili: basarili,
        upsert_hata: hata,
        hata_mesaji: mesaj,
      })

      // Sonraki tablolar için ID setlerini topla
      if (tablo === 'lokasyon_gruplari') {
        firmaGrupIdler = filtreli.map((r: any) => r.id)
      } else if (tablo === 'users') {
        firmaUserIdler = filtreli.map((r: any) => r.id)
      }
    }

    const sure = Math.round((Date.now() - baslangic) / 1000)
    const toplamUpsert = sonuclar.reduce((s, r) => s + r.upsert_basarili, 0)
    const toplamHata = sonuclar.reduce((s, r) => s + r.upsert_hata, 0)
    const basarili = toplamHata === 0

    // Audit log
    try {
      await admin.from('audit_log').insert({
        tip: 'yedek_restore_firma',
        tablo: 'firmalar',
        kullanici_id: user.id,
        firma_id: firmaId,
        basarili,
        satir_sayisi: toplamUpsert,
        hata_mesaji: !basarili ? sonuclar.filter(s => s.upsert_hata > 0).map(s => `${s.tablo}: ${s.hata_mesaji}`).join('; ').slice(0, 1000) : null,
        detay: { tarih, firma_id: firmaId, firma_adi: firmaKaydi.firma_adi, sure_saniye: sure, sonuclar },
      })
    } catch (e) {
      console.error('[yedek_restore_firma] audit_log hata:', e)
    }

    return NextResponse.json({
      ok: basarili,
      tarih,
      firma_id: firmaId,
      firma_adi: firmaKaydi.firma_adi,
      sure_saniye: sure,
      toplam_yuklenen: toplamUpsert,
      toplam_hata: toplamHata,
      sonuclar,
    }, { status: basarili ? 200 : 500 })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Restore başarısız' }, { status: 500 })
  }
}
