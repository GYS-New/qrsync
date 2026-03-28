/**
 * GET /api/reports/ceklist-rapor
 *
 * kaynak parametresi:
 *   rapor  → tamamlanma_tarihi son 24 saat içinde (Rapor Merkezi default)
 *   arsiv  → tamamlanma_tarihi 24 saatten eski    (Arşiv tablosu)
 *   hepsi  → zaman kısıtı yok                    (Rapor Merkezi "Tümü" filtresi)
 *
 * Diğer filtreler: baslangic, bitis (YYYY-MM-DD), lokasyonId, tanim, yapan
 * Tarih filtresi kayit_tarihi üzerinden, kaynak filtresi tamamlanma_tarihi üzerinden.
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

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const sp   = new URL(req.url).searchParams
    const firmaId   = isSA ? sp.get('firmaId') : me.firma_id
    const projeId   = sp.get('projeId')    ?? null
    const baslangic = sp.get('baslangic')  ?? null  // çeklist kayit_tarihi filtresi
    const bitis     = sp.get('bitis')      ?? null
    const lokIdFil  = sp.get('lokasyonId') ?? null
    const tanimAra  = sp.get('tanim')      ?? null
    const yapanAra  = sp.get('yapan')      ?? null
    const kaynak    = sp.get('kaynak')     ?? 'rapor' // rapor | arsiv | hepsi

    if (!firmaId) return NextResponse.json({ error: 'firmaId gerekli' }, { status: 400 })

    const admin  = createAdminClient()
    const sinir  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // ── 1. Lokasyonlar ────────────────────────────────────────────────────
    let lokQ = admin.from('lokasyonlar').select('id,tanim,parent_id,checklist_sablon_id').eq('firma_id', firmaId)
    if (projeId)  lokQ = (lokQ as any).eq('proje_id', projeId)
    if (lokIdFil) lokQ = (lokQ as any).eq('id', lokIdFil)
    const { data: loks } = await lokQ
    if (!loks?.length)
      return NextResponse.json({ ok:true, rows:[], ozet:{toplam:0,dolduruldu:0,basari:0}, lokasyonlar:[], kullanicilar:[] })

    const lokIds = loks.map((l: any) => l.id)
    const lokFullMap = new Map<string,any>(loks.map((l: any) => [l.id, l]))
    // parent zinciri
    for (const ids of [
      [...new Set(loks.map((l: any) => l.parent_id).filter(Boolean) as string[])].filter((id: string) => !lokFullMap.has(id)),
    ]) {
      if (ids.length) {
        const { data } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', ids)
        for (const l of data ?? []) lokFullMap.set(l.id, l)
      }
    }
    const pIds2 = [...new Set([...lokFullMap.values()].map((l: any) => l.parent_id).filter(Boolean) as string[])].filter((id: string) => !lokFullMap.has(id))
    if (pIds2.length) {
      const { data: p2 } = await admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', pIds2)
      for (const l of p2 ?? []) lokFullMap.set(l.id, l)
    }
    function lokYolu(id: string): string {
      const parts: string[] = []; let cur: string | null = id
      while (cur) { const l = lokFullMap.get(cur); if (!l) break; parts.unshift(l.tanim); cur = l.parent_id ?? null }
      return parts.join(' / ')
    }

    // ── 2. Şablon maddeleri ───────────────────────────────────────────────
    const sablonIds = [...new Set(loks.map((l: any) => l.checklist_sablon_id).filter(Boolean) as string[])]
    const { data: maddelerData } = sablonIds.length
      ? await admin.from('checklist_sablon_maddeleri').select('id,sablon_id,sira_no,baslik,zorunlu_cevap').in('sablon_id', sablonIds).order('sira_no')
      : { data: [] }
    const sablonMaddeMap = new Map<string,any[]>()
    for (const m of maddelerData ?? []) {
      const arr = sablonMaddeMap.get(m.sablon_id) ?? []; arr.push(m); sablonMaddeMap.set(m.sablon_id, arr)
    }

    // ── 3. Görev ID'lerini kaynak'a göre topla ────────────────────────────
    // gorev_id → { row, tip }
    const gorevMap    = new Map<string,any>()
    const gorevTipMap = new Map<string,string>()

    async function fetchGorevler(tablo: string, tip: string) {
      let q = admin.from(tablo)
        .select('id,tanim,durum,tamamlanma_tarihi,islemi_yapan_id' + (tablo !== 'gorevler' ? ',tamamlayan_kullanici_id' : ''))
        .eq('firma_id', firmaId)
        .in('lokasyon_id', lokIds)
        .in('durum', TERMINAL)
      if (projeId) q = (q as any).eq('proje_id', projeId)
      if (kaynak === 'rapor')  q = (q as any).gte('tamamlanma_tarihi', sinir)
      if (kaynak === 'arsiv')  q = (q as any).lt('tamamlanma_tarihi', sinir)
      const { data } = await (q as any)
      for (const g of (data as any[]) ?? []) {
        if (!gorevMap.has(g.id)) { gorevMap.set(g.id, g); gorevTipMap.set(g.id, tip) }
      }
    }

    // Frekansiyel: rapor → aktif tablo; arsiv → arşiv tablo; hepsi → her ikisi
    if (kaynak === 'rapor') {
      await fetchGorevler('canli_gorevler', 'Frekansiyel')
    } else if (kaynak === 'arsiv') {
      await fetchGorevler('canli_gorevler_arsiv', 'Frekansiyel')
      // Henüz fiziksel olarak arşivlenmemiş olabilecek eski kayıtlar için aktif tabloyu da tara
      await fetchGorevler('canli_gorevler', 'Frekansiyel')
    } else {
      await fetchGorevler('canli_gorevler', 'Frekansiyel')
      await fetchGorevler('canli_gorevler_arsiv', 'Frekansiyel')
    }
    // Spesifik: tek tablo
    await fetchGorevler('gorevler', 'Spesifik')

    if (!gorevMap.size)
      return NextResponse.json({ ok:true, rows:[], ozet:{toplam:0,dolduruldu:0,basari:0}, lokasyonlar: loks.map((l: any) => ({id:l.id,tanim:lokYolu(l.id)})), kullanicilar:[] })

    // ── 4. Çeklist sonuç başlıkları ───────────────────────────────────────
    const gorevIds = [...gorevMap.keys()]
    const orFilter = gorevIds.map((id: string) => `gorev_id.eq.${id},canli_gorev_id.eq.${id}`).join(',')
    let sbQ = admin.from('checklist_sonuc_basliklari')
      .select('id,gorev_id,canli_gorev_id,lokasyon_id,sablon_id,kullanici_id,kanal,kayit_tarihi')
      .or(orFilter)
      .order('kayit_tarihi', { ascending: false })
    if (baslangic) sbQ = (sbQ as any).gte('kayit_tarihi', `${baslangic}T00:00:00`)
    if (bitis)     sbQ = (sbQ as any).lte('kayit_tarihi', `${bitis}T23:59:59.999`)
    const { data: basliklari, error: sbErr } = await sbQ
    if (sbErr) throw sbErr

    // gorev başına en son çeklist kaydı
    const sbMap = new Map<string,any>()
    for (const sb of basliklari ?? []) {
      const gid = sb.gorev_id ?? sb.canli_gorev_id
      if (gid && !sbMap.has(gid)) sbMap.set(gid, sb)
    }

    // ── 5. Madde cevapları ────────────────────────────────────────────────
    const sonucIds = [...sbMap.values()].map((sb: any) => sb.id)
    const { data: cevaplarData } = sonucIds.length
      ? await admin.from('checklist_sonuc_maddeleri').select('sonuc_id,madde_id,secenek_degeri,aciklama,gorsel_url').in('sonuc_id', sonucIds)
      : { data: [] }
    const cevapMap = new Map<string,Map<string,any>>()
    for (const c of cevaplarData ?? []) {
      if (!cevapMap.has(c.sonuc_id)) cevapMap.set(c.sonuc_id, new Map())
      cevapMap.get(c.sonuc_id)!.set(c.madde_id, c)
    }

    // ── 6. Kullanıcılar ───────────────────────────────────────────────────
    const allUserIds = [...new Set([
      ...[...sbMap.values()].map((sb: any) => sb.kullanici_id).filter(Boolean),
      ...[...gorevMap.values()].flatMap((g: any) => [g.tamamlayan_kullanici_id, g.islemi_yapan_id].filter(Boolean)),
    ])]
    const { data: usersData } = allUserIds.length
      ? await admin.from('users').select('id,isim_soyisim').in('id', allUserIds)
      : { data: [] }
    const userMap = new Map<string,string>((usersData ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

    // ── 7. Satırları oluştur ──────────────────────────────────────────────
    const rows: any[] = []
    for (const [gorevId, g] of gorevMap) {
      const sb       = sbMap.get(gorevId)
      // Çeklist kaydı yoksa bu görevi atlama — çeklist doldurulmamış
      if (!sb) continue

      const lokasyon  = loks.find((l: any) => l.id === g.lokasyon_id)
      if (!lokasyon) continue

      const sablonId = sb.sablon_id ?? lokasyon.checklist_sablon_id
      const maddeler = sablonId ? (sablonMaddeMap.get(sablonId) ?? []) : []
      const cevaplar = cevapMap.get(sb.id) ?? new Map()
      const dolduruldu = maddeler.filter((m: any) => cevaplar.has(m.id)).length
      const basari     = maddeler.length > 0 ? Math.round(dolduruldu / maddeler.length * 100) : 0

      const yapanId = sb.kullanici_id ?? g.tamamlayan_kullanici_id ?? g.islemi_yapan_id
      const yapan   = yapanId ? (userMap.get(yapanId) ?? '—') : '—'

      if (tanimAra && !(g.tanim ?? '').toLowerCase().includes(tanimAra.toLowerCase())) continue
      if (yapanAra && !yapan.toLowerCase().includes(yapanAra.toLowerCase())) continue

      rows.push({
        sonuc_id:         sb.id,
        gorev_id:         gorevId,
        tanim:            g.tanim ?? '—',
        gorev_tipi:       gorevTipMap.get(gorevId) ?? '—',
        durum:            g.durum,
        lokasyon:         lokYolu(g.lokasyon_id),
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
          return { madde_id: m.id, sira: m.sira_no, madde: m.baslik, zorunlu: m.zorunlu_cevap !== false,
            secenek: c?.secenek_degeri ?? null, not: c?.aciklama ?? null, gorsel_url: c?.gorsel_url ?? null, dolduruldu: !!c }
        }),
      })
    }

    // tamamlanma_tarihi'ne göre sırala (en yeni önce)
    rows.sort((a, b) => {
      const ga = gorevMap.get(a.gorev_id); const gb = gorevMap.get(b.gorev_id)
      return new Date(gb?.tamamlanma_tarihi ?? 0).getTime() - new Date(ga?.tamamlanma_tarihi ?? 0).getTime()
    })

    const ozet = {
      toplam:     rows.length,
      dolduruldu: rows.length,
      basari:     rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.basari_pct, 0) / rows.length) : 0,
    }

    return NextResponse.json({ ok:true, rows, ozet, lokasyonlar: loks.map((l: any) => ({id:l.id,tanim:lokYolu(l.id)})), kullanicilar: (usersData ?? []).map((u: any) => ({id:u.id,isim_soyisim:u.isim_soyisim})) })
  } catch (err: any) {
    console.error('[ceklist-rapor]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
