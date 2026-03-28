/**
 * GET /api/reports/ceklist-rapor
 *
 * kaynak parametresi:
 *   rapor  → tamamlanma_tarihi son 24 saat içinde   (Rapor Merkezi)
 *   arsiv  → tamamlanma_tarihi 24 saatten eski       (Arşiv)
 *   hepsi  → zaman kısıtı yok                        (Tümünü Göster)
 *
 * Tarih filtreleri (baslangic/bitis) kayit_tarihi üzerinden çalışır.
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
    const projeId   = sp.get('projeId')   ?? null
    const baslangic = sp.get('baslangic') ?? null
    const bitis     = sp.get('bitis')     ?? null
    const lokIdFil  = sp.get('lokasyonId') ?? null
    const tanimAra  = sp.get('tanim')     ?? null
    const yapanAra  = sp.get('yapan')     ?? null
    const kaynak    = sp.get('kaynak')    ?? 'rapor'

    if (!firmaId) return NextResponse.json({ error: 'firmaId gerekli' }, { status: 400 })

    const admin = createAdminClient()
    const sinir = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const empty = { ok:true, rows:[], ozet:{toplam:0,dolduruldu:0,basari:0}, lokasyonlar:[], kullanicilar:[] }

    // ── 1. Lokasyonlar ────────────────────────────────────────────────────
    let lokQ = admin.from('lokasyonlar').select('id,tanim,parent_id,checklist_sablon_id').eq('firma_id', firmaId)
    if (projeId)  lokQ = (lokQ as any).eq('proje_id', projeId)
    if (lokIdFil) lokQ = (lokQ as any).eq('id', lokIdFil)
    const { data: loks } = await lokQ
    if (!loks?.length) return NextResponse.json(empty)

    const lokIds = (loks as any[]).map(l => l.id)
    const lokFullMap = new Map<string,any>((loks as any[]).map(l => [l.id, l]))
    const pIds1 = [...new Set((loks as any[]).map(l => l.parent_id).filter(Boolean))].filter((id: any) => !lokFullMap.has(id))
    if (pIds1.length) { const { data } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', pIds1); for (const l of (data ?? []) as any[]) lokFullMap.set(l.id, l) }
    const pIds2 = [...new Set([...lokFullMap.values()].map(l => l.parent_id).filter(Boolean))].filter((id: any) => !lokFullMap.has(id))
    if (pIds2.length) { const { data } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', pIds2); for (const l of (data ?? []) as any[]) lokFullMap.set(l.id, l) }
    function lokYolu(id: string): string {
      const parts: string[] = []; let cur: string | null = id
      while (cur) { const l = lokFullMap.get(cur); if (!l) break; parts.unshift(l.tanim); cur = l.parent_id ?? null }
      return parts.join(' / ')
    }

    // ── 2. Şablon maddeleri ───────────────────────────────────────────────
    const sablonIds = [...new Set((loks as any[]).map(l => l.checklist_sablon_id).filter(Boolean))]
    const { data: maddelerData } = (sablonIds.length
      ? await admin.from('checklist_sablon_maddeleri').select('id,sablon_id,sira_no,baslik,zorunlu_cevap').in('sablon_id', sablonIds).order('sira_no')
      : { data: [] }) as any
    const sablonMaddeMap = new Map<string,any[]>()
    for (const m of (maddelerData ?? []) as any[]) {
      const arr = sablonMaddeMap.get(m.sablon_id) ?? []; arr.push(m); sablonMaddeMap.set(m.sablon_id, arr)
    }

    // ── 3. BİRİNCİL KAYNAK: checklist_sonuc_basliklari ───────────────────
    // Tarih filtresi (baslangic/bitis) kayit_tarihi üzerinden
    let sbQ = admin.from('checklist_sonuc_basliklari')
      .select('id,gorev_id,canli_gorev_id,lokasyon_id,sablon_id,kullanici_id,kanal,kayit_tarihi')
      .in('lokasyon_id', lokIds)
      .order('kayit_tarihi', { ascending: false })
    if (baslangic) sbQ = (sbQ as any).gte('kayit_tarihi', `${baslangic}T00:00:00`)
    if (bitis)     sbQ = (sbQ as any).lte('kayit_tarihi', `${bitis}T23:59:59.999`)
    const { data: basliklari, error: sbErr } = await sbQ
    if (sbErr) throw sbErr
    if (!(basliklari as any[])?.length) return NextResponse.json({ ...empty, lokasyonlar: (loks as any[]).map(l => ({id:l.id,tanim:lokYolu(l.id)})) })

    // ── 4. Görev metadata — her iki tablo tipinden çek ────────────────────
    const gorevIds  = [...new Set((basliklari as any[]).map(b => b.gorev_id).filter(Boolean))]
    const canliIds  = [...new Set((basliklari as any[]).map(b => b.canli_gorev_id).filter(Boolean))]
    const gorevMap  = new Map<string,any>()
    const gorevTipMap = new Map<string,string>()

    if (gorevIds.length) {
      const { data } = await admin.from('gorevler')
        .select('id,tanim,durum,tamamlanma_tarihi,islemi_yapan_id')
        .in('id', gorevIds) as any
      for (const g of (data ?? []) as any[]) { gorevMap.set(g.id, g); gorevTipMap.set(g.id, 'Spesifik') }
    }
    if (canliIds.length) {
      // Önce aktif tablo, bulamazsa arşiv
      const { data: aktif } = await admin.from('canli_gorevler')
        .select('id,tanim,durum,tamamlanma_tarihi,islemi_yapan_id,tamamlayan_kullanici_id')
        .in('id', canliIds) as any
      const bulunan = new Set<string>()
      for (const g of (aktif ?? []) as any[]) { gorevMap.set(g.id, g); gorevTipMap.set(g.id, 'Frekansiyel'); bulunan.add(g.id) }
      const kalan = (canliIds as string[]).filter(id => !bulunan.has(id))
      if (kalan.length) {
        const { data: arsiv } = await admin.from('canli_gorevler_arsiv')
          .select('id,tanim,durum,tamamlanma_tarihi,islemi_yapan_id,tamamlayan_kullanici_id')
          .in('id', kalan) as any
        for (const g of (arsiv ?? []) as any[]) { gorevMap.set(g.id, g); gorevTipMap.set(g.id, 'Frekansiyel') }
      }
    }

    // ── 5. Madde cevapları ────────────────────────────────────────────────
    const baslikIds = (basliklari as any[]).map(b => b.id)
    const { data: cevaplarData } = await admin.from('checklist_sonuc_maddeleri')
      .select('sonuc_id,madde_id,secenek_degeri,aciklama,gorsel_url').in('sonuc_id', baslikIds) as any
    const cevapMap = new Map<string,Map<string,any>>()
    for (const c of (cevaplarData ?? []) as any[]) {
      if (!cevapMap.has(c.sonuc_id)) cevapMap.set(c.sonuc_id, new Map())
      cevapMap.get(c.sonuc_id)!.set(c.madde_id, c)
    }

    // ── 6. Kullanıcılar ───────────────────────────────────────────────────
    const allUserIds = [...new Set([
      ...(basliklari as any[]).map(b => b.kullanici_id).filter(Boolean),
      ...[...gorevMap.values()].flatMap(g => [g.tamamlayan_kullanici_id, g.islemi_yapan_id].filter(Boolean)),
    ])]
    const { data: usersData } = (allUserIds.length
      ? await admin.from('users').select('id,isim_soyisim').in('id', allUserIds)
      : { data: [] }) as any
    const userMap = new Map<string,string>(((usersData ?? []) as any[]).map(u => [u.id, u.isim_soyisim ?? '']))

    // ── 7. Satır oluştur — kaynak filtresi burada uygulanır ───────────────
    const rows: any[] = []
    for (const sb of (basliklari as any[])) {
      const gorevId = sb.gorev_id ?? sb.canli_gorev_id
      const g = gorevId ? gorevMap.get(gorevId) : null

      // Görev bulunamadıysa veya terminal durumda değilse atla
      if (!g || !TERMINAL.includes(g.durum)) continue

      // kaynak filtresi: tamamlanma_tarihi'ne göre rapor/arşiv ayrımı
      const tam = g.tamamlanma_tarihi
      if (kaynak === 'rapor' && tam && tam < sinir) continue   // 24 saatten eski → arşive ait
      if (kaynak === 'arsiv' && tam && tam >= sinir) continue  // son 24 saat → rapora ait

      const lokasyon = (loks as any[]).find(l => l.id === sb.lokasyon_id) ?? lokFullMap.get(sb.lokasyon_id)
      const sablonId = sb.sablon_id ?? lokasyon?.checklist_sablon_id
      const maddeler = sablonId ? (sablonMaddeMap.get(sablonId) ?? []) : []
      const cevaplar = cevapMap.get(sb.id) ?? new Map()
      const dolduruldu = maddeler.filter((m: any) => cevaplar.has(m.id)).length
      const basari = maddeler.length > 0 ? Math.round(dolduruldu / maddeler.length * 100) : 0

      const yapanId = sb.kullanici_id ?? g.tamamlayan_kullanici_id ?? g.islemi_yapan_id
      const yapan = yapanId ? (userMap.get(yapanId) ?? '—') : '—'

      if (tanimAra && !(g.tanim ?? '').toLowerCase().includes(tanimAra.toLowerCase())) continue
      if (yapanAra && !yapan.toLowerCase().includes(yapanAra.toLowerCase())) continue

      rows.push({
        sonuc_id:         sb.id,
        gorev_id:         gorevId,
        tanim:            g.tanim ?? '—',
        gorev_tipi:       gorevTipMap.get(gorevId) ?? '—',
        durum:            g.durum,
        lokasyon:         lokYolu(sb.lokasyon_id),
        yapan,
        kayit_tarihi:     fmt(sb.kayit_tarihi),
        tamamlanma:       fmt(g.tamamlanma_tarihi),
        kanal:            sb.kanal ?? 'WEB',
        ceklist_dolu:     true,
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

    const ozet = {
      toplam:     rows.length,
      dolduruldu: rows.length,
      basari:     rows.length > 0 ? Math.round(rows.reduce((s,r) => s+r.basari_pct, 0) / rows.length) : 0,
    }

    return NextResponse.json({ ok:true, rows, ozet,
      lokasyonlar: (loks as any[]).map(l => ({id:l.id,tanim:lokYolu(l.id)})),
      kullanicilar: ((usersData??[]) as any[]).map(u => ({id:u.id,isim_soyisim:u.isim_soyisim})) })
  } catch (err: any) {
    console.error('[ceklist-rapor]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
