/**
 * GET /api/oto-yikama/onay-bekleyen?firma_id=...
 *
 * Amir GYS ekranı için — bu firmanın onay bekleyen tanımsız plaka
 * yıkamalarını listeler.
 *
 * Erişim:
 *   • SA / alt_SA: her firmaya bakabilir
 *   • Firmada oto_yikama_onay_yetkilisi olarak atanan kullanıcı: kendi firması
 *
 * Response:
 *   { ok: true, kayitlar: [{
 *       gorev_id, plaka, hedef_tarih, baslatilma_tarihi, tamamlanma_tarihi,
 *       tamamlanma_suresi_saniye, durum, personel_id, personel_ad,
 *       lokasyon_id, lokasyon_ad, ust_lokasyon, km, notlar
 *     }] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id, rol, firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

  const firmaId = req.nextUrl.searchParams.get('firma_id')
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)

  // Erisim: SA her firmaya, aksi halde sadece atanmış amir
  if (!isSA) {
    const { data: firma } = await admin
      .from('firmalar')
      .select('oto_yikama_onay_yetkilisi_id')
      .eq('id', firmaId)
      .single()
    const amirId = (firma as any)?.oto_yikama_onay_yetkilisi_id
    if (amirId !== me.id) {
      return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
    }
  }

  // Metadata + gorevler + araclar (embed ile firma filter erken)
  const { data: metaRows, error: metaErr } = await admin
    .from('oto_yikama_gorev_metadata')
    .select(`
      gorev_id, plaka_snapshot, hedef_tarih, km, notlar,
      olusturma_tarihi
    `)
    .eq('onay_durumu', 'ONAY_BEKLIYOR')
    .order('olusturma_tarihi', { ascending: false })
    .limit(500)

  if (metaErr) {
    return NextResponse.json({ ok: false, error: metaErr.message }, { status: 500 })
  }

  const gorevIds = (metaRows ?? []).map(m => m.gorev_id)
  if (gorevIds.length === 0) {
    return NextResponse.json({ ok: true, kayitlar: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  // Gorevler — firma_id + chunk 100 (Cloudflare 8KB URI koruması)
  const gMap = new Map<string, any>()
  const CHUNK = 100
  for (let i = 0; i < gorevIds.length; i += CHUNK) {
    const slice = gorevIds.slice(i, i + CHUNK)
    const { data } = await admin
      .from('gorevler')
      .select(`
        id, durum, firma_id, lokasyon_id, baslatilma_tarihi, tamamlanma_tarihi,
        tamamlanma_suresi_saniye, olusturan_id, atanan_kullanici_id,
        islemi_yapan_id, baslatan_kullanici_id
      `)
      .in('id', slice)
      .eq('firma_id', firmaId)
    for (const g of ((data ?? []) as any[])) gMap.set(g.id, g)
  }

  // Firma scope'undaki metadata'ları filtrele
  const scoped = (metaRows ?? []).filter(m => gMap.has(m.gorev_id))

  // Personel + Lokasyon lookup
  const userIds = new Set<string>()
  const lokIds = new Set<string>()
  for (const m of scoped) {
    const g = gMap.get(m.gorev_id)
    if (g?.baslatan_kullanici_id) userIds.add(g.baslatan_kullanici_id)
    if (g?.islemi_yapan_id)       userIds.add(g.islemi_yapan_id)
    if (g?.atanan_kullanici_id)   userIds.add(g.atanan_kullanici_id)
    if (g?.lokasyon_id)           lokIds.add(g.lokasyon_id)
  }

  const [userRes, lokRes] = await Promise.all([
    userIds.size > 0
      ? admin.from('users').select('id, isim_soyisim').in('id', [...userIds])
      : Promise.resolve({ data: [] as any[] }),
    lokIds.size > 0
      ? admin.from('lokasyonlar').select('id, tanim, parent_id').in('id', [...lokIds])
      : Promise.resolve({ data: [] as any[] }),
  ])
  const userMap = new Map(((userRes.data ?? []) as any[]).map(u => [u.id, u.isim_soyisim ?? '—']))
  const lokMap  = new Map(((lokRes.data  ?? []) as any[]).map(l => [l.id, l]))

  const ustIds = new Set<string>()
  for (const l of lokMap.values() as any) if (l?.parent_id) ustIds.add(l.parent_id)
  const { data: ustRows } = ustIds.size > 0
    ? await admin.from('lokasyonlar').select('id, tanim').in('id', [...ustIds])
    : { data: [] as any[] }
  const ustMap = new Map(((ustRows ?? []) as any[]).map(u => [u.id, u.tanim ?? '—']))

  const kayitlar = scoped.map(m => {
    const g = gMap.get(m.gorev_id) ?? {}
    // İşi başlatan / işlem yapan öncelik: TAMAMLANDI/IPTAL için islemi_yapan_id,
    // ISLEMDE için baslatan_kullanici_id, diğer için atanan.
    const personelId = g.durum === 'TAMAMLANDI' || g.durum === 'IPTAL' || g.durum === 'YAPILAMADI'
      ? g.islemi_yapan_id
      : g.durum === 'ISLEMDE'
        ? g.baslatan_kullanici_id
        : g.atanan_kullanici_id
    const lok = g.lokasyon_id ? lokMap.get(g.lokasyon_id) : null
    return {
      gorev_id: m.gorev_id,
      plaka: m.plaka_snapshot,
      hedef_tarih: m.hedef_tarih,
      olusturma_tarihi: (m as any).olusturma_tarihi,
      baslatilma_tarihi: g.baslatilma_tarihi ?? null,
      tamamlanma_tarihi: g.tamamlanma_tarihi ?? null,
      tamamlanma_suresi_saniye: g.tamamlanma_suresi_saniye ?? null,
      durum: g.durum ?? null,
      personel_id: personelId ?? null,
      personel_ad: personelId ? (userMap.get(personelId) ?? '—') : '—',
      lokasyon_id: g.lokasyon_id ?? null,
      lokasyon_ad: lok?.tanim ?? '—',
      ust_lokasyon: lok?.parent_id ? (ustMap.get(lok.parent_id) ?? null) : null,
      km: m.km ?? null,
      notlar: m.notlar ?? null,
    }
  })

  return NextResponse.json(
    { ok: true, kayitlar },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
