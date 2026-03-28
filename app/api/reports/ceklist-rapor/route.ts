/**
 * GET /api/reports/ceklist-rapor
 *
 * checklist_sonuc_basliklari birincil kaynak — bu kayıtlar silinince liste güncellenir.
 * Tarih filtresi kayit_tarihi üzerinden çalışır (silme ile tutarlı).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

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
    const projeId   = sp.get('projeId')   ?? null
    const baslangic = sp.get('baslangic') ?? null
    const bitis     = sp.get('bitis')     ?? null
    const lokIdFil  = sp.get('lokasyonId') ?? null
    const tanimAra  = sp.get('tanim')     ?? null
    const yapanAra  = sp.get('yapan')     ?? null

    if (!firmaId) return NextResponse.json({ error: 'firmaId gerekli' }, { status: 400 })

    const admin = createAdminClient()

    // 1. Firmaya ait lokasyonlar
    let lokQ = admin.from('lokasyonlar')
      .select('id,tanim,parent_id,checklist_sablon_id')
      .eq('firma_id', firmaId)
    if (projeId)  lokQ = (lokQ as any).eq('proje_id', projeId)
    if (lokIdFil) lokQ = (lokQ as any).eq('id', lokIdFil)

    const { data: loks } = await lokQ
    if (!loks?.length) {
      return NextResponse.json({ ok: true, rows: [], ozet: { toplam: 0 }, lokasyonlar: [], kullanicilar: [] })
    }
    const lokIds = loks.map((l: any) => l.id)

    // Lokasyon yolu haritası
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

    // 2. Şablon maddeleri
    const sablonIds = [...new Set(loks.map((l: any) => l.checklist_sablon_id).filter(Boolean) as string[])]
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

    // 3. BİRİNCİL KAYNAK: checklist_sonuc_basliklari
    //    Tarih filtresi kayit_tarihi üzerinden — silme ile aynı mantık
    let sbQ = admin.from('checklist_sonuc_basliklari')
      .select('id,gorev_id,canli_gorev_id,lokasyon_id,sablon_id,kullanici_id,kanal,kayit_tarihi')
      .in('lokasyon_id', lokIds)
      .order('kayit_tarihi', { ascending: false })
    if (baslangic) sbQ = (sbQ as any).gte('kayit_tarihi', `${baslangic}T00:00:00`)
    if (bitis)     sbQ = (sbQ as any).lte('kayit_tarihi', `${bitis}T23:59:59.999`)

    const { data: basliklari, error: sbErr } = await sbQ
    if (sbErr) throw sbErr
    if (!basliklari?.length) {
      return NextResponse.json({
        ok: true, rows: [], ozet: { toplam: 0 },
        lokasyonlar: loks.map((l: any) => ({ id: l.id, tanim: lokYolu(l.id) })),
        kullanicilar: [],
      })
    }

    // 4. Madde cevapları
    const baslikIds = basliklari.map((b: any) => b.id)
    const { data: cevaplarData } = await admin
      .from('checklist_sonuc_maddeleri')
      .select('sonuc_id,madde_id,secenek_degeri,aciklama,gorsel_url')
      .in('sonuc_id', baslikIds)

    const cevapMap = new Map<string, Map<string, any>>()
    for (const c of cevaplarData ?? []) {
      if (!cevapMap.has(c.sonuc_id)) cevapMap.set(c.sonuc_id, new Map())
      cevapMap.get(c.sonuc_id)!.set(c.madde_id, c)
    }

    // 5. Görev metadata (tanim, durum, tamamlanma_tarihi)
    const gorevIds = [...new Set(basliklari.map((b: any) => b.gorev_id).filter(Boolean) as string[])]
    const canliIds = [...new Set(basliklari.map((b: any) => b.canli_gorev_id).filter(Boolean) as string[])]

    const gorevMap    = new Map<string, any>()
    const gorevTipMap = new Map<string, string>()

    if (gorevIds.length) {
      const { data } = await admin.from('gorevler')
        .select('id,tanim,durum,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id')
        .in('id', gorevIds)
      for (const g of data ?? []) { gorevMap.set(g.id, g); gorevTipMap.set(g.id, 'Spesifik') }
    }
    if (canliIds.length) {
      for (const tablo of ['canli_gorevler', 'canli_gorevler_arsiv'] as const) {
        const { data } = await admin.from(tablo)
          .select('id,tanim,durum,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id,tamamlayan_kullanici_id')
          .in('id', canliIds)
        for (const g of data ?? []) {
          if (!gorevMap.has(g.id)) { gorevMap.set(g.id, g); gorevTipMap.set(g.id, 'Frekansiyel') }
        }
      }
    }

    // 6. Kullanıcı adları
    const allUserIds = [...new Set([
      ...basliklari.map((b: any) => b.kullanici_id).filter(Boolean),
      ...[...gorevMap.values()].flatMap((g: any) =>
        [g.atanan_kullanici_id, g.tamamlayan_kullanici_id, g.islemi_yapan_id].filter(Boolean)
      ),
    ])]
    const { data: usersData } = allUserIds.length
      ? await admin.from('users').select('id,isim_soyisim').in('id', allUserIds)
      : { data: [] }
    const userMap = new Map<string, string>((usersData ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

    // 7. Satır oluştur — her checklist_sonuc_basliklari kaydı = 1 satır
    const rows: any[] = []
    for (const sb of basliklari) {
      const gorevId  = sb.gorev_id ?? sb.canli_gorev_id
      const g        = gorevId ? gorevMap.get(gorevId) : null
      const sablonId = sb.sablon_id ?? lokFullMap.get(sb.lokasyon_id)?.checklist_sablon_id
      const maddeler = sablonId ? (sablonMaddeMap.get(sablonId) ?? []) : []
      const cevaplar = cevapMap.get(sb.id) ?? new Map()

      const dolduruldu = maddeler.filter((m: any) => cevaplar.has(m.id)).length
      const basari     = maddeler.length > 0 ? Math.round(dolduruldu / maddeler.length * 100) : 0

      const yapanId = sb.kullanici_id ?? g?.tamamlayan_kullanici_id ?? g?.islemi_yapan_id
      const yapan   = yapanId ? (userMap.get(yapanId) ?? '—') : '—'

      if (tanimAra && !(g?.tanim ?? '').toLowerCase().includes(tanimAra.toLowerCase())) continue
      if (yapanAra && !yapan.toLowerCase().includes(yapanAra.toLowerCase())) continue

      rows.push({
        sonuc_id:         sb.id,
        gorev_id:         gorevId ?? null,
        tanim:            g?.tanim ?? '—',
        gorev_tipi:       gorevId ? (gorevTipMap.get(gorevId) ?? '—') : '—',
        durum:            g?.durum ?? '—',
        lokasyon:         lokYolu(sb.lokasyon_id),
        yapan,
        kayit_tarihi:     fmt(sb.kayit_tarihi),
        tamamlanma:       fmt(g?.tamamlanma_tarihi),
        kanal:            sb.kanal ?? 'WEB',
        madde_toplam:     maddeler.length,
        madde_dolduruldu: dolduruldu,
        basari_pct:       basari,
        maddeler: maddeler.map((m: any) => {
          const c = cevaplar.get(m.id)
          return {
            madde_id:   m.id,
            sira:       m.sira_no,
            madde:      m.baslik,
            zorunlu:    m.zorunlu_cevap !== false,
            secenek:    c?.secenek_degeri ?? null,
            not:        c?.aciklama       ?? null,
            gorsel_url: c?.gorsel_url     ?? null,
            dolduruldu: !!c,
          }
        }),
      })
    }

    return NextResponse.json({
      ok: true,
      rows,
      ozet: { toplam: rows.length },
      lokasyonlar: loks.map((l: any) => ({ id: l.id, tanim: lokYolu(l.id) })),
      kullanicilar: (usersData ?? []).map((u: any) => ({ id: u.id, isim_soyisim: u.isim_soyisim })),
    })
  } catch (err: any) {
    console.error('[ceklist-rapor]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
