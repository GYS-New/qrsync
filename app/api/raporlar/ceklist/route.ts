/**
 * GET /api/raporlar/ceklist
 *
 * Çeklist sonuç başlıklarını listeler.
 * Yalnızca TAMAMLANDI veya ZAMANINDA_YAPILAMAYAN durumundaki görevlere ait kayıtlar döner.
 *
 * Görünüm (cikti):
 *   rapor    — Raporlar > Çeklist: son 24 saat içinde durumu tamamlanan (durum_degisim_tarihi) kayıtlar
 *   arsiv    — Arşiv > Çeklist sekmesi: 24 saati aşmış kayıtlar
 *   birlesik — Tarih vb. filtre ile tablo + arşiv birleşik; segment alanı Tablo / Arşiv
 *
 * Query params:
 *   cikti        rapor | arsiv | birlesik (önerilen)
 *   arsiv        geriye dönük: "false"→rapor, "true"→arsiv, yok→birlesik
 *   firma_id     (SA zorunlu, TA/U kendi firması)
 *   proje_id     (isteğe bağlı)
 *   baslangic    (ISO tarih, checklist kayıt tarihi — isteğe bağlı)
 *   bitis        (ISO tarih)
 *
 * Dönen kayıt:
 *   id, kayit_tarihi, kanal, gorev_id, gorev_tanim, gorev_durum,
 *   tamamlanma_tarihi, arsiv_tarihi, durum_degisim_tarihi,
 *   lokasyon_tanim, sablon_baslik, kullanici_isim,
 *   doldurulan_madde, toplam_madde,
 *   kaynak: canli | arsiv | spesifik (fiziksel tablo)
 *   segment?: tablo | arsiv (yalnızca cikti=birlesik)
 *   gorev_task_type: canli_gorevler | gorevler (modal için)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sayfaGorebilirMi, sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'

type MeCeklist = {
  id: string
  rol: string
  firma_id: string | null
  proje_id: string | null
  isSA: boolean
  isTA: boolean
  isU: boolean
}

async function yetkiKontrol(supabase: any): Promise<{ ok: true; me: MeCeklist } | { ok: false; me: null; status: number }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, me: null, status: 401 }
  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', user.id).single()
  if (!me) return { ok: false, me: null, status: 403 }
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  const isU  = me.rol === 'tenant_user' || me.rol === 'musteri'
  if (!isSA && !isTA && !isU) return { ok: false, me: null, status: 403 }

  if (isU) {
    const okPage = await sayfaGorebilirMi(me.rol, 'ceklist-raporlari', me.firma_id ?? null)
    if (!okPage) return { ok: false, me: null, status: 403 }
  }

  return {
    ok: true,
    me: {
      ...me,
      isSA,
      isTA,
      isU,
    } as MeCeklist,
  }
}

const GECERLI_DURUMLAR = ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN']

const MS24H = 24 * 60 * 60 * 1000

function refMs(
  durumDegisim: string | null | undefined,
  tamamlanma: string | null | undefined,
  kayit: string | null | undefined,
): number {
  const t = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0)
  return Math.max(t(durumDegisim), t(tamamlanma), t(kayit))
}

type GorevRow = {
  id: string
  tanim: string | null
  durum: string
  tamamlanma_tarihi: string | null
  arsiv_tarihi?: string | null
  lokasyon_id?: string | null
  durum_degisim_tarihi: string | null
  dbKaynak: 'canli' | 'arsiv' | 'spesifik'
}

async function kayitlarGetir(
  admin: any,
  firmaId: string,
  projeId: string | null,
  baslangic: string | null,
  bitis: string | null,
  cikti: 'rapor' | 'arsiv' | 'birlesik',
  yetkiliLokIds: string[] | null = null,
): Promise<any[]> {
  // 1. Firmaya ait lokasyonlar
  // Proje seçiliyken yalnızca proje_id = X demek, lokasyon kaydında proje_id NULL/yanlış
  // kalan (özellikle spesifik görev lokasyonları) çeklist raporuna hiç düşmez.
  // Çözüm: seçili projeye bağlı lokasyonlar + projesi atanmamış lokasyonlar;
  // ayrıca bu firmada bu projeye bağlı spesifik görevlerin lokasyon_id'lerini ekle.
  // Tüm firma lokasyonlarını çek (parent_id dahil — yol oluşturmak için)
  const { data: tumLokasyonlar } = await admin.from('lokasyonlar')
    .select('id,tanim,parent_id,checklist_sablon_id,proje_id')
    .eq('firma_id', firmaId)

  // Tam lokasyon haritası (yol traversal için)
  const tumLocMap: Record<string, { tanim: string; parent_id: string | null; checklist_sablon_id: string | null }> = {}
  for (const l of tumLokasyonlar ?? []) {
    tumLocMap[l.id] = { tanim: l.tanim, parent_id: l.parent_id ?? null, checklist_sablon_id: l.checklist_sablon_id ?? null }
  }

  function getLocPath(lokasyonId: string | null | undefined): string {
    if (!lokasyonId) return '—'
    const parts: string[] = []
    let cur: string | null = lokasyonId
    let guard = 0
    while (cur && guard < 8) {
      const node: { tanim: string; parent_id: string | null; checklist_sablon_id: string | null } | undefined = tumLocMap[cur]
      if (!node) break
      parts.push(node.tanim)
      cur = node.parent_id
      guard++
    }
    return parts.reverse().join(' > ') || '—'
  }

  // Proje filtresi için lokasyon seti
  let lokQ = admin.from('lokasyonlar')
    .select('id,tanim,checklist_sablon_id,proje_id')
    .eq('firma_id', firmaId)
  if (projeId) {
    lokQ = lokQ.or(`proje_id.eq.${projeId},proje_id.is.null`)
  }
  const { data: lokasyonlar } = await lokQ

  const lokMap: Record<string, { tanim: string; checklist_sablon_id: string | null }> = {}
  const sablonIds = new Set<string>()
  for (const l of lokasyonlar ?? []) {
    lokMap[l.id] = { tanim: l.tanim, checklist_sablon_id: l.checklist_sablon_id ?? null }
    if (l.checklist_sablon_id) sablonIds.add(l.checklist_sablon_id)
  }

  if (projeId) {
    const { data: specLokRows } = await admin
      .from('gorevler')
      .select('lokasyon_id')
      .eq('firma_id', firmaId)
      .eq('proje_id', projeId)
      .not('lokasyon_id', 'is', null)
    const specRows = (specLokRows ?? []) as { lokasyon_id: string | null }[]
    const ekLokIds: string[] = [...new Set(
      specRows
        .map(r => r.lokasyon_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    )]
    const eksik = ekLokIds.filter(id => !lokMap[id])
    if (eksik.length) {
      const { data: ekLoklar } = await admin
        .from('lokasyonlar')
        .select('id,tanim,checklist_sablon_id,proje_id')
        .eq('firma_id', firmaId)
        .in('id', eksik)
      for (const l of ekLoklar ?? []) {
        lokMap[l.id] = { tanim: l.tanim, checklist_sablon_id: l.checklist_sablon_id ?? null }
        if (l.checklist_sablon_id) sablonIds.add(l.checklist_sablon_id)
      }
    }
  }

  let lokIds = Object.keys(lokMap)
  if (yetkiliLokIds) {
    const yetkiliSet = new Set(yetkiliLokIds)
    lokIds = lokIds.filter(id => yetkiliSet.has(id))
  }
  if (!lokIds.length) return []

  // 2. Şablon başlıkları
  const sablonMap: Record<string, string> = {}
  if (sablonIds.size > 0) {
    const { data: sablonlar } = await admin.from('checklist_sablonlari')
      .select('id,baslik')
      .in('id', [...sablonIds])
    for (const s of sablonlar ?? []) sablonMap[s.id] = s.baslik
  }

  // 3. Çeklist başlıkları
  let basliklar: any[] = []
  if (cikti !== 'arsiv') {
    let sbQ = admin.from('checklist_sonuc_basliklari')
      .select('id,canli_gorev_id,gorev_id,lokasyon_id,sablon_id,kullanici_id,kanal,kayit_tarihi')
      .order('kayit_tarihi', { ascending: false })
      .limit(5000)
    if (baslangic) sbQ = sbQ.gte('kayit_tarihi', baslangic)
    if (bitis)     sbQ = sbQ.lte('kayit_tarihi', bitis + 'T23:59:59')
    const { data: sbData } = await sbQ
    const lokSet = new Set(lokIds)
    basliklar = (sbData ?? []).filter((b: any) => lokSet.has(b.lokasyon_id))
  }

  // Arşiv tablosundan oku - cikti=arsiv veya birlesik için
  let arBasliklar: any[] = []
  if (cikti === 'arsiv' || cikti === 'birlesik') {
    // lokIds çok fazla olduğunda URL limiti aşılabilir — firmaId ile çekip sonra filtrele
    let arSbQ = admin.from('checklist_sonuc_basliklari_arsiv')
      .select('id,canli_gorev_id,gorev_id,lokasyon_id,sablon_id,kullanici_id,kanal,kayit_tarihi')
      .order('kayit_tarihi', { ascending: false })
      .limit(5000)
    if (baslangic) arSbQ = arSbQ.gte('kayit_tarihi', baslangic)
    if (bitis)     arSbQ = arSbQ.lte('kayit_tarihi', bitis + 'T23:59:59')

    const { data: arData, error: arErr } = await arSbQ
    if (!arErr && arData) {
      const lokSet = new Set(lokIds)
      arBasliklar = arData.filter((b: any) => lokSet.has(b.lokasyon_id))
    }
  }

  // Birleştir — fiziksel tabloyu etiketle
  const allBasliklar = [
    ...(basliklar ?? []).map((b: any) => ({ ...b, _fromArsiv: false })),
    ...arBasliklar.map((b: any) => ({ ...b, _fromArsiv: true })),
  ]
  console.log('[ceklist-rapor] allBasliklar:', allBasliklar.length, 'basliklar:', basliklar.length, 'arBasliklar:', arBasliklar.length)
  if (!allBasliklar?.length) return []

  const canliGorevIds = [...new Set(
    allBasliklar.filter((b: any) => b.canli_gorev_id).map((b: any) => String(b.canli_gorev_id)),
  )] as string[]
  const specGorevIds = [...new Set(
    allBasliklar.filter((b: any) => !b.canli_gorev_id && b.gorev_id).map((b: any) => String(b.gorev_id)),
  )] as string[]
  console.log('[ceklist-rapor] canliGorevIds:', canliGorevIds.length, '| specGorevIds:', specGorevIds.length)

  const gorevMap: Record<string, GorevRow> = {}

  // 4a. Frekansiyel: canli_gorevler → canli_gorevler_arsiv
  if (canliGorevIds.length) {
    const { data: canliGorevler } = await admin.from('canli_gorevler')
      .select('id,tanim,durum,tamamlanma_tarihi,lokasyon_id,durum_degisim_tarihi')
      .in('id', canliGorevIds)
      .in('durum', GECERLI_DURUMLAR)
    for (const g of canliGorevler ?? []) {
      gorevMap[g.id] = {
        id: g.id,
        tanim: g.tanim,
        durum: g.durum,
        tamamlanma_tarihi: g.tamamlanma_tarihi ?? null,
        arsiv_tarihi: null,
        lokasyon_id: g.lokasyon_id,
        durum_degisim_tarihi: g.durum_degisim_tarihi ?? null,
        dbKaynak: 'canli',
      }
    }
    const eksik = canliGorevIds.filter(id => !gorevMap[id])
    if (eksik.length) {
      const { data: arsivGorevler } = await admin.from('canli_gorevler_arsiv')
        .select('id,tanim,durum,tamamlanma_tarihi,arsiv_tarihi,lokasyon_id,durum_degisim_tarihi')
        .in('id', eksik)
        .in('durum', GECERLI_DURUMLAR)
      for (const g of arsivGorevler ?? []) {
        gorevMap[g.id] = {
          id: g.id,
          tanim: g.tanim,
          durum: g.durum,
          tamamlanma_tarihi: g.tamamlanma_tarihi ?? null,
          arsiv_tarihi: g.arsiv_tarihi ?? null,
          lokasyon_id: g.lokasyon_id,
          durum_degisim_tarihi: g.durum_degisim_tarihi ?? null,
          dbKaynak: 'arsiv',
        }
      }
    }
  }

  // 4b. Spesifik: gorevler (both main and archive)
  if (specGorevIds.length) {
    // gorevler tablosu sadece 'TAMAMLANDI' durumunu destekler; ZAMANINDA_YAPILAMAYAN enum'da yok
    const { data: specGorevler, error: specErr } = await admin.from('gorevler')
      .select('id,tanim,durum,tamamlanma_tarihi,lokasyon_id,durum_degisim_tarihi')
      .in('id', specGorevIds)
      .eq('durum', 'TAMAMLANDI')
    console.log('[ceklist-rapor] specGorevIds:', specGorevIds, '| specGorevler bulunan:', specGorevler?.length ?? 0, '| specErr:', specErr?.message ?? null)
    for (const g of specGorevler ?? []) {
      gorevMap[g.id] = {
        id: g.id,
        tanim: g.tanim,
        durum: g.durum,
        tamamlanma_tarihi: g.tamamlanma_tarihi ?? null,
        arsiv_tarihi: null,
        lokasyon_id: g.lokasyon_id,
        durum_degisim_tarihi: g.durum_degisim_tarihi ?? null,
        dbKaynak: 'spesifik',
      }
    }

    // Arşiv tablosundan eksik olanları bul
    const eksik = specGorevIds.filter(id => !gorevMap[id])
    if (eksik.length) {
      const { data: specGorevlerArsiv } = await admin.from('gorevler_arsiv')
        .select('id,tanim,durum,tamamlanma_tarihi,lokasyon_id,durum_degisim_tarihi,arsivleme_tarihi')
        .in('id', eksik)
        .eq('durum', 'TAMAMLANDI')
      for (const g of specGorevlerArsiv ?? []) {
        gorevMap[g.id] = {
          id: g.id,
          tanim: g.tanim,
          durum: g.durum,
          tamamlanma_tarihi: g.tamamlanma_tarihi ?? null,
          arsiv_tarihi: g.arsivleme_tarihi ?? null,
          lokasyon_id: g.lokasyon_id,
          durum_degisim_tarihi: g.durum_degisim_tarihi ?? null,
          dbKaynak: 'spesifik',
        }
      }
    }
  }

  if (!Object.keys(gorevMap).length) return []

  // 5. Kullanıcı isimleri
  const kullaniciIds = [...new Set(allBasliklar.filter((b: any) => b.kullanici_id).map((b: any) => b.kullanici_id))]
  const kullaniciMap: Record<string, string> = {}
  if (kullaniciIds.length) {
    const { data: users } = await admin.from('users').select('id,isim_soyisim').in('id', kullaniciIds)
    for (const u of users ?? []) kullaniciMap[u.id] = u.isim_soyisim
  }

  // 6. Madde sayıları (from both tables)
  const baslikIds = allBasliklar.map((b: any) => b.id)
  const { data: maddeSayilari } = await admin.from('checklist_sonuc_maddeleri')
    .select('sonuc_id')
    .in('sonuc_id', baslikIds)

  // Arşiv maddeleri
  const { data: arMaddeSayilari } = await admin.from('checklist_sonuc_maddeleri_arsiv')
    .select('sonuc_id')
    .in('sonuc_id', baslikIds)

  const doldurulanMap: Record<string, number> = {}
  for (const m of [...(maddeSayilari ?? []), ...(arMaddeSayilari ?? [])]) {
    doldurulanMap[m.sonuc_id] = (doldurulanMap[m.sonuc_id] ?? 0) + 1
  }

  const sablonMaddeMap: Record<string, number> = {}
  if (sablonIds.size > 0) {
    const { data: sablonMaddeler } = await admin.from('checklist_sablon_maddeleri')
      .select('sablon_id')
      .in('sablon_id', [...sablonIds])
    for (const m of sablonMaddeler ?? []) {
      sablonMaddeMap[m.sablon_id] = (sablonMaddeMap[m.sablon_id] ?? 0) + 1
    }
  }

  const now = Date.now()
  const cutoff = now - MS24H

  const sonuclar: any[] = []
  for (const b of allBasliklar) {
    const gorevId = b.canli_gorev_id || b.gorev_id
    const gorev = gorevId ? gorevMap[gorevId] : null

    // gorev_id olan ama gorevMap'te bulunamayan kayıtları atla
    if (gorevId && !gorev) continue

    const lok = lokMap[b.lokasyon_id]
    const sablonId = b.sablon_id ?? lok?.checklist_sablon_id
    const toplam = sablonId ? (sablonMaddeMap[sablonId] ?? 0) : 0
    const doldurulan = doldurulanMap[b.id] ?? 0

    // gorev_id null olan kayıtlar için kayit_tarihi referans alınır
    const rref = gorev
      ? refMs(gorev.durum_degisim_tarihi, gorev.tamamlanma_tarihi, b.kayit_tarihi)
      : (b.kayit_tarihi ? new Date(b.kayit_tarihi).getTime() : 0)

    const kaynakUi: 'canli' | 'arsiv' | 'spesifik' =
      !gorev ? 'canli' :
      gorev.dbKaynak === 'spesifik' ? 'spesifik' :
      gorev.dbKaynak === 'arsiv' ? 'arsiv' : 'canli'

    const gorev_task_type: 'canli_gorevler' | 'gorevler' =
      gorev?.dbKaynak === 'spesifik' ? 'gorevler' : 'canli_gorevler'

    const row: any = {
      id:                  b.id,
      kayit_tarihi:        b.kayit_tarihi,
      kanal:               b.kanal ?? 'WEB',
      gorev_id:            gorevId ?? null,
      gorev_tanim:         gorev?.tanim ?? '—',
      gorev_durum:         gorev?.durum ?? null,
      tamamlanma_tarihi:   gorev?.tamamlanma_tarihi ?? null,
      arsiv_tarihi:        gorev?.arsiv_tarihi ?? null,
      durum_degisim_tarihi: gorev?.durum_degisim_tarihi ?? null,
      lokasyon_tanim:      getLocPath(b.lokasyon_id),
      sablon_baslik:       sablonId ? (sablonMap[sablonId] ?? '—') : '—',
      kullanici_isim:      b.kullanici_id ? (kullaniciMap[b.kullanici_id] ?? '—') : '—',
      doldurulan_madde:    doldurulan,
      toplam_madde:        toplam,
      kaynak:              kaynakUi,
      gorev_task_type,
      _refMs:              rref,
      _fromArsiv:          b._fromArsiv,
    }
    sonuclar.push(row)
  }

  // 7. Filtrele:
  //   rapor    → aktif tablo, son 24 saat (cron tarafından arşive taşınmamış taze kayıtlar)
  //   arsiv    → fiziksel arşiv tablosu + henüz taşınmamış eski aktif kayıtlar
  //   birlesik → tümü (tarih filtresiyle eski kayıtlara ulaşmak için)
  const filtered = sonuclar.filter((row) => {
    const r = row._refMs as number
    if (cikti === 'rapor') return !row._fromArsiv && !!r && r >= cutoff
    if (cikti === 'arsiv') return !!row._fromArsiv || (!row._fromArsiv && !!r && r < cutoff)
    return true
  })

  for (const row of filtered) {
    if (cikti === 'birlesik') {
      const r = row._refMs as number
      row.segment = (row._fromArsiv || (r && r < cutoff)) ? 'arsiv' : 'tablo'
    }
    delete row._refMs
    delete row._fromArsiv
  }

  return filtered.sort(
    (a, b) => new Date(b.kayit_tarihi ?? 0).getTime() - new Date(a.kayit_tarihi ?? 0).getTime(),
  )
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const admin    = createAdminClient()
    const yk = await yetkiKontrol(supabase)
    if (!yk.ok) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: yk.status })
    const { me } = yk

    const p        = new URL(req.url).searchParams
    const firmaId  = me.isSA ? (p.get('firma_id') ?? null) : me.firma_id
    let projeId: string | null = p.get('proje_id')
    if (me.isU) {
      if (!me.proje_id) return NextResponse.json({ ok: true, data: [] })
      projeId = me.proje_id
    }
    const baslangic = p.get('baslangic')
    const bitis    = p.get('bitis')

    let cikti: 'rapor' | 'arsiv' | 'birlesik' = 'birlesik'
    const rawCikti = p.get('cikti') as 'rapor' | 'arsiv' | 'birlesik' | null
    if (rawCikti === 'rapor' || rawCikti === 'arsiv' || rawCikti === 'birlesik') {
      cikti = rawCikti
    } else {
      const arsivLegacy = p.get('arsiv')
      if (arsivLegacy === 'false') cikti = 'rapor'
      else if (arsivLegacy === 'true') cikti = 'arsiv'
      else cikti = 'birlesik'
    }

    if (!firmaId) return NextResponse.json({ ok: true, data: [], yetkiler: { duzenleyebilir: false, silebilir: false } })

    const isUM = me.isU
    const yetkiliLokIds = isUM ? await getYetkiliLokasyonIds(supabase, firmaId, projeId) : null

    const data = await kayitlarGetir(admin, firmaId, projeId, baslangic, bitis, cikti, yetkiliLokIds)
    
    // Kullanıcı Grupları Yetkilerini ekle
    const yetkiler = await sayfaYetkileri(me.rol, 'ceklist-raporlari', firmaId ?? undefined)

    return NextResponse.json({ ok: true, data, yetkiler: { duzenleyebilir: yetkiler.duzenleyebilir, silebilir: yetkiler.silebilir } })
  } catch (err: any) {
    console.error('[raporlar/ceklist GET]', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
