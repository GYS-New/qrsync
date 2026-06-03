import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'
import { fetchAll } from '@/lib/supabase/fetchAll'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SAYFA_KODU = 'personel-degerlendirme-raporlari'

/**
 * GET /api/raporlar/personel-degerlendirme
 *
 * Query params:
 *   firma_id        — zorunlu (TA/U için kendi firma_id'si ile eşleşmeli)
 *   proje_id        — opsiyonel
 *   tarih_baslangic — ISO date (YYYY-MM-DD), default: 30 gün önce  (TR günü)
 *   tarih_bitis     — ISO date, default: bugün                    (TR günü)
 *   ust_lokasyon_id — opsiyonel filtre (yalnızca o üst lokasyonda görev yapanlar)
 *   personel_id     — opsiyonel filtre (tek personel)
 *   vardiya_no      — opsiyonel (1..N) — sadece o vardiyada tamamlanan/iptal edilen
 *
 * Tarih aralığında personel başına tamamlanan, iptal edilen görev sayısı,
 * ortalama tamamlanma süresi, cihaz eşleşme ve aktiflik durumu döner.
 *
 * NOT: Tarih penceresi TR (+03:00) gün sınırlarına göre kurulur. TAMAMLANDI
 *      kayıtları `tamamlanma_tarihi`, IPTAL kayıtları `iptal_tarihi` üzerinden
 *      süzülür. Aksi durumda gece vardiyası tamamlamaları (TR 00:00–03:00) eksik
 *      sayılırdı.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (!isSA) {
    const gorebilir = await sayfaGorebilirMi(me.rol, SAYFA_KODU, me.firma_id ?? null)
    if (!gorebilir) return NextResponse.json({ ok: false, error: 'Yetki yok' }, { status: 403 })
  }

  const p = req.nextUrl.searchParams
  const firmaIdParam = p.get('firma_id')
  const firmaId = isSA ? firmaIdParam : me.firma_id
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!isSA && firmaIdParam && firmaIdParam !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }

  // Proje scope: U/M için kendi proje_id'sine zorla
  let projeId = p.get('proje_id') || null
  if (me.rol === 'tenant_user' || me.rol === 'musteri') {
    projeId = (me as any).proje_id ?? null
  }

  const ustLokFilter = p.get('ust_lokasyon_id') || null
  const personelFilter = p.get('personel_id') || null
  const vardiyaNoParam = p.get('vardiya_no')
  const vardiyaNoFilter = vardiyaNoParam ? Number(vardiyaNoParam) : null

  // ── Tarih aralığı (TR günü; +03:00 sabit, TR'de DST yok) ───────────────────
  function trBugunISO(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
  }
  function trGunOnceISO(g: number): string {
    const d = new Date(Date.now() - g * 24 * 60 * 60 * 1000)
    return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
  }
  const tarihBaslangic = p.get('tarih_baslangic') || trGunOnceISO(30)
  const tarihBitis = p.get('tarih_bitis') || trBugunISO()
  // TR yerel gün sınırları (UTC ISO'ya çevrilmiş)
  const tarihBaslangicIso = new Date(`${tarihBaslangic}T00:00:00+03:00`).toISOString()
  const tarihBitisIso = new Date(`${tarihBitis}T23:59:59.999+03:00`).toISOString()

  const admin = createAdminClient()

  // ── 0. U/M için lokasyon scope kontrolü ────────────────────────────────────
  let yetkiliUstLokIds: string[] | null = null  // null = sınırsız
  if (me.rol === 'tenant_user' || me.rol === 'musteri') {
    const { data: ylk } = await admin
      .from('kullanici_lokasyon_yetkileri')
      .select('ust_lokasyon_id')
      .eq('user_id', me.id)
    const ids = (ylk ?? []).map((r: any) => r.ust_lokasyon_id).filter(Boolean) as string[]
    if (ids.length > 0) yetkiliUstLokIds = ids
  }

  if (yetkiliUstLokIds && ustLokFilter && !yetkiliUstLokIds.includes(ustLokFilter)) {
    return NextResponse.json({
      ok: true, data: [],
      meta: {
        tarih_baslangic: tarihBaslangic, tarih_bitis: tarihBitis,
        ust_lokasyonlar: [], personeller: [], vardiyalar: [],
      },
    })
  }

  // ── 1. Personeller ─────────────────────────────────────────────────────────
  let userQ = admin
    .from('users')
    .select('id, isim_soyisim, aktif, rol, ust_lokasyon_id')
    .eq('firma_id', firmaId)
    .in('rol', ['tenant_user', 'musteri'])
  if (projeId) userQ = (userQ as any).eq('proje_id', projeId)
  if (yetkiliUstLokIds) userQ = (userQ as any).in('ust_lokasyon_id', yetkiliUstLokIds)
  const { data: personeller } = await userQ.order('isim_soyisim', { ascending: true })

  const personelIds = (personeller ?? []).map((u: any) => u.id)

  // ── 2. Firma vardiya ayarları ──────────────────────────────────────────────
  const { data: firmaRow } = await admin
    .from('firmalar')
    .select('vardiya_sayisi, vardiya_saatleri, tum_vardiya_ayarlari')
    .eq('id', firmaId)
    .single()
  const vardiyaSayisi = (firmaRow as any)?.vardiya_sayisi ?? 0
  const tumAyarlar = (firmaRow as any)?.tum_vardiya_ayarlari ?? {}
  const vardiyaList: { no: number; baslangic: string; bitis: string }[] = (() => {
    const key = String(vardiyaSayisi)
    const raw = (tumAyarlar?.[key] ?? (firmaRow as any)?.vardiya_saatleri ?? []) as any[]
    return raw
      .filter(v => v && v.baslangic && v.bitis)
      .map((v: any) => ({ no: Number(v.no), baslangic: String(v.baslangic), bitis: String(v.bitis) }))
  })()

  if (personelIds.length === 0) {
    return NextResponse.json({
      ok: true, data: [],
      meta: {
        tarih_baslangic: tarihBaslangic, tarih_bitis: tarihBitis,
        ust_lokasyonlar: [], personeller: [], vardiyalar: vardiyaList,
      },
    })
  }

  // ── 3. Üst lokasyonlar (root) ──────────────────────────────────────────────
  let ustLokQ = admin
    .from('lokasyonlar')
    .select('id, tanim')
    .eq('firma_id', firmaId)
    .is('parent_id', null)
  if (yetkiliUstLokIds) ustLokQ = (ustLokQ as any).in('id', yetkiliUstLokIds)
  const { data: ustLokRows } = await ustLokQ.order('tanim', { ascending: true })

  const lokAdMap = new Map<string, string>()
  for (const l of ustLokRows ?? []) lokAdMap.set((l as any).id, (l as any).tanim)
  const ustLokasyonlar = (ustLokRows ?? []).map((l: any) => ({ id: l.id, tanim: l.tanim }))

  // ── 4. Görevler ────────────────────────────────────────────────────────────
  // TAMAMLANAN: durum=TAMAMLANDI + vardiya_gunu pencere içinde
  // İPTAL:      durum=IPTAL + vardiya_gunu pencere içinde
  // NOT: fetchAll() ile pagination — Supabase PostgREST gateway max-rows=1000
  // server-side sınır var. .limit(200000) yazsak bile gateway 1000'de kesiyor.
  // Büyük firmaların aylık arşivinde 10000+ satır olabilir (örn ATALIAN 30 gün
  // arşiv: 10856 satır). fetchAll 1000'er sayfa çekip birleştirir.
  const SELECT_TAM = 'tamamlayan_kullanici_id, durum, tamamlanma_suresi_saniye, tamamlanma_tarihi'
  const SELECT_IPT = 'iptal_eden_id, durum, iptal_tarihi'

  const [liveTam, arsivTam, liveIpt, arsivIpt] = await Promise.all([
    fetchAll(() => {
      let q: any = admin
        .from('canli_gorevler')
        .select(SELECT_TAM)
        .eq('firma_id', firmaId)
        .eq('durum', 'TAMAMLANDI')
        .gte('vardiya_gunu', tarihBaslangic)
        .lte('vardiya_gunu', tarihBitis)
      if (projeId) q = q.eq('proje_id', projeId)
      return q
    }),
    fetchAll(() => {
      let q: any = admin
        .from('canli_gorevler_arsiv')
        .select(SELECT_TAM)
        .eq('firma_id', firmaId)
        .eq('durum', 'TAMAMLANDI')
        .gte('vardiya_gunu', tarihBaslangic)
        .lte('vardiya_gunu', tarihBitis)
      if (projeId) q = q.eq('proje_id', projeId)
      return q
    }),
    fetchAll(() => {
      let q: any = admin
        .from('canli_gorevler')
        .select(SELECT_IPT)
        .eq('firma_id', firmaId)
        .eq('durum', 'IPTAL')
        .gte('vardiya_gunu', tarihBaslangic)
        .lte('vardiya_gunu', tarihBitis)
      if (projeId) q = q.eq('proje_id', projeId)
      return q
    }),
    fetchAll(() => {
      let q: any = admin
        .from('canli_gorevler_arsiv')
        .select(SELECT_IPT)
        .eq('firma_id', firmaId)
        .eq('durum', 'IPTAL')
        .gte('vardiya_gunu', tarihBaslangic)
        .lte('vardiya_gunu', tarihBitis)
      if (projeId) q = q.eq('proje_id', projeId)
      return q
    }),
  ])

  const tamamTasks = [...liveTam, ...arsivTam]
  const iptalTasks = [...liveIpt, ...arsivIpt]

  // ── 5. Cihaz eşleşme ───────────────────────────────────────────────────────
  const { data: deviceRows } = await admin
    .from('device_tokens')
    .select('user_id')
    .in('user_id', personelIds)
    .eq('aktif', true)
    .not('fcm_token', 'is', null)
  const eslesenSet = new Set((deviceRows ?? []).map((r: any) => r.user_id))

  // ── 6. Vardiya yardımcıları ────────────────────────────────────────────────
  // TR-saat (dakika cinsinden, gün-içi: 0..1439)
  function trDakika(iso: string | null | undefined): number | null {
    if (!iso) return null
    const hhmm = new Date(iso).toLocaleTimeString('en-GB', {
      timeZone: 'Europe/Istanbul', hour12: false, hour: '2-digit', minute: '2-digit',
    })
    const [h, m] = hhmm.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    return h * 60 + m
  }
  function trDateStr(iso: string | null | undefined): string | null {
    if (!iso) return null
    try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }) }
    catch { return null }
  }

  // Seçili vardiyanın TR saat aralığı (sarkan vardiya desteği)
  // Dönüş: [{ baslaMin, bitMin }] — bitMin > 1440 ise sarkan, [bas..1440) ∪ [0..bit-1440)
  type Aralik = { bas: number; bit: number }  // dakika (bit > 1440 ise sarkan)
  const seciliVardiyaAralik: Aralik | null = (() => {
    if (!vardiyaNoFilter) return null
    const v = vardiyaList.find(x => x.no === vardiyaNoFilter)
    if (!v) return null
    const [bh, bm] = v.baslangic.split(':').map(Number)
    const [eh, em] = v.bitis.split(':').map(Number)
    if (![bh, bm, eh, em].every(Number.isFinite)) return null
    const bas = bh * 60 + bm
    let bit = eh * 60 + em
    if (bit === 0 && bas !== 0) bit = 24 * 60          // "00:00" bitiş → ertesi 24:00
    if (bit <= bas && bit !== 24 * 60) bit += 24 * 60  // sarkan
    return { bas, bit }
  })()

  function vardiyaIcinde(iso: string | null | undefined): boolean {
    if (!seciliVardiyaAralik) return true
    const dk = trDakika(iso)
    if (dk == null) return false
    const { bas, bit } = seciliVardiyaAralik
    if (bit <= 24 * 60) return dk >= bas && dk < bit
    // Sarkan: dk ∈ [bas, 1440) ∪ [0, bit-1440)
    return dk >= bas || dk < (bit - 24 * 60)
  }

  // ── 7. Personel başına agregasyon ──────────────────────────────────────────
  type Agg = {
    tamamlandi: number
    iptal: number
    sureToplam: number
    sureSayi: number
    aktifGunler: Set<string>
  }
  const aggMap = new Map<string, Agg>()
  for (const pid of personelIds) {
    aggMap.set(pid, { tamamlandi: 0, iptal: 0, sureToplam: 0, sureSayi: 0, aktifGunler: new Set() })
  }

  for (const t of tamamTasks as any[]) {
    const uid = t.tamamlayan_kullanici_id as string | null
    if (!uid || !aggMap.has(uid)) continue
    if (!vardiyaIcinde(t.tamamlanma_tarihi)) continue
    const a = aggMap.get(uid)!
    a.tamamlandi++
    if (typeof t.tamamlanma_suresi_saniye === 'number' && t.tamamlanma_suresi_saniye > 0) {
      a.sureToplam += t.tamamlanma_suresi_saniye
      a.sureSayi++
    }
    const gun = trDateStr(t.tamamlanma_tarihi)
    if (gun) a.aktifGunler.add(gun)
  }

  for (const t of iptalTasks as any[]) {
    const uid = t.iptal_eden_id as string | null
    if (!uid || !aggMap.has(uid)) continue
    if (!vardiyaIcinde(t.iptal_tarihi)) continue
    const a = aggMap.get(uid)!
    a.iptal++
  }

  // Başarı kategori — günlük ortalama tamamlama süresine göre
  function basariKategoriBul(gunlukOrtSn: number | null): string | null {
    if (gunlukOrtSn == null) return null
    if (gunlukOrtSn >= 21600) return 'BAŞARILI'
    if (gunlukOrtSn >= 10800) return 'NORMAL'
    if (gunlukOrtSn >= 3600)  return 'YETERSİZ'
    return 'BAŞARISIZ'
  }

  // ── 8. Sonuç satırları ─────────────────────────────────────────────────────
  let rows = (personeller ?? []).map((u: any) => {
    const a = aggMap.get(u.id)!
    const ustLokId = u.ust_lokasyon_id ?? null
    const aktifGunSayisi = a.aktifGunler.size
    const gunlukOrtSn = aktifGunSayisi > 0 ? Math.round(a.sureToplam / aktifGunSayisi) : null
    return {
      personel_id: u.id,
      isim_soyisim: u.isim_soyisim,
      aktif: u.aktif === true,
      cihaz_eslesti: eslesenSet.has(u.id),
      ust_lokasyon_id: ustLokId,
      ust_lokasyon_adi: ustLokId ? lokAdMap.get(ustLokId) ?? null : null,
      tamamlandi_sayi: a.tamamlandi,
      iptal_sayi: a.iptal,
      ortalama_sure_saniye: a.sureSayi > 0 ? Math.round(a.sureToplam / a.sureSayi) : null,
      aktif_gun_sayisi: aktifGunSayisi,
      gunluk_ortalama_saniye: gunlukOrtSn,
      basari_kategori: basariKategoriBul(gunlukOrtSn),
    }
  })

  if (ustLokFilter) rows = rows.filter(r => r.ust_lokasyon_id === ustLokFilter)
  if (personelFilter) rows = rows.filter(r => r.personel_id === personelFilter)

  return NextResponse.json({
    ok: true,
    data: rows,
    meta: {
      tarih_baslangic: tarihBaslangic,
      tarih_bitis: tarihBitis,
      ust_lokasyonlar: ustLokasyonlar,
      personeller: (personeller ?? []).map((u: any) => ({ id: u.id, isim_soyisim: u.isim_soyisim, ust_lokasyon_id: u.ust_lokasyon_id ?? null })),
      vardiyalar: vardiyaList,
    },
  })
}
