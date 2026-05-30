import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const p = req.nextUrl.searchParams
  const firmaId    = p.get('firma_id')
  const projeId    = p.get('proje_id')
  const baslangic  = p.get('baslangic')
  const bitis      = p.get('bitis')
  const grupIdF    = p.get('grup_id')
  const lokIdF     = p.get('lokasyon_id')

  if (!firmaId || !projeId) return NextResponse.json({ error: 'firma_id ve proje_id zorunlu' }, { status: 400 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (!isSA && me.firma_id !== firmaId) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const admin = createAdminClient()

  const [lokRes, fiyatRes, grupRes] = await Promise.all([
    admin.from('lokasyonlar').select('id,tanim,parent_id').eq('proje_id', projeId).eq('firma_id', firmaId),
    admin.from('birim_fiyatlar').select('lokasyon_id,grup_id,fiyat,para_birimi').eq('proje_id', projeId),
    admin.from('lokasyon_gruplari').select('id,ad').eq('proje_id', projeId).eq('firma_id', firmaId),
  ])

  const lokasyonlar = lokRes.data ?? []
  const birimFiyatlar = fiyatRes.data ?? []
  const gruplar = grupRes.data ?? []

  const grupIds = gruplar.map(g => g.id)
  const { data: grupUyeleri } = grupIds.length > 0
    ? await admin.from('lokasyon_grup_uyeleri').select('grup_id,lokasyon_id').in('grup_id', grupIds)
    : { data: [] }

  // Maps
  const lokMap = new Map(lokasyonlar.map(l => [l.id, l]))
  const grupMap = new Map(gruplar.map(g => [g.id, g.ad]))

  const lokGrupMap = new Map<string, string[]>()
  for (const u of grupUyeleri ?? []) {
    const arr = lokGrupMap.get(u.lokasyon_id) ?? []
    arr.push(u.grup_id)
    lokGrupMap.set(u.lokasyon_id, arr)
  }

  // grup → lokasyon listesi (for grup filter)
  const grupLokMap = new Map<string, string[]>()
  for (const u of grupUyeleri ?? []) {
    const arr = grupLokMap.get(u.grup_id) ?? []
    arr.push(u.lokasyon_id)
    grupLokMap.set(u.grup_id, arr)
  }

  const lokFiyatMap = new Map<string, { fiyat: number; para_birimi: string }>()
  const grupFiyatMap = new Map<string, { fiyat: number; para_birimi: string }>()
  for (const f of birimFiyatlar) {
    if (f.lokasyon_id && f.fiyat > 0) lokFiyatMap.set(f.lokasyon_id, { fiyat: f.fiyat, para_birimi: f.para_birimi })
    if (f.grup_id && f.fiyat > 0) grupFiyatMap.set(f.grup_id, { fiyat: f.fiyat, para_birimi: f.para_birimi })
  }

  // Efektif birim fiyat per lokasyon
  type EfektifFiyat = { fiyat: number; para_birimi: string; turu: 'lokasyon' | 'grup'; grup_id?: string }
  const efektifMap = new Map<string, EfektifFiyat>()
  for (const l of lokasyonlar) {
    if (lokFiyatMap.has(l.id)) {
      efektifMap.set(l.id, { ...lokFiyatMap.get(l.id)!, turu: 'lokasyon' })
    } else {
      for (const gid of lokGrupMap.get(l.id) ?? []) {
        if (grupFiyatMap.has(gid)) {
          efektifMap.set(l.id, { ...grupFiyatMap.get(gid)!, turu: 'grup', grup_id: gid })
          break
        }
      }
    }
  }

  // Filtrele: fiyatı olan lokasyonlar
  let filteredLoks = lokasyonlar.filter(l => efektifMap.has(l.id))
  if (grupIdF) {
    const grupLokIds = new Set(grupLokMap.get(grupIdF) ?? [])
    filteredLoks = filteredLoks.filter(l => grupLokIds.has(l.id))
  }
  if (lokIdF) filteredLoks = filteredLoks.filter(l => l.id === lokIdF)

  if (filteredLoks.length === 0) {
    return NextResponse.json({
      ok: true, rows: [],
      ozet: { toplam_hakedis: 0, tamamlanan_hakedis: 0, gecikmeli_hakedis: 0, kayip_hakedis: 0, toplam_gorev: 0 },
    })
  }

  const lokIds = filteredLoks.map(l => l.id)

  // Görevleri çek (aktif + arşiv) — tarih filtresi vardiya_gunu üzerinden
  const buildQ = (table: string) => {
    let q = admin.from(table).select('lokasyon_id,durum')
      .eq('firma_id', firmaId).eq('proje_id', projeId).in('lokasyon_id', lokIds)
    if (baslangic) q = (q as any).gte('vardiya_gunu', baslangic)
    if (bitis)     q = (q as any).lte('vardiya_gunu', bitis)
    return q
  }

  const [aktif, arsiv] = await Promise.all([
    fetchAll(() => buildQ('canli_gorevler')),
    fetchAll(() => buildQ('canli_gorevler_arsiv')),
  ])

  type Counts = { toplam: number; tamamlanan: number; gecikmeli: number; kayip: number; aktif_gorev: number }
  const countMap = new Map<string, Counts>()
  for (const g of [...(aktif ?? []), ...(arsiv ?? [])]) {
    if (!g.lokasyon_id) continue
    const c = countMap.get(g.lokasyon_id) ?? { toplam: 0, tamamlanan: 0, gecikmeli: 0, kayip: 0, aktif_gorev: 0 }
    c.toplam++
    if (g.durum === 'TAMAMLANDI') c.tamamlanan++
    else if (g.durum === 'ZAMANINDA_YAPILAMAYAN') c.gecikmeli++
    else if (['IPTAL', 'SILINDI', 'BEKLEMEDE', 'ZAMANI_GECMIS'].includes(g.durum)) c.kayip++
    else c.aktif_gorev++ // HAZIR, ACIK, ISLEMDE
    countMap.set(g.lokasyon_id, c)
  }

  const rows = filteredLoks
    .filter(l => (countMap.get(l.id)?.toplam ?? 0) > 0)
    .map(l => {
      const ef = efektifMap.get(l.id)!
      const c  = countMap.get(l.id) ?? { toplam: 0, tamamlanan: 0, gecikmeli: 0, kayip: 0, aktif_gorev: 0 }
      const ust = l.parent_id ? lokMap.get(l.parent_id)?.tanim ?? null : null
      return {
        lokasyon_id: l.id,
        lokasyon_tanim: l.tanim,
        ust_tanim: ust,
        grup_adi: (() => {
          const gid = ef.grup_id ?? lokGrupMap.get(l.id)?.[0]
          return gid ? (grupMap.get(gid) ?? null) : null
        })(),
        birim_fiyat: ef.fiyat,
        para_birimi: ef.para_birimi,
        fiyat_turu: ef.turu,
        toplam: c.toplam,
        tamamlanan: c.tamamlanan,
        gecikmeli: c.gecikmeli,
        kayip: c.kayip,
        aktif_gorev: c.aktif_gorev,
        tamamlanan_hakedis: c.tamamlanan * ef.fiyat,
        gecikmeli_hakedis: c.gecikmeli * ef.fiyat,
        kayip_hakedis: c.kayip * ef.fiyat,
        toplam_hakedis: c.toplam * ef.fiyat,
      }
    })
    .sort((a, b) => (a.ust_tanim ?? a.lokasyon_tanim).localeCompare(b.ust_tanim ?? b.lokasyon_tanim, 'tr'))

  const ozet = rows.reduce((acc, r) => ({
    toplam_hakedis: acc.toplam_hakedis + r.toplam_hakedis,
    tamamlanan_hakedis: acc.tamamlanan_hakedis + r.tamamlanan_hakedis,
    gecikmeli_hakedis: acc.gecikmeli_hakedis + r.gecikmeli_hakedis,
    kayip_hakedis: acc.kayip_hakedis + r.kayip_hakedis,
    toplam_gorev: acc.toplam_gorev + r.toplam,
  }), { toplam_hakedis: 0, tamamlanan_hakedis: 0, gecikmeli_hakedis: 0, kayip_hakedis: 0, toplam_gorev: 0 })

  return NextResponse.json({ ok: true, rows, ozet })
}
