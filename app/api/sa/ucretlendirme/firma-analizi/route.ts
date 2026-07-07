/**
 * GET /api/sa/ucretlendirme/firma-analizi?firma_id=...
 *
 * Ücretlendirme Politikası sayfasi > Sekme 2 (Firma Analizi) icin proje
 * bazli kullanici ve lokasyon sayimlari doner. Sadece SA/alt_SA erisebilir.
 *
 * Response:
 *   { ok, firma: { id, ad }, projeler: [{ id, ad, aktif, kullanici_sayisi, lokasyon_sayisi }],
 *     firmaToplam: { kullanici, lokasyon } }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const firmaId = req.nextUrl.searchParams.get('firma_id')
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })

  const admin = createAdminClient()

  // Firma
  const { data: firma } = await admin
    .from('firmalar')
    .select('id, firma_adi, ticari_unvan')
    .eq('id', firmaId)
    .single()
  if (!firma) return NextResponse.json({ ok: false, error: 'Firma bulunamadı' }, { status: 404 })

  // Firmanin tum projeleri (aktif + pasif — analizde hepsi gorunsun)
  const { data: projeler } = await admin
    .from('projeler')
    .select('id, ad, aktif')
    .eq('firma_id', firmaId)
    .order('aktif', { ascending: false })
    .order('ad', { ascending: true })

  const projeIds = (projeler ?? []).map(p => p.id)

  // Firmanin tum kullanicilarini + lokasyonlarini cek (aktif olanlar)
  const [usersRes, loksRes] = await Promise.all([
    admin.from('users').select('id, proje_id, aktif').eq('firma_id', firmaId).eq('aktif', true),
    admin.from('lokasyonlar').select('id, proje_id, aktif').eq('firma_id', firmaId).eq('aktif', true),
  ])
  const users = (usersRes.data ?? []) as any[]
  const loks = (loksRes.data ?? []) as any[]

  // Proje bazli sayim
  const kullaniciMap = new Map<string, number>()
  const lokasyonMap = new Map<string, number>()
  let projesizKullanici = 0
  let projesizLokasyon = 0
  for (const u of users) {
    if (u.proje_id) kullaniciMap.set(u.proje_id, (kullaniciMap.get(u.proje_id) ?? 0) + 1)
    else projesizKullanici++
  }
  for (const l of loks) {
    if (l.proje_id) lokasyonMap.set(l.proje_id, (lokasyonMap.get(l.proje_id) ?? 0) + 1)
    else projesizLokasyon++
  }

  const projeSonuc = (projeler ?? []).map(p => ({
    id: p.id,
    ad: p.ad ?? '—',
    aktif: p.aktif === true,
    kullanici_sayisi: kullaniciMap.get(p.id) ?? 0,
    lokasyon_sayisi: lokasyonMap.get(p.id) ?? 0,
  }))

  // Projesiz (proje_id NULL) satiri — hesaba katilir cunku firma toplamin parcasi
  if (projesizKullanici > 0 || projesizLokasyon > 0) {
    projeSonuc.push({
      id: '__projesiz__',
      ad: 'Projesiz',
      aktif: false,
      kullanici_sayisi: projesizKullanici,
      lokasyon_sayisi: projesizLokasyon,
    })
  }

  const firmaAd = (firma as any).firma_adi ?? (firma as any).ticari_unvan ?? '—'

  return NextResponse.json({
    ok: true,
    firma: { id: firma.id, ad: firmaAd },
    projeler: projeSonuc,
    firmaToplam: {
      kullanici: users.length,
      lokasyon: loks.length,
      projeSayisi: projeIds.length,
    },
  })
}
