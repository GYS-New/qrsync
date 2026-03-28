/**
 * GET /api/raporlar/ceklist
 *
 * Çeklist sonuç başlıklarını listeler.
 * Yalnızca TAMAMLANDI veya ZAMANINDA_YAPILAMAYAN durumundaki görevlere ait kayıtlar döner.
 *
 * Query params:
 *   firma_id     (SA zorunlu, TA kendi firması)
 *   proje_id     (isteğe bağlı)
 *   baslangic    (ISO tarih, isteğe bağlı)
 *   bitis        (ISO tarih, isteğe bağlı)
 *   arama        (görev adı / lokasyon / kullanıcı, isteğe bağlı)
 *   arsiv        "true" → sadece arşiv (canli_gorevler_arsiv), "false" / boş → sadece canlı
 *
 * Dönen kayıt yapısı:
 *   id, kayit_tarihi, kanal,
 *   gorev_id, gorev_tanim, gorev_durum,
 *   tamamlanma_tarihi, arsiv_tarihi,
 *   lokasyon_tanim,
 *   sablon_baslik,
 *   kullanici_isim,
 *   doldurulan_madde, toplam_madde,
 *   kaynak: 'canli' | 'arsiv'
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function yetkiKontrol(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, me: null, status: 401 }
  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return { ok: false, me: null, status: 403 }
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return { ok: false, me: null, status: 403 }
  return { ok: true, me: { ...me, isSA, isTA } }
}

const GECERLI_DURUMLAR = ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN']

async function kayitlarGetir(
  admin: any,
  firmaId: string,
  projeId: string | null,
  baslangic: string | null,
  bitis: string | null,
  arsiv: boolean,
): Promise<any[]> {
  // 1. Firmaya ait lokasyonlar (sablon ve tanim için)
  let lokQ = admin.from('lokasyonlar')
    .select('id,tanim,checklist_sablon_id')
    .eq('firma_id', firmaId)
  if (projeId) lokQ = lokQ.eq('proje_id', projeId)
  const { data: lokasyonlar } = await lokQ
  if (!lokasyonlar?.length) return []

  const lokMap: Record<string, { tanim: string; checklist_sablon_id: string | null }> = {}
  const sablonIds = new Set<string>()
  for (const l of lokasyonlar) {
    lokMap[l.id] = { tanim: l.tanim, checklist_sablon_id: l.checklist_sablon_id ?? null }
    if (l.checklist_sablon_id) sablonIds.add(l.checklist_sablon_id)
  }
  const lokIds = Object.keys(lokMap)

  // 2. Şablon başlıkları
  const sablonMap: Record<string, string> = {}
  if (sablonIds.size > 0) {
    const { data: sablonlar } = await admin.from('checklist_sablonlari')
      .select('id,baslik')
      .in('id', [...sablonIds])
    for (const s of sablonlar ?? []) sablonMap[s.id] = s.baslik
  }

  // 3. Çeklist sonuç başlıklarını getir (lokasyon_id üzerinden)
  const gorevIdKol = arsiv ? 'canli_gorev_id' : 'canli_gorev_id'
  let sbQ = admin.from('checklist_sonuc_basliklari')
    .select('id,canli_gorev_id,gorev_id,lokasyon_id,sablon_id,kullanici_id,kanal,kayit_tarihi')
    .in('lokasyon_id', lokIds)
    .order('kayit_tarihi', { ascending: false })
    .limit(2000)
  if (baslangic) sbQ = sbQ.gte('kayit_tarihi', baslangic)
  if (bitis)     sbQ = sbQ.lte('kayit_tarihi', bitis + 'T23:59:59')

  const { data: basliklar, error: sbErr } = await sbQ
  if (sbErr || !basliklar?.length) return []

  // 4. İlgili görevleri getir — sadece TAMAMLANDI veya ZAMANINDA_YAPILAMAYAN
  const canliGorevIds = [...new Set(basliklar.filter((b: any) => b.canli_gorev_id).map((b: any) => b.canli_gorev_id))]

  const gorevMap: Record<string, any> = {}

  if (!arsiv) {
    // Canlı görevler
    if (canliGorevIds.length) {
      const { data: canliGorevler } = await admin.from('canli_gorevler')
        .select('id,tanim,durum,tamamlanma_tarihi,lokasyon_id')
        .in('id', canliGorevIds)
        .in('durum', GECERLI_DURUMLAR)
      for (const g of canliGorevler ?? []) gorevMap[g.id] = { ...g, arsiv_tarihi: null, kaynak: 'canli' }
    }
  } else {
    // Arşiv görevler
    if (canliGorevIds.length) {
      const { data: arsivGorevler } = await admin.from('canli_gorevler_arsiv')
        .select('id,tanim,durum,tamamlanma_tarihi,arsiv_tarihi,lokasyon_id')
        .in('id', canliGorevIds)
        .in('durum', GECERLI_DURUMLAR)
      for (const g of arsivGorevler ?? []) gorevMap[g.id] = { ...g, kaynak: 'arsiv' }
    }
  }

  if (!Object.keys(gorevMap).length) return []

  // 5. Kullanıcı isimleri
  const kullaniciIds = [...new Set(basliklar.filter((b: any) => b.kullanici_id).map((b: any) => b.kullanici_id))]
  const kullaniciMap: Record<string, string> = {}
  if (kullaniciIds.length) {
    const { data: users } = await admin.from('users').select('id,isim_soyisim').in('id', kullaniciIds)
    for (const u of users ?? []) kullaniciMap[u.id] = u.isim_soyisim
  }

  // 6. Madde sayıları (doldurulma oranı)
  const baslikIds = basliklar.map((b: any) => b.id)
  const { data: maddeSayilari } = await admin.from('checklist_sonuc_maddeleri')
    .select('sonuc_id')
    .in('sonuc_id', baslikIds)

  const doldurulanMap: Record<string, number> = {}
  for (const m of maddeSayilari ?? []) {
    doldurulanMap[m.sonuc_id] = (doldurulanMap[m.sonuc_id] ?? 0) + 1
  }

  // Şablon madde sayıları
  const sablonMaddeMap: Record<string, number> = {}
  if (sablonIds.size > 0) {
    const { data: sablonMaddeler } = await admin.from('checklist_sablon_maddeleri')
      .select('sablon_id')
      .in('sablon_id', [...sablonIds])
    for (const m of sablonMaddeler ?? []) {
      sablonMaddeMap[m.sablon_id] = (sablonMaddeMap[m.sablon_id] ?? 0) + 1
    }
  }

  // 7. Birleştir
  const sonuclar: any[] = []
  for (const b of basliklar) {
    const gorevId = b.canli_gorev_id || b.gorev_id
    if (!gorevId) continue
    const gorev = gorevMap[gorevId]
    if (!gorev) continue // Geçerli durumda değil, atla

    const lok = lokMap[b.lokasyon_id]
    const sablonId = b.sablon_id ?? lok?.checklist_sablon_id
    const toplam = sablonId ? (sablonMaddeMap[sablonId] ?? 0) : 0
    const doldurulan = doldurulanMap[b.id] ?? 0

    sonuclar.push({
      id:                  b.id,
      kayit_tarihi:        b.kayit_tarihi,
      kanal:               b.kanal ?? 'WEB',
      gorev_id:            gorevId,
      gorev_tanim:         gorev.tanim ?? '—',
      gorev_durum:         gorev.durum,
      tamamlanma_tarihi:   gorev.tamamlanma_tarihi ?? null,
      arsiv_tarihi:        gorev.arsiv_tarihi ?? null,
      lokasyon_tanim:      lok?.tanim ?? '—',
      sablon_baslik:       sablonId ? (sablonMap[sablonId] ?? '—') : '—',
      kullanici_isim:      b.kullanici_id ? (kullaniciMap[b.kullanici_id] ?? '—') : '—',
      doldurulan_madde:    doldurulan,
      toplam_madde:        toplam,
      kaynak:              gorev.kaynak as 'canli' | 'arsiv',
    })
  }

  return sonuclar
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const admin    = createAdminClient()
    const { ok, me, status } = await yetkiKontrol(supabase)
    if (!ok || !me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status })

    const p        = new URL(req.url).searchParams
    const firmaId  = me.isSA ? (p.get('firma_id') ?? null) : me.firma_id
    const projeId  = p.get('proje_id')
    const baslangic = p.get('baslangic')
    const bitis    = p.get('bitis')
    const arsivParam = p.get('arsiv') // 'true' | 'false' | null

    if (!firmaId) return NextResponse.json({ ok: true, data: [] })

    let data: any[] = []

    if (arsivParam === 'true') {
      // Sadece arşiv
      data = await kayitlarGetir(admin, firmaId, projeId, baslangic, bitis, true)
    } else if (arsivParam === 'false') {
      // Sadece canlı
      data = await kayitlarGetir(admin, firmaId, projeId, baslangic, bitis, false)
    } else {
      // İkisi birden (filtre uygulandığında)
      const [canli, arsiv] = await Promise.all([
        kayitlarGetir(admin, firmaId, projeId, baslangic, bitis, false),
        kayitlarGetir(admin, firmaId, projeId, baslangic, bitis, true),
      ])
      data = [...canli, ...arsiv].sort(
        (a, b) => new Date(b.kayit_tarihi ?? 0).getTime() - new Date(a.kayit_tarihi ?? 0).getTime()
      )
    }

    return NextResponse.json({ ok: true, data })
  } catch (err: any) {
    console.error('[raporlar/ceklist GET]', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
