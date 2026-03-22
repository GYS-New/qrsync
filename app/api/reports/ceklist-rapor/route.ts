/**
 * GET /api/reports/ceklist-rapor
 * Tüm görev türleri için çeklist tamamlanma verileri.
 * Filtreler: firmaId, projeId, baslangic, bitis, lokasyonId, yapanAdi, tanim, durum, gorevTipi
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

function fmt(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v); if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function withinRange(v: string | null | undefined, from?: string | null, to?: string | null) {
  if (!v) return !from && !to
  const t = new Date(v).getTime()
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false
  if (to   && t > new Date(`${to}T23:59:59.999`).getTime()) return false
  return true
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me || !['super_admin','alt_super_admin','tenant_admin'].includes(me.rol)) {
      return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
    }
    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const p = new URL(req.url).searchParams
    const firmaId    = isSA ? p.get('firmaId') : me.firma_id
    const projeId    = p.get('projeId')    ?? null
    const baslangic  = p.get('baslangic')  ?? null
    const bitis      = p.get('bitis')      ?? null
    const lokId      = p.get('lokasyonId') ?? null
    const yapanAdi   = p.get('yapan')      ?? null
    const tanimAra   = p.get('tanim')      ?? null
    const durumFil   = p.get('durum')      ?? null
    const gorevTipi  = p.get('gorevTipi')  ?? 'hepsi' // frekansiyel | spesifik | hepsi

    if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    const admin = createAdminClient()

    // Lokasyonlar (checklist_sablon_id dolu olanlar)
    let lokQ = admin.from('lokasyonlar')
      .select('id,tanim,parent_id,checklist_sablon_id')
      .eq('firma_id', firmaId)
      .not('checklist_sablon_id', 'is', null)
    if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
    if (lokId)   lokQ = (lokQ as any).eq('id', lokId)
    const { data: loks } = await lokQ
    const lokMap = new Map<string, any>((loks ?? []).map((l: any) => [l.id, l]))
    const lokIds = (loks ?? []).map((l: any) => l.id)
    if (!lokIds.length) return NextResponse.json({ ok: true, rows: [], ozet: { toplam: 0, dolduruldu: 0, tamamlanan: 0 }, lokasyonlar: [], kullanicilar: [] })

    // Şablonlar
    const templateIds = [...new Set((loks ?? []).map((l: any) => l.checklist_sablon_id).filter(Boolean))]
    const { data: templates } = templateIds.length
      ? await admin.from('checklist_items').select('id,template_id,sira,madde,zorunlu').in('template_id', templateIds).order('sira')
      : { data: [] }
    const templateItemMap = new Map<string, any[]>()
    for (const item of templates ?? []) {
      const arr = templateItemMap.get(item.template_id) ?? []
      arr.push(item); templateItemMap.set(item.template_id, arr)
    }

    // Görevleri çek — frekansiyel + spesifik + arşiv
    const SEL = 'id,firma_id,tanim,durum,lokasyon_id,olusturma_tarihi,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id,tamamlayan_kullanici_id'

    const buildQ = (table: string): Promise<any> => {
      let q = admin.from(table).select(SEL).eq('firma_id', firmaId).in('lokasyon_id', lokIds)
      if (projeId) q = (q as any).eq('proje_id', projeId)
      if (durumFil && durumFil !== 'TUMU') q = (q as any).eq('durum', durumFil)
      return Promise.resolve(q)
    }

    const queries: Promise<any>[] = []
    if (gorevTipi !== 'spesifik') {
      queries.push(buildQ('canli_gorevler'), buildQ('canli_gorevler_arsiv'))
    }
    if (gorevTipi !== 'frekansiyel') {
      queries.push(buildQ('gorevler'))
    }

    const results = await Promise.all(queries)
    const gorevlerAll: any[] = []
    const seen = new Set<string>()
    for (const r of results) {
      for (const g of r.data ?? []) {
        if (!seen.has(g.id)) { seen.add(g.id); gorevlerAll.push(g) }
      }
    }

    // Tarih filtresi
    const gorevler = gorevlerAll.filter(g =>
      withinRange(g.tamamlanma_tarihi ?? g.olusturma_tarihi, baslangic, bitis)
    )
    if (!gorevler.length) return NextResponse.json({ ok: true, rows: [], ozet: { toplam: 0, dolduruldu: 0, tamamlanan: 0 }, lokasyonlar: loks ?? [], kullanicilar: [] })

    const gorevIds = gorevler.map((g: any) => g.id)

    // Checklist results
    const { data: checkResults } = await admin
      .from('checklist_results')
      .select('id,task_id,task_type,item_id,durum,not_metni,kullanici_id,tarih,kanal')
      .in('task_id', gorevIds)

    // Kullanıcılar
    const allUserIds = [...new Set([
      ...gorevler.map((g: any) => g.atanan_kullanici_id),
      ...gorevler.map((g: any) => g.tamamlayan_kullanici_id),
      ...gorevler.map((g: any) => g.islemi_yapan_id),
      ...(checkResults ?? []).map((r: any) => r.kullanici_id),
    ].filter(Boolean))]
    const { data: usersData } = allUserIds.length
      ? await admin.from('users').select('id,isim_soyisim').in('id', allUserIds)
      : { data: [] }
    const userMap = new Map<string, string>((usersData ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

    // Results map: task_id → item_id → result
    const resMap = new Map<string, Map<string, any>>()
    for (const r of checkResults ?? []) {
      if (!resMap.has(r.task_id)) resMap.set(r.task_id, new Map())
      resMap.get(r.task_id)!.set(r.item_id, r)
    }

    // Satır oluştur — her görev için özet + madde detayları
    const rows: any[] = []
    for (const g of gorevler) {
      const lok = lokMap.get(g.lokasyon_id)
      if (!lok) continue

      const items = templateItemMap.get(lok.checklist_sablon_id) ?? []
      const taskResults = resMap.get(g.id) ?? new Map()
      const dolduruldu = items.filter((item: any) => taskResults.has(item.id)).length
      const tamamlanan = items.filter((item: any) => taskResults.get(item.id)?.durum === true).length
      const atanan  = g.atanan_kullanici_id ? userMap.get(g.atanan_kullanici_id) ?? '—' : '—'
      const tamamlayan = g.tamamlayan_kullanici_id ? userMap.get(g.tamamlayan_kullanici_id) : g.islemi_yapan_id ? userMap.get(g.islemi_yapan_id) : null

      // Filtreler
      if (tanimAra && !(g.tanim ?? '').toLowerCase().includes(tanimAra.toLowerCase())) continue
      if (yapanAdi && !(tamamlayan ?? '').toLowerCase().includes(yapanAdi.toLowerCase())) continue

      rows.push({
        gorev_id:         g.id,
        tanim:            g.tanim,
        gorev_tipi:       seen.has(g.id) && gorevlerAll.find(x => x.id === g.id) ? 'Frekansiyel' : 'Spesifik',
        durum:            g.durum,
        lokasyon:         lok.tanim,
        atanan,
        tamamlayan:       tamamlayan ?? '—',
        olusturma:        fmt(g.olusturma_tarihi),
        tamamlanma:       fmt(g.tamamlanma_tarihi),
        madde_toplam:     items.length,
        madde_dolduruldu: dolduruldu,
        madde_tamamlanan: tamamlanan,
        basari_pct:       items.length > 0 ? Math.round(tamamlanan / items.length * 100) : 0,
        maddeler:         items.map((item: any) => {
          const r = taskResults.get(item.id)
          return {
            sira: item.sira, madde: item.madde, zorunlu: item.zorunlu,
            durum: r?.durum ?? null, not: r?.not_metni ?? null,
            yapan: r?.kullanici_id ? userMap.get(r.kullanici_id) ?? null : null,
            tarih: r?.tarih ? fmt(r.tarih) : null, kanal: r?.kanal ?? null,
          }
        }),
      })
    }

    // Özet
    const ozet = {
      toplam:     rows.length,
      dolduruldu: rows.filter(r => r.madde_dolduruldu > 0).length,
      tamamlanan: rows.filter(r => r.basari_pct === 100).length,
      ort_basari: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.basari_pct, 0) / rows.length) : 0,
    }

    const kullanicilar = (usersData ?? []).map((u: any) => ({ id: u.id, isim_soyisim: u.isim_soyisim }))
    return NextResponse.json({ ok: true, rows, ozet, lokasyonlar: loks ?? [], kullanicilar })
  } catch (err: any) {
    console.error('[ceklist-rapor]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
