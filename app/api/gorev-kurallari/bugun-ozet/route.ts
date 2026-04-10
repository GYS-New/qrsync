import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'

/**
 * GET /api/gorev-kurallari/bugun-ozet?firma_id=...
 *
 * Her kural için bugün canli_gorevler + canli_gorevler_arsiv tablolarında
 * kaç görev üretildiğini döner.
 * Dönüş: { [kural_id]: { uretilen: number, tamamlandi: number, bekliyor: number } }
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const url = new URL(req.url)
  const firmaId = url.searchParams.get('firma_id') ?? me.firma_id
  if (me.rol === 'tenant_admin' && firmaId !== me.firma_id) {
    return NextResponse.json({ error: 'Yetkisiz firma' }, { status: 403 })
  }

  const admin = createAdminClient()
  // TRT (UTC+3) bazında bugünü hesapla — UTC aralığı kullanmak gün sınırında 3 saat kaymasına neden olur
  const now = new Date()
  const trtOffset = 3 * 60 * 60 * 1000
  const trtNow = new Date(now.getTime() + trtOffset)
  const bugunTRT = trtNow.toISOString().slice(0, 10) // 'YYYY-MM-DD' TRT tarih
  // TRT günü 00:00 = UTC 21:00 önceki gün, TRT günü 23:59 = UTC 20:59 aynı gün
  const bugunStart = new Date(bugunTRT + 'T00:00:00+03:00').toISOString()
  const bugunEnd   = new Date(bugunTRT + 'T23:59:59+03:00').toISOString()

  // Aktif tablo + arşiv tablosundan bugünkü kayıtları çek (fetchAll ile PostgREST 1000 limitini aş)
  const buildQuery = (table: 'canli_gorevler' | 'canli_gorevler_arsiv') => () =>
    admin
      .from(table)
      .select('kural_id, durum')
      .eq('firma_id', firmaId)
      .not('kural_id', 'is', null)
      .gte('aktif_olma_tarihi', bugunStart)
      .lte('aktif_olma_tarihi', bugunEnd)

  const [aktif, arsiv] = await Promise.all([
    fetchAll(buildQuery('canli_gorevler')),
    fetchAll(buildQuery('canli_gorevler_arsiv')),
  ])

  const tamamlandiDurumlar = new Set(['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'])
  const bekleyenDurumlar   = new Set(['HAZIR', 'ACIK', 'BEKLEMEDE', 'ISLEMDE'])

  // kural_id bazında grupla
  const ozet: Record<string, { uretilen: number; tamamlandi: number; bekliyor: number; kayip: number }> = {}

  for (const row of [...aktif, ...arsiv]) {
    const kid = row.kural_id as string
    if (!kid) continue
    if (!ozet[kid]) ozet[kid] = { uretilen: 0, tamamlandi: 0, bekliyor: 0, kayip: 0 }
    ozet[kid].uretilen++
    if (tamamlandiDurumlar.has(row.durum)) ozet[kid].tamamlandi++
    else if (bekleyenDurumlar.has(row.durum)) ozet[kid].bekliyor++
    else ozet[kid].kayip++  // IPTAL, ZAMANI_GECMIS, SILINDI
  }

  return NextResponse.json(ozet)
}
