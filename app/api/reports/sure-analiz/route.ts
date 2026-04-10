/**
 * GET /api/reports/sure-analiz
 * Frekansiyel (canli_gorevler + arsiv) ve Spesifik (gorevler) görevler için
 * kapsamlı süre analizi verisi döndürür.
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

function withinRange(v: string | null | undefined, from?: string | null, to?: string | null) {
  if (!v) return false
  const t = new Date(v).getTime()
  if (isNaN(t)) return false
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false
  if (to   && t > new Date(`${to}T23:59:59.999`).getTime()) return false
  return true
}

function fmtSure(sn: number | null | undefined): string {
  if (!sn || sn <= 0) return '—'
  const h = Math.floor(sn / 3600)
  const m = Math.floor((sn % 3600) / 60)
  const s = sn % 60
  if (h > 0) return `${h}s ${m}dk`
  if (m > 0) return `${m}dk ${s}sn`
  return `${s}sn`
}

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[idx]
}

function suреAnalizi(gorevler: any[]) {
  const tamamlananlar = gorevler.filter(g => g.durum === 'TAMAMLANDI' && g.tamamlanma_suresi_saniye > 0)
  const sureler = tamamlananlar.map(g => g.tamamlanma_suresi_saniye as number).sort((a, b) => a - b)

  const ort   = sureler.length > 0 ? Math.round(sureler.reduce((a, b) => a + b, 0) / sureler.length) : 0
  const min   = sureler[0] ?? 0
  const max   = sureler[sureler.length - 1] ?? 0
  const p50   = percentile(sureler, 50)
  const p75   = percentile(sureler, 75)
  const p90   = percentile(sureler, 90)
  const p95   = percentile(sureler, 95)

  // Bekleme süresi: olusturma_tarihi → baslatilma_tarihi veya tamamlanma_tarihi
  const beklemeList = tamamlananlar
    .map(g => {
      const baslangicRef = g.baslatilma_tarihi ?? g.tamamlanma_tarihi
      if (!baslangicRef || !g.olusturma_tarihi) return null
      const ms = new Date(baslangicRef).getTime() - new Date(g.olusturma_tarihi).getTime()
      return ms > 0 ? Math.round(ms / 1000) : null
    })
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)

  const ortBekleme = beklemeList.length > 0
    ? Math.round(beklemeList.reduce((a, b) => a + b, 0) / beklemeList.length)
    : 0

  return { ort, min, max, p50, p75, p90, p95, ortBekleme, tamamlananSayi: tamamlananlar.length, toplam: gorevler.length }
}

function gunlukTrend(gorevler: any[]): { tarih: string; ort_sure: number; adet: number }[] {
  const map: Record<string, number[]> = {}
  for (const g of gorevler) {
    if (g.durum !== 'TAMAMLANDI' || !g.tamamlanma_suresi_saniye || !g.tamamlanma_tarihi) continue
    const key = dayKey(g.tamamlanma_tarihi)
    if (!key) continue
    if (!map[key]) map[key] = []
    map[key].push(g.tamamlanma_suresi_saniye)
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tarih, vals]) => ({
      tarih,
      ort_sure: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      adet: vals.length,
    }))
}

function lokasyonAnalizi(
  gorevler: any[],
  lokMap: Map<string, string>,
  hedefMap: Map<string, number | null>,
): {
  lokasyon_id: string; lokasyon: string; ort_sure: number; min_sure: number; max_sure: number; adet: number
  hedef_sure: number | null; hedef_fark: number | null; hedef_fark_pct: number | null
}[] {
  const map: Record<string, number[]> = {}
  for (const g of gorevler) {
    if (g.durum !== 'TAMAMLANDI' || !g.tamamlanma_suresi_saniye || !g.lokasyon_id) continue
    const lid = g.lokasyon_id
    if (!map[lid]) map[lid] = []
    map[lid].push(g.tamamlanma_suresi_saniye)
  }
  return Object.entries(map)
    .map(([lid, vals]) => {
      const sorted = [...vals].sort((a, b) => a - b)
      const ort_sure = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      const hedef_dk = hedefMap.get(lid) ?? null
      const hedef_sure = hedef_dk != null ? hedef_dk * 60 : null
      const hedef_fark = hedef_sure != null ? ort_sure - hedef_sure : null
      const hedef_fark_pct = hedef_sure != null && hedef_sure > 0
        ? Math.round(((ort_sure - hedef_sure) / hedef_sure) * 100)
        : null
      return {
        lokasyon_id: lid,
        lokasyon: lokMap.get(lid) ?? '—',
        ort_sure,
        min_sure: sorted[0],
        max_sure: sorted[sorted.length - 1],
        adet: vals.length,
        hedef_sure,
        hedef_fark,
        hedef_fark_pct,
      }
    })
    .sort((a, b) => b.adet - a.adet)
}

function personelAnalizi(
  gorevler: any[],
  userMap: Map<string, string>,
  hedefMap: Map<string, number | null>,
): {
  personel: string; ort_sure: number; tamamlanan: number; en_hizli: number; en_yavas: number
  ort_hedef_sure: number | null; hedef_fark: number | null; hedef_fark_pct: number | null
}[] {
  const map: Record<string, { sureler: number[]; hedefler: number[] }> = {}
  for (const g of gorevler) {
    const uid = g.tamamlayan_kullanici_id ?? g.islemi_yapan_id ?? g.atanan_kullanici_id
    if (g.durum !== 'TAMAMLANDI' || !g.tamamlanma_suresi_saniye || !uid) continue
    if (!map[uid]) map[uid] = { sureler: [], hedefler: [] }
    map[uid].sureler.push(g.tamamlanma_suresi_saniye)
    const hdk = g.lokasyon_id ? hedefMap.get(g.lokasyon_id) : null
    if (hdk != null) map[uid].hedefler.push(hdk * 60)
  }
  return Object.entries(map)
    .map(([uid, { sureler, hedefler }]) => {
      const sorted = [...sureler].sort((a, b) => a - b)
      const ort_sure = Math.round(sureler.reduce((a, b) => a + b, 0) / sureler.length)
      const ort_hedef_sure = hedefler.length > 0
        ? Math.round(hedefler.reduce((a, b) => a + b, 0) / hedefler.length)
        : null
      const hedef_fark = ort_hedef_sure != null ? ort_sure - ort_hedef_sure : null
      const hedef_fark_pct = ort_hedef_sure != null && ort_hedef_sure > 0
        ? Math.round(((ort_sure - ort_hedef_sure) / ort_hedef_sure) * 100)
        : null
      return {
        personel: userMap.get(uid) ?? '—',
        ort_sure,
        tamamlanan: sureler.length,
        en_hizli: sorted[0],
        en_yavas: sorted[sorted.length - 1],
        ort_hedef_sure,
        hedef_fark,
        hedef_fark_pct,
      }
    })
    .sort((a, b) => b.tamamlanan - a.tamamlanan)
    .slice(0, 12)
}

function gorevAnalizi(
  gorevler: any[],
  lokMap: Map<string, string>,
  hedefMap: Map<string, number | null>,
): {
  tanim: string; lokasyon_id: string; lokasyon: string; adet: number
  ort_sure: number; min_sure: number; max_sure: number
  hedef_sure: number | null; hedef_fark: number | null; hedef_fark_pct: number | null
}[] {
  // tanim + lokasyon_id bazında grupla
  const map: Record<string, number[]> = {}
  const lokIdMap: Record<string, string> = {}
  for (const g of gorevler) {
    if (g.durum !== 'TAMAMLANDI' || !g.tamamlanma_suresi_saniye || !g.tanim) continue
    const key = `${g.tanim}|||${g.lokasyon_id ?? ''}`
    if (!map[key]) map[key] = []
    map[key].push(g.tamamlanma_suresi_saniye)
    if (g.lokasyon_id) lokIdMap[key] = g.lokasyon_id
  }
  return Object.entries(map)
    .map(([key, vals]) => {
      const [tanim] = key.split('|||')
      const lid = lokIdMap[key] ?? ''
      const sorted = [...vals].sort((a, b) => a - b)
      const ort_sure = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      const hdk = lid ? hedefMap.get(lid) ?? null : null
      const hedef_sure = hdk != null ? hdk * 60 : null
      const hedef_fark = hedef_sure != null ? ort_sure - hedef_sure : null
      const hedef_fark_pct = hedef_sure != null && hedef_sure > 0
        ? Math.round(((ort_sure - hedef_sure) / hedef_sure) * 100) : null
      return {
        tanim, lokasyon_id: lid, lokasyon: lid ? lokMap.get(lid) ?? '—' : '—',
        adet: vals.length, ort_sure, min_sure: sorted[0], max_sure: sorted[sorted.length - 1],
        hedef_sure, hedef_fark, hedef_fark_pct,
      }
    })
    .sort((a, b) => b.adet - a.adet)
}

function dagılımKovalari(gorevler: any[]): { aralik: string; adet: number }[] {
  const kovalar = [
    { label: '< 5 dk',    min: 0,      max: 300 },
    { label: '5-15 dk',   min: 300,    max: 900 },
    { label: '15-30 dk',  min: 900,    max: 1800 },
    { label: '30-60 dk',  min: 1800,   max: 3600 },
    { label: '1-2 sa',    min: 3600,   max: 7200 },
    { label: '2-4 sa',    min: 7200,   max: 14400 },
    { label: '4-8 sa',    min: 14400,  max: 28800 },
    { label: '> 8 sa',    min: 28800,  max: Infinity },
  ]
  const counts = kovalar.map(k => ({ aralik: k.label, adet: 0, min: k.min, max: k.max }))
  for (const g of gorevler) {
    if (g.durum !== 'TAMAMLANDI' || !g.tamamlanma_suresi_saniye) continue
    const s = g.tamamlanma_suresi_saniye
    const kova = counts.find(k => s >= k.min && s < k.max)
    if (kova) kova.adet++
  }
  return counts.map(({ aralik, adet }) => ({ aralik, adet }))
}

export async function GET(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase
      .from('users')
      .select('id,rol,firma_id,isim_soyisim')
      .eq('id', authUser.id)
      .single()
    if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin', 'musteri', 'tenant_user'].includes(me.rol)) {
      return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
    }

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const p = new URL(req.url).searchParams
    const firmaId   = isSA ? p.get('firmaId') : me.firma_id
    const projeId   = p.get('projeId')   ?? null
    const baslangic = p.get('baslangic') ?? null
    const bitis     = p.get('bitis')     ?? null

    if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    const admin = createAdminClient()

    // Tolerans oranı: proje override > firma default
    const { data: firma } = await admin.from('firmalar').select('gorev_suresi_hedef_orani').eq('id', firmaId).single()
    let hedefTolerans = firma?.gorev_suresi_hedef_orani ?? 10
    if (projeId) {
      const { data: proje } = await admin.from('projeler').select('gorev_suresi_hedef_orani').eq('id', projeId).single()
      if (proje?.gorev_suresi_hedef_orani != null) hedefTolerans = proje.gorev_suresi_hedef_orani
    }

    // Lokasyon ve kullanıcı map'leri
    let loksQ = admin.from('lokasyonlar').select('id,tanim,parent_id,hedef_sure_dakika').eq('firma_id', firmaId)
    if (projeId) loksQ = (loksQ as any).eq('proje_id', projeId)
    const { data: loks } = await loksQ
    const { data: users } = await admin.from('users').select('id,isim_soyisim').eq('firma_id', firmaId)

    // Üst > Alt > Alt-Alt tam yolu oluşturan yardımcı fonksiyon
    const lokNodeMap = new Map<string, { tanim: string; parent_id: string | null }>()
    for (const l of loks ?? []) lokNodeMap.set(l.id, { tanim: l.tanim ?? '', parent_id: l.parent_id ?? null })
    function lokFullPath(id: string): string {
      const parts: string[] = []
      let cur: string | null = id
      while (cur) {
        const node = lokNodeMap.get(cur)
        if (!node) break
        parts.unshift(node.tanim)
        cur = node.parent_id
      }
      return parts.join(' > ') || '—'
    }

    const lokMap   = new Map<string, string>((loks  ?? []).map((l: any) => [l.id, lokFullPath(l.id)]))
    const hedefMap = new Map<string, number | null>((loks ?? []).map((l: any) => [l.id, l.hedef_sure_dakika ?? null]))
    const userMap  = new Map<string, string>((users ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

    const SEL_FREQ  = 'id,firma_id,lokasyon_id,tanim,durum,olusturma_tarihi,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,atanan_kullanici_id,tamamlayan_kullanici_id,islemi_yapan_id,aktif_olma_tarihi'
    const SEL_SPEC  = 'id,firma_id,lokasyon_id,tanim,durum,olusturma_tarihi,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,atanan_kullanici_id,islemi_yapan_id'

    // ── Frekansiyel: aktif + arşiv ──────────────────────────────────────────
    let qFreqA = admin.from('canli_gorevler').select(SEL_FREQ).eq('firma_id', firmaId).limit(10000)
    let qFreqB = admin.from('canli_gorevler_arsiv').select(SEL_FREQ).eq('firma_id', firmaId).limit(10000)
    if (projeId) { qFreqA = (qFreqA as any).eq('proje_id', projeId); qFreqB = (qFreqB as any).eq('proje_id', projeId) }

    const [{ data: freqA }, { data: freqB }] = await Promise.all([qFreqA, qFreqB])
    const freqMap = new Map<string, any>()
    for (const r of (freqB ?? [])) freqMap.set(r.id, r)
    for (const r of (freqA ?? [])) freqMap.set(r.id, r)
    const freqTum = Array.from(freqMap.values()).filter((g: any) =>
      !baslangic && !bitis ? true : withinRange(g.tamamlanma_tarihi ?? g.olusturma_tarihi, baslangic, bitis)
    )

    // ── Spesifik görevler ───────────────────────────────────────────────────
    let qSpec = admin.from('gorevler').select(SEL_SPEC).eq('firma_id', firmaId)
    if (projeId) qSpec = (qSpec as any).eq('proje_id', projeId)
    const { data: specRaw } = await qSpec
    const specTum = (specRaw ?? []).filter((g: any) =>
      !baslangic && !bitis ? true : withinRange(g.tamamlanma_tarihi ?? g.olusturma_tarihi, baslangic, bitis)
    )

    // ── Analizler ────────────────────────────────────────────────────────────
    const freqAnaliz = suреAnalizi(freqTum)
    const specAnaliz = suреAnalizi(specTum)

    return NextResponse.json({
      ok: true,
      frekansiyel: {
        analiz:      freqAnaliz,
        gunlukTrend: gunlukTrend(freqTum),
        lokasyon:    lokasyonAnalizi(freqTum, lokMap, hedefMap),
        personel:    personelAnalizi(freqTum, userMap, hedefMap),
        gorev:       gorevAnalizi(freqTum, lokMap, hedefMap),
        dagilim:     dagılımKovalari(freqTum),
      },
      spesifik: {
        analiz:      specAnaliz,
        gunlukTrend: gunlukTrend(specTum),
        lokasyon:    lokasyonAnalizi(specTum, lokMap, hedefMap),
        personel:    personelAnalizi(specTum, userMap, hedefMap),
        gorev:       gorevAnalizi(specTum, lokMap, hedefMap),
        dagilim:     dagılımKovalari(specTum),
      },
      hedefTolerans,
      meta: {
        lokasyonlar: (loks  ?? []).map((l: any) => ({ id: l.id, tanim: l.tanim, parent_id: l.parent_id ?? null })),
        kullanicilar: (users ?? []).map((u: any) => ({ id: u.id, isim_soyisim: u.isim_soyisim })),
      },
    })
  } catch (err: any) {
    console.error('[sure-analiz]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
