/**
 * GET /api/reports/ceklist-rapor
 *
 * Çeklistli lokasyonlardaki TÜM terminal görevleri listeler.
 * Çeklist doldurulmuş olsun ya da olmasın görev görünür.
 *
 * kaynak:
 *   rapor  → tamamlanma_tarihi son 24 saat  (Rapor Merkezi)
 *   arsiv  → tamamlanma_tarihi 24 saatten eski (Arşiv)
 *   hepsi  → zaman kısıtı yok
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const TERMINAL = ['TAMAMLANDI','ZAMANINDA_YAPILAMAYAN','ZAMANI_GECMIS','IPTAL','SILINDI','KAPATILDI']

function fmt(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v); if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me || !['super_admin','alt_super_admin','tenant_admin','musteri','tenant_user'].includes(me.rol))
      return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

    const isSA      = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const sp        = new URL(req.url).searchParams
    const firmaId   = isSA ? sp.get('firmaId') : me.firma_id
    const projeId   = sp.get('projeId')    ?? null
    const baslangic = sp.get('baslangic')  ?? null  // tamamlanma_tarihi filtresi
    const bitis     = sp.get('bitis')      ?? null
    const lokIdFil  = sp.get('lokasyonId') ?? null
    const tanimAra  = sp.get('tanim')      ?? null
    const yapanAra  = sp.get('yapan')      ?? null
    const kaynak    = sp.get('kaynak')     ?? 'rapor'

    if (!firmaId) return NextResponse.json({ error: 'firmaId gerekli' }, { status: 400 })

    const admin = createAdminClient()
    const sinir = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const empty = { ok:true, rows:[], ozet:{toplam:0,dolduruldu:0,basari:0}, lokasyonlar:[], kullanicilar:[] }

    // ── 1. Çeklistli lokasyonlar ──────────────────────────────────────────
    let lokQ: any = admin.from('lokasyonlar')
      .select('id,tanim,parent_id,checklist_sablon_id')
      .eq('firma_id', firmaId)
      .not('checklist_sablon_id', 'is', null)
    if (projeId)  lokQ = lokQ.eq('proje_id', projeId)
    if (lokIdFil) lokQ = lokQ.eq('id', lokIdFil)
    const { data: loks } = await lokQ
    if (!(loks as any[])?.length) return NextResponse.json(empty)

    const lokIds = (loks as any[]).map(l => l.id)

    // Lokasyon yolu için parent zinciri
    const lokFullMap = new Map<string,any>((loks as any[]).map(l => [l.id, l]))
    const pIds1 = [...new Set((loks as any[]).map(l => l.parent_id).filter(Boolean) as string[])].filter(id => !lokFullMap.has(id))
    if (pIds1.length) {
      const { data } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', pIds1) as any
      for (const l of (data ?? []) as any[]) lokFullMap.set(l.id, l)
    }
    const pIds2 = [...new Set([...lokFullMap.values()].map(l => l.parent_id).filter(Boolean) as string[])].filter(id => !lokFullMap.has(id))
    if (pIds2.length) {
      const { data } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', pIds2) as any
      for (const l of (data ?? []) as any[]) lokFullMap.set(l.id, l)
    }
    function lokYolu(id: string): string {
      const parts: string[] = []; let cur: string | null = id
      while (cur) { const l = lokFullMap.get(cur); if (!l) break; parts.unshift(l.tanim); cur = l.parent_id ?? null }
      return parts.join(' / ')
    }

    // ── 2. Şablon maddeleri ───────────────────────────────────────────────
    const sablonIds = [...new Set((loks as any[]).map(l => l.checklist_sablon_id).filter(Boolean) as string[])]
    const { data: maddelerData } = (sablonIds.length
      ? await admin.from('checklist_sablon_maddeleri').select('id,sablon_id,sira_no,baslik,zorunlu_cevap').in('sablon_id', sablonIds).order('sira_no')
      : { data: [] }) as any
    const sablonMaddeMap = new Map<string,any[]>()
    for (const m of (maddelerData ?? []) as any[]) {
      const arr = sablonMaddeMap.get(m.sablon_id) ?? []; arr.push(m); sablonMaddeMap.set(m.sablon_id, arr)
    }

    // ── 3. Terminal görevleri çek — kaynak + tarih filtreli ───────────────
    // gorev_id → { g, tip }
    const gorevMap    = new Map<string,any>()
    const gorevTipMap = new Map<string,string>()

    async function sorguGorevler(tablo: string, tip: string) {
      let q: any = admin.from(tablo)
        .select(tablo === 'gorevler'
          ? 'id,tanim,durum,lokasyon_id,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id'
          : 'id,tanim,durum,lokasyon_id,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id,tamamlayan_kullanici_id')
        .eq('firma_id', firmaId)
        .in('lokasyon_id', lokIds)
        .in('durum', TERMINAL)
      if (projeId)              q = q.eq('proje_id', projeId)
      if (kaynak === 'rapor')   q = q.gte('tamamlanma_tarihi', sinir)
      if (kaynak === 'arsiv')   q = q.lt('tamamlanma_tarihi', sinir)
      if (baslangic)            q = q.gte('tamamlanma_tarihi', `${baslangic}T00:00:00`)
      if (bitis)                q = q.lte('tamamlanma_tarihi', `${bitis}T23:59:59.999`)
      const { data } = await q
      for (const g of (data ?? []) as any[]) {
        if (!gorevMap.has(g.id)) { gorevMap.set(g.id, g); gorevTipMap.set(g.id, tip) }
      }
    }

    // Frekansiyel
    if (kaynak === 'rapor') {
      await sorguGorevler('canli_gorevler', 'Frekansiyel')
    } else if (kaynak === 'arsiv') {
      await sorguGorevler('canli_gorevler_arsiv', 'Frekansiyel')
      await sorguGorevler('canli_gorevler', 'Frekansiyel')  // fiziksel arşivleme gecikmesi için
    } else {
      await sorguGorevler('canli_gorevler', 'Frekansiyel')
      await sorguGorevler('canli_gorevler_arsiv', 'Frekansiyel')
    }
    // Spesifik
    await sorguGorevler('gorevler', 'Spesifik')

    if (!gorevMap.size) return NextResponse.json({
      ...empty,
      lokasyonlar: (loks as any[]).map(l => ({id:l.id,tanim:lokYolu(l.id)}))
    })

    // ── 4. Çeklist sonuç başlıkları (opsiyonel — yoksa görev yine görünür) ─
    const gorevIds = [...gorevMap.keys()]
    const orFilter = gorevIds.map(id => `gorev_id.eq.${id},canli_gorev_id.eq.${id}`).join(',')
    const { data: basliklari } = await admin.from('checklist_sonuc_basliklari')
      .select('id,gorev_id,canli_gorev_id,lokasyon_id,sablon_id,kullanici_id,kanal,kayit_tarihi')
      .or(orFilter)
      .order('kayit_tarihi', { ascending: false }) as any

    // gorev başına en son çeklist kaydı
    const sbMap = new Map<string,any>()
    for (const sb of (basliklari ?? []) as any[]) {
      const gid = sb.gorev_id ?? sb.canli_gorev_id
      if (gid && !sbMap.has(gid)) sbMap.set(gid, sb)
    }

    // ── 5. Madde cevapları ────────────────────────────────────────────────
    const sonucIds = [...sbMap.values()].map((sb: any) => sb.id)
    const { data: cevaplarData } = (sonucIds.length
      ? await admin.from('checklist_sonuc_maddeleri').select('sonuc_id,madde_id,secenek_degeri,aciklama,gorsel_url').in('sonuc_id', sonucIds)
      : { data: [] }) as any
    const cevapMap = new Map<string,Map<string,any>>()
    for (const c of (cevaplarData ?? []) as any[]) {
      if (!cevapMap.has(c.sonuc_id)) cevapMap.set(c.sonuc_id, new Map())
      cevapMap.get(c.sonuc_id)!.set(c.madde_id, c)
    }

    // ── 6. Kullanıcılar ───────────────────────────────────────────────────
    const allUserIds = [...new Set([
      ...[...sbMap.values()].map((sb: any) => sb.kullanici_id).filter(Boolean),
      ...[...gorevMap.values()].flatMap((g: any) => [g.tamamlayan_kullanici_id, g.atanan_kullanici_id, g.islemi_yapan_id].filter(Boolean)),
    ])]
    const { data: usersData } = (allUserIds.length
      ? await admin.from('users').select('id,isim_soyisim').in('id', allUserIds)
      : { data: [] }) as any
    const userMap = new Map<string,string>(((usersData ?? []) as any[]).map(u => [u.id, u.isim_soyisim ?? '']))

    // ── 7. Satırları oluştur ──────────────────────────────────────────────
    const rows: any[] = []
    for (const [gorevId, g] of gorevMap) {
      const lok = (loks as any[]).find(l => l.id === g.lokasyon_id)
      if (!lok) continue

      if (tanimAra && !(g.tanim ?? '').toLowerCase().includes(tanimAra.toLowerCase())) continue

      const sb       = sbMap.get(gorevId) ?? null
      const sablonId = lok.checklist_sablon_id
      const maddeler = sablonId ? (sablonMaddeMap.get(sablonId) ?? []) : []
      const cevaplar = sb ? (cevapMap.get(sb.id) ?? new Map()) : new Map()
      const dolduruldu = maddeler.filter((m: any) => cevaplar.has(m.id)).length
      const basari = maddeler.length > 0 ? Math.round(dolduruldu / maddeler.length * 100) : 0
      const ceklist_dolu = !!sb

      const yapanId = sb?.kullanici_id ?? g.tamamlayan_kullanici_id ?? g.islemi_yapan_id ?? g.atanan_kullanici_id
      const yapan = yapanId ? (userMap.get(yapanId) ?? '—') : '—'

      if (yapanAra && !yapan.toLowerCase().includes(yapanAra.toLowerCase())) continue

      rows.push({
        sonuc_id:         sb?.id ?? null,
        gorev_id:         gorevId,
        tanim:            g.tanim ?? '—',
        gorev_tipi:       gorevTipMap.get(gorevId) ?? '—',
        durum:            g.durum,
        lokasyon:         lokYolu(g.lokasyon_id),
        yapan,
        kayit_tarihi:     sb ? fmt(sb.kayit_tarihi) : '—',
        tamamlanma:       fmt(g.tamamlanma_tarihi),
        kanal:            sb?.kanal ?? '—',
        ceklist_dolu,
        madde_toplam:     maddeler.length,
        madde_dolduruldu: dolduruldu,
        basari_pct:       basari,
        maddeler: maddeler.map((m: any) => {
          const c = cevaplar.get(m.id)
          return { madde_id:m.id, sira:m.sira_no, madde:m.baslik, zorunlu:m.zorunlu_cevap!==false,
            secenek:c?.secenek_degeri??null, not:c?.aciklama??null, gorsel_url:c?.gorsel_url??null, dolduruldu:!!c }
        }),
      })
    }

    rows.sort((a, b) => {
      const ta = gorevMap.get(a.gorev_id)?.tamamlanma_tarihi ?? ''
      const tb = gorevMap.get(b.gorev_id)?.tamamlanma_tarihi ?? ''
      return tb.localeCompare(ta)
    })

    const ozet = {
      toplam:     rows.length,
      dolduruldu: rows.filter(r => r.ceklist_dolu).length,
      basari:     rows.filter(r => r.ceklist_dolu).length > 0
        ? Math.round(rows.filter(r => r.ceklist_dolu).reduce((s,r) => s+r.basari_pct, 0) / rows.filter(r => r.ceklist_dolu).length)
        : 0,
    }

    return NextResponse.json({ ok:true, rows, ozet,
      lokasyonlar: (loks as any[]).map(l => ({id:l.id,tanim:lokYolu(l.id)})),
      kullanicilar: ((usersData??[]) as any[]).map(u => ({id:u.id,isim_soyisim:u.isim_soyisim})) })
  } catch (err: any) {
    console.error('[ceklist-rapor]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
