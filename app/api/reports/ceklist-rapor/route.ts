/**
 * GET /api/reports/ceklist-rapor
 * Gerçek şema:
 *   checklist_sablonlari          → şablon
 *   checklist_sablon_maddeleri    → maddeler (sablon_id)
 *   checklist_sonuc_basliklari    → sonuç başlığı (gorev_id | canli_gorev_id)
 *   checklist_sonuc_maddeleri     → madde cevapları (sonuc_id, madde_id, secenek_degeri, aciklama, gorsel_url)
 *   lokasyonlar.checklist_sablon_id
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
    if (!me || !['super_admin','alt_super_admin','tenant_admin','musteri','tenant_user'].includes(me.rol)) {
      return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
    }
    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const p = new URL(req.url).searchParams
    const firmaId   = isSA ? p.get('firmaId') : me.firma_id
    const projeId   = p.get('projeId')   ?? null
    const baslangic = p.get('baslangic') ?? null
    const bitis     = p.get('bitis')     ?? null
    const lokId     = p.get('lokasyonId') ?? null
    const yapanAdi  = p.get('yapan')     ?? null
    const tanimAra  = p.get('tanim')     ?? null
    const durumFil  = p.get('durum')     ?? null
    const gorevTipi = p.get('gorevTipi') ?? 'hepsi'
    const kaynak    = p.get('kaynak')    ?? 'hepsi' // 'canli' | 'arsiv' | 'hepsi'

    if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    const admin = createAdminClient()

    // ── 1. Lokasyonlar (checklist şablonu olanlar) ────────────────────────
    let lokQ = admin.from('lokasyonlar')
      .select('id,tanim,parent_id,checklist_sablon_id')
      .eq('firma_id', firmaId)
      .not('checklist_sablon_id', 'is', null)
    if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
    if (lokId)   lokQ = (lokQ as any).eq('id', lokId)
    const { data: loks } = await lokQ
    const lokIds = (loks ?? []).map((l: any) => l.id)
    if (!lokIds.length) {
      return NextResponse.json({ ok: true, rows: [], ozet: { toplam:0,dolduruldu:0,tamamlanan:0,ort_basari:0 }, lokasyonlar:[], kullanicilar:[] })
    }

    // Lokasyon hiyerarşisi — parent ve grandparent'ları çek
    const allLokRaw = new Map<string, any>((loks ?? []).map((l: any) => [l.id, l]))
    const parentIds1 = [...new Set((loks ?? []).map((l: any) => l.parent_id).filter(Boolean) as string[])].filter(id => !allLokRaw.has(id))
    if (parentIds1.length) {
      const { data: p1 } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', parentIds1)
      for (const l of p1 ?? []) allLokRaw.set(l.id, l)
    }
    const parentIds2 = [...new Set([...allLokRaw.values()].map((l: any) => l.parent_id).filter(Boolean) as string[])].filter(id => !allLokRaw.has(id))
    if (parentIds2.length) {
      const { data: p2 } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', parentIds2)
      for (const l of p2 ?? []) allLokRaw.set(l.id, l)
    }

    // id → tam yol (Üst / Alt / Lokasyon)
    function lokYolu(id: string): string {
      const parts: string[] = []
      let cur: string | null = id
      while (cur) {
        const l = allLokRaw.get(cur)
        if (!l) break
        parts.unshift(l.tanim)
        cur = l.parent_id ?? null
      }
      return parts.join(' / ')
    }

    const lokMap = new Map<string, any>((loks ?? []).map((l: any) => [l.id, { ...l, yol: lokYolu(l.id) }]))

    // ── 2. Şablon maddeleri (checklist_sablon_maddeleri) ─────────────────
    const sablonIds = [...new Set((loks ?? []).map((l: any) => l.checklist_sablon_id).filter(Boolean))]
    const { data: maddelerData } = sablonIds.length
      ? await admin.from('checklist_sablon_maddeleri')
          .select('id,sablon_id,sira_no,baslik,zorunlu_cevap')
          .in('sablon_id', sablonIds)
          .order('sira_no', { ascending: true })
      : { data: [] }

    // sablonId → maddeler[]
    const sablonMaddeMap = new Map<string, any[]>()
    for (const m of maddelerData ?? []) {
      const arr = sablonMaddeMap.get(m.sablon_id) ?? []
      arr.push(m); sablonMaddeMap.set(m.sablon_id, arr)
    }

    // ── 3. Görevleri çek ─────────────────────────────────────────────────
    const SEL = 'id,firma_id,tanim,durum,lokasyon_id,olusturma_tarihi,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id,tamamlayan_kullanici_id'
    const buildQ = (table: string): Promise<any> => {
      let q = admin.from(table).select(SEL).eq('firma_id', firmaId).in('lokasyon_id', lokIds)
      if (projeId) q = (q as any).eq('proje_id', projeId)
      if (durumFil && durumFil !== 'TUMU') q = (q as any).eq('durum', durumFil)
      return Promise.resolve(q)
    }

    // kaynak: 'canli' → sadece canli_gorevler + gorevler
    //         'arsiv' → sadece canli_gorevler_arsiv
    //         'hepsi' → tümü (varsayılan)
    const queries: Promise<any>[] = []
    const tables: string[] = []
    if (kaynak !== 'arsiv' && gorevTipi !== 'spesifik')    { queries.push(buildQ('canli_gorevler')); tables.push('canli_gorevler') }
    if (kaynak !== 'canli' && gorevTipi !== 'spesifik')    { queries.push(buildQ('canli_gorevler_arsiv')); tables.push('canli_gorevler_arsiv') }
    if (kaynak !== 'arsiv' && gorevTipi !== 'frekansiyel') { queries.push(buildQ('gorevler')); tables.push('gorevler') }

    const results  = await Promise.all(queries)
    const gorevMap = new Map<string, { g: any; tip: string }>()
    const tipOf    = (tbl: string) => tbl === 'gorevler' ? 'Spesifik' : 'Frekansiyel'

    results.forEach((r, i) => {
      for (const g of r.data ?? []) {
        if (!gorevMap.has(g.id)) gorevMap.set(g.id, { g, tip: tipOf(tables[i] ?? '') })
      }
    })

    // Tarih filtresi
    const gorevler = Array.from(gorevMap.values()).filter(({ g }) =>
      withinRange(g.tamamlanma_tarihi ?? g.olusturma_tarihi, baslangic, bitis)
    )
    if (!gorevler.length) {
      return NextResponse.json({ ok: true, rows: [], ozet:{toplam:0,dolduruldu:0,tamamlanan:0,ort_basari:0}, lokasyonlar: loks ?? [], kullanicilar: [] })
    }

    const gorevIds = gorevler.map(({ g }) => g.id)

    // ── 4. Kullanıcılar ──────────────────────────────────────────────────
    const allUserIds = [...new Set(gorevler.flatMap(({ g }) => [
      g.atanan_kullanici_id, g.tamamlayan_kullanici_id, g.islemi_yapan_id
    ]).filter(Boolean))]
    const { data: usersData } = allUserIds.length
      ? await admin.from('users').select('id,isim_soyisim').in('id', allUserIds)
      : { data: [] }
    const userMap = new Map<string, string>((usersData ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

    // ── 5. Sonuç başlıkları (checklist_sonuc_basliklari) ─────────────────
    // Her görev için en son sonucu al
    const { data: sonucBasliklari } = await admin
      .from('checklist_sonuc_basliklari')
      .select('id,gorev_id,canli_gorev_id,kullanici_id,kanal,kayit_tarihi')
      .or(gorevIds.map(id => `gorev_id.eq.${id},canli_gorev_id.eq.${id}`).join(','))
      .order('kayit_tarihi', { ascending: false })

    // gorevId → en son sonuç başlığı
    const sonucBaslikMap = new Map<string, any>()
    for (const sb of sonucBasliklari ?? []) {
      const gid = sb.gorev_id ?? sb.canli_gorev_id
      if (gid && !sonucBaslikMap.has(gid)) sonucBaslikMap.set(gid, sb)
    }

    // ── 6. Madde cevapları (checklist_sonuc_maddeleri) ───────────────────
    const sonucIds = [...sonucBaslikMap.values()].map((sb: any) => sb.id)
    const { data: sonucMaddeler } = sonucIds.length
      ? await admin.from('checklist_sonuc_maddeleri')
          .select('id,sonuc_id,madde_id,secenek_degeri,aciklama,gorsel_url')
          .in('sonuc_id', sonucIds)
      : { data: [] }

    // sonucId → maddeId → cevap
    const cevapMap = new Map<string, Map<string, any>>()
    for (const sm of sonucMaddeler ?? []) {
      if (!cevapMap.has(sm.sonuc_id)) cevapMap.set(sm.sonuc_id, new Map())
      cevapMap.get(sm.sonuc_id)!.set(sm.madde_id, sm)
    }

    // ── 7. Satır oluştur ─────────────────────────────────────────────────
    const rows: any[] = []
    for (const { g, tip } of gorevler) {
      const lok    = lokMap.get(g.lokasyon_id)
      if (!lok) continue

      const maddeler     = sablonMaddeMap.get(lok.checklist_sablon_id) ?? []
      const sonucBaslik  = sonucBaslikMap.get(g.id)
      if (!sonucBaslik) continue  // Çeklist doldurulmamış görevleri listeleme
      const gorevCevaplar = cevapMap.get(sonucBaslik.id) ?? new Map()

      const dolduruldu = maddeler.filter((m: any) => gorevCevaplar.has(m.id)).length
      const tamamlanan = maddeler.filter((m: any) => {
        const c = gorevCevaplar.get(m.id)
        return c && (c.secenek_degeri || c.aciklama || c.gorsel_url)
      }).length

      const tamamlayan = g.tamamlayan_kullanici_id
        ? userMap.get(g.tamamlayan_kullanici_id)
        : g.islemi_yapan_id ? userMap.get(g.islemi_yapan_id) : null

      if (tanimAra && !(g.tanim ?? '').toLowerCase().includes(tanimAra.toLowerCase())) continue
      if (yapanAdi && !(tamamlayan ?? '').toLowerCase().includes(yapanAdi.toLowerCase())) continue

      const yapanId  = sonucBaslik?.kullanici_id ?? g.islemi_yapan_id
      const yapanAdi2 = yapanId ? userMap.get(yapanId) ?? '—' : '—'

      rows.push({
        gorev_id:         g.id,
        task_type:        tip === 'Spesifik' ? 'gorevler' : 'canli_gorevler',
        tanim:            g.tanim,
        gorev_tipi:       tip,
        durum:            g.durum,
        lokasyon:         lok.yol ?? lok.tanim,
        atanan:           g.atanan_kullanici_id ? userMap.get(g.atanan_kullanici_id) ?? '—' : '—',
        tamamlayan:       tamamlayan ?? '—',
        olusturma:        fmt(g.olusturma_tarihi),
        tamamlanma:       fmt(g.tamamlanma_tarihi),
        madde_toplam:     maddeler.length,
        madde_dolduruldu: dolduruldu,
        madde_tamamlanan: tamamlanan,
        basari_pct:       maddeler.length > 0 ? Math.round(dolduruldu / maddeler.length * 100) : 0,
        maddeler: maddeler.map((m: any) => {
          const c = gorevCevaplar.get(m.id)
          return {
            sira:       m.sira_no,
            madde:      m.baslik,
            zorunlu:    m.zorunlu_cevap !== false,
            secenek:    c?.secenek_degeri ?? null,
            not:        c?.aciklama ?? null,
            gorsel_url: c?.gorsel_url ?? null,
            yapan:      sonucBaslik ? yapanAdi2 : null,
            tarih:      sonucBaslik?.kayit_tarihi ? fmt(sonucBaslik.kayit_tarihi) : null,
            kanal:      sonucBaslik?.kanal ?? null,
            dolduruldu: !!c,
            durum:      c ? true : null,
          }
        }),
      })
    }

    const ozet = {
      toplam:     rows.length,
      dolduruldu: rows.filter(r => r.madde_dolduruldu > 0).length,
      tamamlanan: rows.filter(r => r.basari_pct === 100).length,
      ort_basari: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.basari_pct, 0) / rows.length) : 0,
    }

    const kullanicilar = (usersData ?? []).map((u: any) => ({ id: u.id, isim_soyisim: u.isim_soyisim }))
    const lokasyonlar  = (loks ?? []).map((l: any) => ({ id: l.id, tanim: lokYolu(l.id) }))
    return NextResponse.json({ ok: true, rows, ozet, lokasyonlar, kullanicilar })
  } catch (err: any) {
    console.error('[ceklist-rapor]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
