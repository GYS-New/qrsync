/**
 * GET /api/oto-yikama/raporlar
 *
 * Oto Yıkama raporları için TAMAMLANDI yıkama kayıtlarını + agregasyonları döner.
 *
 * Query:
 *   firma_id     zorunlu
 *   baslangic    YYYY-MM-DD (varsayılan bugün - 30 gün)
 *   bitis        YYYY-MM-DD (varsayılan bugün)
 *   personel_id  opsiyonel — sadece bu kullanıcının yaptıkları
 *   plaka        opsiyonel — sadece bu plaka (tam eşleşme, snapshot)
 *   lokasyon_id  opsiyonel — sadece bu alt lokasyonda yapılanlar
 *   tip          'planli' | 'ekstra' | '' (boş = ikisi de)
 *
 * SA-only + firma için oto_yikama_aktif=true.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function bugunTRDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const firmaId = sp.get('firma_id')
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const modul = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!modul) return NextResponse.json({ ok: false, error: 'Oto Yıkama modülü pasif' }, { status: 403 })

  const bugun = bugunTRDate()
  const baslangic = sp.get('baslangic') || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const bitis = sp.get('bitis') || bugun
  const personelId = sp.get('personel_id') || null
  const plaka = sp.get('plaka') || null
  const lokasyonId = sp.get('lokasyon_id') || null
  const tip = sp.get('tip') || ''

  // 1) Metadata: tarih aralığında kayıtlar
  let metaQ = admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, arac_id, plaka_snapshot, hedef_tarih, ekstra')
    .gte('hedef_tarih', baslangic)
    .lte('hedef_tarih', bitis)
  if (plaka) metaQ = metaQ.eq('plaka_snapshot', plaka)
  if (tip === 'ekstra') metaQ = metaQ.eq('ekstra', true)
  if (tip === 'planli') metaQ = metaQ.eq('ekstra', false)

  const { data: metaRows, error: metaErr } = await metaQ
  if (metaErr) return NextResponse.json({ ok: false, error: metaErr.message }, { status: 500 })
  if (!metaRows || metaRows.length === 0) {
    return NextResponse.json({ ok: true, baslangic, bitis, data: [], agg: emptyAgg() })
  }

  const gorevIds = metaRows.map(m => m.gorev_id)

  // 2) Gorevler — sadece TAMAMLANDI olanlar + firma filtresi
  let gQ = admin
    .from('gorevler')
    .select(`
      id, durum, baslatilma_tarihi, tamamlanma_tarihi, tamamlanma_suresi_saniye,
      olusturma_tarihi, lokasyon_id, islemi_yapan_id,
      lokasyon:lokasyon_id (id, tanim, parent_id, ust:parent_id (tanim))
    `)
    .in('id', gorevIds)
    .eq('firma_id', firmaId)
    .eq('durum', 'TAMAMLANDI')
  if (lokasyonId) gQ = gQ.eq('lokasyon_id', lokasyonId)
  if (personelId) gQ = gQ.eq('islemi_yapan_id', personelId)
  const { data: gorevler } = await gQ
  if (!gorevler || gorevler.length === 0) {
    return NextResponse.json({ ok: true, baslangic, bitis, data: [], agg: emptyAgg() })
  }

  const gMap = new Map((gorevler as any[]).map((g: any) => [g.id, g]))

  // 3) Araçlar + kullanıcılar
  const aracIds = [...new Set(metaRows.map(m => m.arac_id))]
  const kullaniciIds = [...new Set((gorevler as any[]).map(g => g.islemi_yapan_id).filter(Boolean))]

  const [aracRes, userRes] = await Promise.all([
    aracIds.length > 0
      ? admin.from('araclar').select('id, plaka, departman, kullanici_adi_soyadi').in('id', aracIds)
      : Promise.resolve({ data: [] as any[] }),
    kullaniciIds.length > 0
      ? admin.from('users').select('id, isim_soyisim').in('id', kullaniciIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const aracMap = new Map((aracRes.data ?? []).map((a: any) => [a.id, a]))
  const userMap = new Map((userRes.data ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '—']))

  // 4) Birleştir
  const data = metaRows
    .filter(m => gMap.has(m.gorev_id))
    .map(m => {
      const g: any = gMap.get(m.gorev_id)
      const a: any = aracMap.get(m.arac_id)
      const ust = g.lokasyon?.ust?.tanim ?? null
      const lok = g.lokasyon?.tanim ?? null
      const lokasyonTam = ust && lok ? `${ust} > ${lok}` : (lok ?? '—')
      const personelAd = g.islemi_yapan_id ? (userMap.get(g.islemi_yapan_id) ?? '—') : '—'
      const sure = g.tamamlanma_suresi_saniye && g.tamamlanma_suresi_saniye > 0
        ? g.tamamlanma_suresi_saniye
        : (g.baslatilma_tarihi && g.tamamlanma_tarihi
          ? Math.max(0, Math.floor((new Date(g.tamamlanma_tarihi).getTime() - new Date(g.baslatilma_tarihi).getTime()) / 1000))
          : 0)
      return {
        gorev_id: m.gorev_id,
        plaka: m.plaka_snapshot,
        departman: a?.departman ?? null,
        arac_sahibi: a?.kullanici_adi_soyadi ?? null,
        personel: personelAd,
        personel_id: g.islemi_yapan_id ?? null,
        lokasyon: lokasyonTam,
        lokasyon_id: g.lokasyon_id ?? null,
        ust_lokasyon: ust,
        hedef_tarih: m.hedef_tarih,
        baslatilma_tarihi: g.baslatilma_tarihi,
        tamamlanma_tarihi: g.tamamlanma_tarihi,
        tamamlanma_suresi_saniye: sure,
        ekstra: !!(m as any).ekstra,
      }
    })
    .sort((a, b) => (b.tamamlanma_tarihi ?? '').localeCompare(a.tamamlanma_tarihi ?? ''))

  // 5) Agregasyonlar
  const agg = {
    toplam: data.length,
    planli: data.filter(d => !d.ekstra).length,
    ekstra: data.filter(d => d.ekstra).length,
    personel_sayisi: new Set(data.map(d => d.personel_id).filter(Boolean)).size,
    plaka_sayisi: new Set(data.map(d => d.plaka).filter(Boolean)).size,
    toplam_sure_saniye: data.reduce((s, d) => s + (d.tamamlanma_suresi_saniye ?? 0), 0),
    ortalama_sure_saniye: data.length > 0
      ? Math.round(data.reduce((s, d) => s + (d.tamamlanma_suresi_saniye ?? 0), 0) / data.length)
      : 0,
    gunluk_trend: buildGunlukTrend(data),
    personel_top: buildKisiAgg(data),
    plaka_top: buildPlakaAgg(data),
    lokasyon_dagilim: buildLokasyonAgg(data),
  }

  // Filter dropdown'ları için: personel listesi + plaka listesi + lokasyon listesi
  const filterMeta = {
    personeller: kullaniciIds
      .map(id => ({ id, ad: userMap.get(id) ?? '—' }))
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr')),
    plakalar: [...new Set(metaRows.map(m => m.plaka_snapshot).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'tr')),
  }

  return NextResponse.json({ ok: true, baslangic, bitis, data, agg, filter_meta: filterMeta })
}

function emptyAgg() {
  return {
    toplam: 0, planli: 0, ekstra: 0,
    personel_sayisi: 0, plaka_sayisi: 0,
    toplam_sure_saniye: 0, ortalama_sure_saniye: 0,
    gunluk_trend: [], personel_top: [], plaka_top: [], lokasyon_dagilim: [],
  }
}

type Row = {
  hedef_tarih: string; ekstra: boolean; personel: string; personel_id: string | null
  plaka: string; lokasyon: string
}

function buildGunlukTrend(rows: Row[]) {
  const map = new Map<string, { planli: number; ekstra: number }>()
  for (const r of rows) {
    const t = r.hedef_tarih
    const ex = map.get(t) ?? { planli: 0, ekstra: 0 }
    if (r.ekstra) ex.ekstra++
    else ex.planli++
    map.set(t, ex)
  }
  return Array.from(map.entries())
    .map(([tarih, v]) => ({ tarih, planli: v.planli, ekstra: v.ekstra, toplam: v.planli + v.ekstra }))
    .sort((a, b) => a.tarih.localeCompare(b.tarih))
}

function buildKisiAgg(rows: Row[]) {
  const map = new Map<string, { ad: string; adet: number }>()
  for (const r of rows) {
    if (!r.personel_id) continue
    const ex = map.get(r.personel_id) ?? { ad: r.personel, adet: 0 }
    ex.adet++
    map.set(r.personel_id, ex)
  }
  return Array.from(map.entries())
    .map(([id, v]) => ({ personel_id: id, personel: v.ad, adet: v.adet }))
    .sort((a, b) => b.adet - a.adet)
    .slice(0, 10)
}

function buildPlakaAgg(rows: Row[]) {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.plaka, (map.get(r.plaka) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([plaka, adet]) => ({ plaka, adet }))
    .sort((a, b) => b.adet - a.adet)
    .slice(0, 10)
}

function buildLokasyonAgg(rows: Row[]) {
  const map = new Map<string, number>()
  for (const r of rows) {
    map.set(r.lokasyon, (map.get(r.lokasyon) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([lokasyon, adet]) => ({ lokasyon, adet }))
    .sort((a, b) => b.adet - a.adet)
}
