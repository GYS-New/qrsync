/**
 * GET /api/app/oto-yikama/bugun-planli
 *
 * Bugün için oluşturulmuş Oto Yıkama görevlerini döner (planlı + ekstra).
 * Mobil yıkama personelinin ana ekranı için.
 *
 * Headers:
 *   X-Device-Token
 *
 * Yetki: yıkama personeli (kullanici_lokasyon_yetkileri'nde oto_yikama_lokasyon=true)
 *
 * Response:
 *   {
 *     ok: true,
 *     today: "YYYY-MM-DD",
 *     gorevler: [{
 *       gorev_id, arac_id, plaka, marka, model, departman, kullanici_adi_soyadi,
 *       lokasyon_id, lokasyon_tanim, ust_lokasyon,
 *       durum,                     // ACIK | ISLEMDE | TAMAMLANDI
 *       tamamlanma_tarihi,         // null veya ISO
 *       tamamlayan,                // null veya isim
 *       ekstra: bool,
 *       km, foto_oncesi_url, foto_sonrasi_url, notlar
 *     }]
 *   }
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserOtoYikamaUstIds } from '@/lib/oto-yikama/getUserOtoYikamaUstIds'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

function bugunTRDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

export async function GET(req: Request) {
  try {
    const admin = createAdminClient()
    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401, headers: CORS })
    }

    const { data: tok } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, aktif')
      .eq('device_token', deviceToken)
      .single()
    if (!tok || !tok.aktif) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
    }

    // Yıkama personeli kontrolü — users.ust_lokasyon_id OR kullanici_lokasyon_yetkileri
    const yetkiliUstIds = await getUserOtoYikamaUstIds(admin, tok.user_id, tok.firma_id)
    if (yetkiliUstIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Oto Yıkama lokasyonuna yetkili değilsiniz', code: 'OTO_YIKAMA_YETKISI_YOK' },
        { status: 403, headers: CORS },
      )
    }

    // Yetkili üst lokasyonların alt lokasyon ID'leri
    const { data: altLoks } = await admin
      .from('lokasyonlar')
      .select('id, tanim, parent_id')
      .in('parent_id', yetkiliUstIds)
      .eq('aktif', true)
    const lokIds = (altLoks ?? []).map((l: any) => l.id)
    if (lokIds.length === 0) {
      return NextResponse.json({ ok: true, today: bugunTRDate(), gorevler: [] }, { headers: CORS })
    }

    const today = bugunTRDate()

    // Bugünün metadata kayıtları
    const { data: metaRows } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('gorev_id, arac_id, plaka_snapshot, hedef_tarih, ekstra, km, foto_oncesi_url, foto_sonrasi_url, notlar')
      .eq('hedef_tarih', today)
    if (!metaRows || metaRows.length === 0) {
      return NextResponse.json({ ok: true, today, gorevler: [] }, { headers: CORS })
    }

    const gorevIds = metaRows.map(m => m.gorev_id)

    // Gorevler — sadece bu yetki kapsamında olanlar
    const { data: gorevler } = await admin
      .from('gorevler')
      .select('id, durum, tamamlanma_tarihi, lokasyon_id, islemi_yapan_id')
      .in('id', gorevIds)
      .eq('firma_id', tok.firma_id)
      .in('lokasyon_id', lokIds)

    const gMap = new Map((gorevler ?? []).map((g: any) => [g.id, g]))

    // Lokasyon + üst lokasyon
    const lokMap = new Map<string, { tanim: string; parent_id: string | null }>(
      (altLoks ?? []).map((l: any) => [l.id, { tanim: l.tanim, parent_id: l.parent_id }]),
    )
    const ustMap = new Map<string, string>()
    if (yetkiliUstIds.length > 0) {
      const { data: ustRows } = await admin
        .from('lokasyonlar').select('id, tanim').in('id', yetkiliUstIds)
      for (const u of (ustRows ?? []) as any[]) ustMap.set(u.id, u.tanim)
    }

    // Araçlar
    const aracIds = [...new Set(metaRows.map(m => m.arac_id))]
    const { data: araclar } = aracIds.length > 0
      ? await admin.from('araclar').select('id, plaka, marka, model, departman, kullanici_adi_soyadi').in('id', aracIds)
      : { data: [] as any[] }
    const aracMap = new Map((araclar ?? []).map((a: any) => [a.id, a]))

    // Kullanıcılar (tamamlayan)
    const kIds = [...new Set((gorevler ?? []).map((g: any) => g.islemi_yapan_id).filter(Boolean))] as string[]
    const { data: kullanicilar } = kIds.length > 0
      ? await admin.from('users').select('id, isim_soyisim').in('id', kIds)
      : { data: [] as any[] }
    const uMap = new Map((kullanicilar ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '—']))

    const result = metaRows
      .filter(m => gMap.has(m.gorev_id))
      .map(m => {
        const g: any = gMap.get(m.gorev_id)
        const a: any = aracMap.get(m.arac_id)
        const lokMeta = lokMap.get(g.lokasyon_id)
        return {
          gorev_id: m.gorev_id,
          arac_id: m.arac_id,
          plaka: m.plaka_snapshot,
          marka: a?.marka ?? null,
          model: a?.model ?? null,
          departman: a?.departman ?? null,
          kullanici_adi_soyadi: a?.kullanici_adi_soyadi ?? null,
          lokasyon_id: g.lokasyon_id,
          lokasyon_tanim: lokMeta?.tanim ?? null,
          ust_lokasyon: lokMeta?.parent_id ? (ustMap.get(lokMeta.parent_id) ?? null) : null,
          durum: g.durum,
          tamamlanma_tarihi: g.tamamlanma_tarihi,
          tamamlayan: g.islemi_yapan_id ? (uMap.get(g.islemi_yapan_id) ?? null) : null,
          ekstra: !!(m as any).ekstra,
          km: (m as any).km ?? null,
          foto_oncesi_url: (m as any).foto_oncesi_url ?? null,
          foto_sonrasi_url: (m as any).foto_sonrasi_url ?? null,
          notlar: (m as any).notlar ?? null,
        }
      })
      // Sıralama: ACIK > ISLEMDE > TAMAMLANDI; içerde plaka ASC
      .sort((a, b) => {
        const order: Record<string, number> = { ACIK: 0, ISLEMDE: 1, TAMAMLANDI: 2, IPTAL: 3 }
        const da = order[a.durum] ?? 9
        const db = order[b.durum] ?? 9
        if (da !== db) return da - db
        return a.plaka.localeCompare(b.plaka, 'tr')
      })

    return NextResponse.json({ ok: true, today, gorevler: result }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
