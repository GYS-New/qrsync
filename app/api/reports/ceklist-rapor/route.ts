/**
 * GET /api/reports/ceklist-rapor
 *
 * Çeklist şablonu olan lokasyonlara bağlı terminal durumlu görevleri döner.
 * Çeklist doldurulmuş olsun ya da olmasın, tüm uygun görevler listelenir.
 *
 * Parametreler:
 *   firmaId      – SA için zorunlu
 *   projeId      – opsiyonel
 *   baslangic    – YYYY-MM-DD, tamamlanma_tarihi başlangıcı
 *   bitis        – YYYY-MM-DD, tamamlanma_tarihi bitişi
 *   kaynak       – 'canli' | 'arsiv' | 'hepsi' (varsayılan: hepsi)
 *   durum        – tek durum filtresi, yoksa tüm terminal durumlar
 *   lokasyonId   – opsiyonel lokasyon filtresi
 *   tanim        – görev adı arama
 *   yapan        – tamamlayan adı arama
 *   gorevTipi    – 'frekansiyel' | 'spesifik' | 'hepsi'
 *
 * Terminal durumlar:
 *   TAMAMLANDI, ZAMANINDA_YAPILAMAYAN, ZAMANI_GECMIS, IPTAL, SILINDI, KAPATILDI
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const TERMINAL = [
  'TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS',
  'IPTAL', 'SILINDI', 'KAPATILDI',
]

function fmt(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin', 'musteri', 'tenant_user'].includes(me.rol)) {
      return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
    }

    const isSA      = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const sp        = new URL(req.url).searchParams
    const firmaId   = isSA ? sp.get('firmaId') : me.firma_id
    const projeId   = sp.get('projeId')    ?? null
    const baslangic = sp.get('baslangic')  ?? null
    const bitis     = sp.get('bitis')      ?? null
    const kaynak    = sp.get('kaynak')     ?? 'hepsi'   // canli | arsiv | hepsi
    const durumFil  = sp.get('durum')      ?? null
    const lokIdFil  = sp.get('lokasyonId') ?? null
    const tanimAra  = sp.get('tanim')      ?? null
    const yapanAra  = sp.get('yapan')      ?? null
    const gorevTipi = sp.get('gorevTipi')  ?? 'hepsi'  // frekansiyel | spesifik | hepsi

    if (!firmaId) return NextResponse.json({ error: 'firmaId gerekli' }, { status: 400 })

    const admin = createAdminClient()

    // ── 1. Çeklist şablonu olan lokasyonlar ───────────────────────────────
    let lokQ = admin.from('lokasyonlar')
      .select('id,tanim,parent_id,checklist_sablon_id')
      .eq('firma_id', firmaId)
      .not('checklist_sablon_id', 'is', null)
    if (projeId)  lokQ = (lokQ as any).eq('proje_id', projeId)
    if (lokIdFil) lokQ = (lokQ as any).eq('id', lokIdFil)

    const { data: loks } = await lokQ
    if (!loks?.length) {
      return NextResponse.json({ ok: true, rows: [], ozet: { toplam: 0, dolduruldu: 0, basari: 0 }, lokasyonlar: [], kullanicilar: [] })
    }

    const lokIds = loks.map((l: any) => l.id)

    // Lokasyon yolu için parent bilgileri
    const lokFullMap = new Map<string, any>(loks.map((l: any) => [l.id, l]))
    const pIds1 = [...new Set(loks.map((l: any) => l.parent_id).filter(Boolean) as string[])].filter(id => !lokFullMap.has(id))
    if (pIds1.length) {
      const { data: p1 } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', pIds1)
      for (const l of p1 ?? []) lokFullMap.set(l.id, l)
    }
    const pIds2 = [...new Set([...lokFullMap.values()].map((l: any) => l.parent_id).filter(Boolean) as string[])].filter(id => !lokFullMap.has(id))
    if (pIds2.length) {
      const { data: p2 } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', pIds2)
      for (const l of p2 ?? []) lokFullMap.set(l.id, l)
    }

    function lokYolu(id: string): string {
      const parts: string[] = []
      let cur: string | null = id
      while (cur) {
        const l = lokFullMap.get(cur)
        if (!l) break
        parts.unshift(l.tanim)
        cur = l.parent_id ?? null
      }
      return parts.join(' / ')
    }

    // ── 2. Şablon maddeleri ───────────────────────────────────────────────
    const sablonIds = [...new Set(loks.map((l: any) => l.checklist_sablon_id).filter(Boolean))]
    const { data: maddelerData } = sablonIds.length
      ? await admin.from('checklist_sablon_maddeleri')
          .select('id,sablon_id,sira_no,baslik,zorunlu_cevap')
          .in('sablon_id', sablonIds)
          .order('sira_no', { ascending: true })
      : { data: [] }

    const sablonMaddeMap = new Map<string, any[]>()
    for (const m of maddelerData ?? []) {
      const arr = sablonMaddeMap.get(m.sablon_id) ?? []
      arr.push(m)
      sablonMaddeMap.set(m.sablon_id, arr)
    }

    // ── 3. Görevleri çek ─────────────────────────────────────────────────
    const durumlar = (durumFil && durumFil !== 'TUMU') ? [durumFil] : TERMINAL
    const SEL = 'id,tanim,durum,lokasyon_id,olusturma_tarihi,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id,tamamlayan_kullanici_id'

    async function queryTable(tbl: string): Promise<any[]> {
      let q: any = admin.from(tbl).select(SEL)
        .eq('firma_id', firmaId)
        .in('lokasyon_id', lokIds)
        .in('durum', durumlar)
      if (projeId)    q = q.eq('proje_id', projeId)
      if (baslangic)  q = q.gte('tamamlanma_tarihi', `${baslangic}T00:00:00`)
      if (bitis)      q = q.lte('tamamlanma_tarihi', `${bitis}T23:59:59.999`)
      const { data, error } = await q
      if (error) console.error(`[ceklist-rapor] ${tbl} sorgu hatası:`, error.message)
      return data ?? []
    }

    const gorevMap = new Map<string, { g: any; tip: string }>()

    if (kaynak !== 'arsiv' && gorevTipi !== 'spesifik') {
      for (const g of await queryTable('canli_gorevler'))
        if (!gorevMap.has(g.id)) gorevMap.set(g.id, { g, tip: 'Frekansiyel' })
    }
    if (kaynak !== 'canli' && gorevTipi !== 'spesifik') {
      for (const g of await queryTable('canli_gorevler_arsiv'))
        if (!gorevMap.has(g.id)) gorevMap.set(g.id, { g, tip: 'Frekansiyel' })
    }
    if (kaynak !== 'arsiv' && gorevTipi !== 'frekansiyel') {
      for (const g of await queryTable('gorevler'))
        if (!gorevMap.has(g.id)) gorevMap.set(g.id, { g, tip: 'Spesifik' })
    }

    if (!gorevMap.size) {
      return NextResponse.json({ ok: true, rows: [], ozet: { toplam: 0, dolduruldu: 0, basari: 0 }, lokasyonlar: loks.map((l: any) => ({ id: l.id, tanim: lokYolu(l.id) })), kullanicilar: [] })
    }

    // ── 4. Kullanıcı adları ───────────────────────────────────────────────
    const allUserIds = [...new Set(
      [...gorevMap.values()].flatMap(({ g }) =>
        [g.atanan_kullanici_id, g.tamamlayan_kullanici_id, g.islemi_yapan_id].filter(Boolean)
      )
    )]
    const { data: usersData } = allUserIds.length
      ? await admin.from('users').select('id,isim_soyisim').in('id', allUserIds)
      : { data: [] }
    const userMap = new Map<string, string>((usersData ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

    // ── 5. Çeklist sonuç başlıkları ───────────────────────────────────────
    const gorevIds = [...gorevMap.keys()]
    const orFilter = gorevIds.map(id => `gorev_id.eq.${id},canli_gorev_id.eq.${id}`).join(',')
    const { data: sonucBasliklari, error: sbErr } = await admin
      .from('checklist_sonuc_basliklari')
      .select('id,gorev_id,canli_gorev_id,kullanici_id,kanal,kayit_tarihi')
      .or(orFilter)
      .order('kayit_tarihi', { ascending: false })

    if (sbErr) console.error('[ceklist-rapor] sonuc_basliklari hatası:', sbErr.message)

    const sbMap = new Map<string, any>()
    for (const sb of sonucBasliklari ?? []) {
      const gid = sb.gorev_id ?? sb.canli_gorev_id
      if (gid && !sbMap.has(gid)) sbMap.set(gid, sb)
    }

    // ── 6. Madde cevapları ────────────────────────────────────────────────
    const sonucIds = [...sbMap.values()].map((sb: any) => sb.id)
    const { data: cevaplarData } = sonucIds.length
      ? await admin.from('checklist_sonuc_maddeleri')
          .select('sonuc_id,madde_id,secenek_degeri,aciklama,gorsel_url')
          .in('sonuc_id', sonucIds)
      : { data: [] }

    const cevapMap = new Map<string, Map<string, any>>()
    for (const c of cevaplarData ?? []) {
      if (!cevapMap.has(c.sonuc_id)) cevapMap.set(c.sonuc_id, new Map())
      cevapMap.get(c.sonuc_id)!.set(c.madde_id, c)
    }

    // ── 7. Satır oluştur ──────────────────────────────────────────────────
    const rows: any[] = []
    for (const { g, tip } of gorevMap.values()) {
      const lok = loks.find((l: any) => l.id === g.lokasyon_id)
      if (!lok) continue

      const maddeler   = sablonMaddeMap.get(lok.checklist_sablon_id) ?? []
      const sb         = sbMap.get(g.id)
      const cevaplar   = sb ? (cevapMap.get(sb.id) ?? new Map()) : new Map<string, any>()
      const dolduruldu = maddeler.filter((m: any) => cevaplar.has(m.id)).length
      const basari     = maddeler.length > 0 ? Math.round(dolduruldu / maddeler.length * 100) : 0

      const yapanId = sb?.kullanici_id ?? g.tamamlayan_kullanici_id ?? g.islemi_yapan_id
      const yapan   = yapanId ? (userMap.get(yapanId) ?? '—') : '—'

      if (tanimAra && !(g.tanim ?? '').toLowerCase().includes(tanimAra.toLowerCase())) continue
      if (yapanAra && !yapan.toLowerCase().includes(yapanAra.toLowerCase())) continue

      rows.push({
        gorev_id:         g.id,
        tanim:            g.tanim ?? '—',
        gorev_tipi:       tip,
        durum:            g.durum,
        lokasyon:         lokYolu(g.lokasyon_id),
        atanan:           g.atanan_kullanici_id ? (userMap.get(g.atanan_kullanici_id) ?? '—') : '—',
        yapan,
        olusturma:        fmt(g.olusturma_tarihi),
        tamamlanma:       fmt(g.tamamlanma_tarihi),
        ceklist_dolu:     !!sb,
        madde_toplam:     maddeler.length,
        madde_dolduruldu: dolduruldu,
        basari_pct:       basari,
        maddeler: maddeler.map((m: any) => {
          const c = cevaplar.get(m.id)
          return {
            sira:       m.sira_no,
            madde:      m.baslik,
            zorunlu:    m.zorunlu_cevap !== false,
            secenek:    c?.secenek_degeri ?? null,
            not:        c?.aciklama      ?? null,
            gorsel_url: c?.gorsel_url    ?? null,
            dolduruldu: !!c,
          }
        }),
      })
    }

    const ozet = {
      toplam:     rows.length,
      dolduruldu: rows.filter(r => r.ceklist_dolu).length,
      basari:     rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + r.basari_pct, 0) / rows.length)
        : 0,
    }

    return NextResponse.json({
      ok: true,
      rows,
      ozet,
      lokasyonlar: loks.map((l: any) => ({ id: l.id, tanim: lokYolu(l.id) })),
      kullanicilar: (usersData ?? []).map((u: any) => ({ id: u.id, isim_soyisim: u.isim_soyisim })),
    })
  } catch (err: any) {
    console.error('[ceklist-rapor]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
