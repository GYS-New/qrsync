import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/cron/gece-dongu
 *
 * Supabase pg_cron her aktif proje için AYRI job çalıştırır:
 *   - qrsync-gece-dongu-renault:  20:30 UTC = 23:30 TRT (Renault V1 baş = 23:30)
 *   - qrsync-gece-dongu-canakkale: 20:59 UTC = 23:59 TRT (Çanakkale V1 baş = 00:00)
 *
 * gece_tam_dongu(p_proje_id UUID DEFAULT NULL) proje-bazlı çalışır.
 * NULL → tüm projeler (backward-compat, manuel toplu tetik için).
 *
 * Bu route yedek/manuel tetik yolu. `?proje_id=<uuid>` parametresi ile
 * spesifik proje tetiklenir. Parametresiz çağrı tüm projelere uygulanır.
 *
 * Zaman seçimi kritik:
 *   - `v_tr_date = (bugün TRT + 1 gün)` mantığı "vardiya başlamadan hemen önce
 *     üretim" kurgusuna dayanır. Cron 23:30–23:59 TRT'de çalışırsa hedef gün
 *     yarın (00:00'da başlayacak V1 vardiyaları için ~1–30 dk önceden üretim).
 *   - gun_sonu_arsivle() firma/proje `arsiv_frekansiyel_saat` ayarına göre
 *     çalışır (default 24h). Sadece `durum_degisim_tarihi < now - N saat`
 *     olan terminal durum görevler arşivlenir — bugün tamamlananlar 24 saat
 *     dolmadan asla arşive gitmez (V3 23:30 bitişi veya Çanakkale V3 00:00
 *     bitişi dahil).
 *
 * Güvenlik: CRON_SECRET env değişkeni ile korunur.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const provided = req.headers.get('x-cron-secret') ?? url.searchParams.get('secret')
  const expected = process.env.CRON_SECRET

  if (!expected || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const projeId = url.searchParams.get('proje_id') || null

  try {
    const admin = createAdminClient()

    const { data, error } = await admin.rpc('gece_tam_dongu', { p_proje_id: projeId })
    if (error) throw new Error(error.message)

    console.log('[cron/gece-dongu]', projeId ?? 'ALL', JSON.stringify(data))
    await admin.from('cron_log').insert({ tip: 'gece_dongu', sonuc: data })
    return NextResponse.json({ ok: true, sonuc: data })
  } catch (err: any) {
    console.error('[cron/gece-dongu] HATA:', err.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
