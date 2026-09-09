/**
 * GET /api/raporlar/personel-mesai-takipli
 *
 * PT (Personel Takibi) aktif projelerde gun-gun ve vardiya-vardiya
 * personel mesai + gorev ozeti.
 *
 * Query:
 *   firma_id         (zorunlu)
 *   proje_id?
 *   tarih_baslangic  YYYY-MM-DD (dahil)
 *   tarih_bitis      YYYY-MM-DD (dahil)
 *   ust_lokasyon_id? tekli filtre (personel.ust_lokasyon_id)
 *   personel_id?     tekli filtre
 *   vardiya_no?      1/2/3/4
 *
 * Response:
 *   {
 *     ok: true,
 *     data: [{
 *       personel_id, isim_soyisim, ust_lokasyon_id, ust_lokasyon_adi,
 *       kayit_tarihi (YYYY-MM-DD, vardiya gunu),
 *       vardiya_no, vardiya_baslangic, vardiya_bitis,
 *       giris_saati, cikis_saati,
 *       calisma_sure_saniye,       // cikis - giris
 *       gorev_sayi,                // bu mesai icinde tamamlanan gorevler
 *       gorev_toplam_sure_saniye,  // tamamlanma_suresi_saniye toplami
 *     }],
 *     meta: {
 *       tarih_baslangic, tarih_bitis,
 *       ust_lokasyonlar, personeller, vardiyalar,
 *       pt_aktif_proje_var: boolean,
 *     }
 *   }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getEffectiveVardiya } from '@/lib/vardiya/getEffective'

export const dynamic = 'force-dynamic'

// Firma vardiya ayarindan vardiya numarasini bul (TR saat)
function vardiyaBul(girisIso: string, vardiyalar: { no: number; baslangic: string; bitis: string }[]): number | null {
  if (!vardiyalar || vardiyalar.length === 0) return null
  const d = new Date(girisIso)
  const hm = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour12: false, hour: '2-digit', minute: '2-digit' })
  const [h, m] = hm.split(':').map(Number)
  const dk = h * 60 + m
  for (const v of vardiyalar) {
    const [bh, bm] = v.baslangic.split(':').map(Number)
    const [eh, em] = v.bitis.split(':').map(Number)
    const bas = bh * 60 + bm
    const bit = eh * 60 + em
    const icinde = bit > bas
      ? (dk >= bas && dk < bit)                       // 07:30-15:30 gibi
      : (dk >= bas || dk < bit)                       // 23:30-07:30 sarkan
    if (icinde) return v.no
  }
  return null
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanici bulunamadi' }, { status: 401 })

  const p = new URL(req.url).searchParams
  const firmaId = p.get('firma_id') || ''
  const projeId = p.get('proje_id')
  const tarihBaslangic = p.get('tarih_baslangic') || ''
  const tarihBitis = p.get('tarih_bitis') || ''
  const ustLokId = p.get('ust_lokasyon_id')
  const personelIdFilter = p.get('personel_id')
  const vardiyaNoFilter = p.get('vardiya_no')

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!tarihBaslangic || !tarihBitis) return NextResponse.json({ ok: false, error: 'tarih araligi gerekli' }, { status: 400 })

  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  if (!isSA && firmaId !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erisim yok' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Vardiya ayarlarini efektif ayar'dan al (proje override > firma fallback)
  const ev = await getEffectiveVardiya(admin, firmaId, projeId ?? null)
  const vardiyaSayisi = ev.vardiya_sayisi ?? 0
  const tumAyarlar = ev.tum_vardiya_ayarlari ?? {}
  const vardiyaMeta: { no: number; baslangic: string; bitis: string }[] = (() => {
    const key = String(vardiyaSayisi)
    const raw = (tumAyarlar?.[key] ?? ev.vardiya_saatleri ?? []) as any[]
    return (raw || [])
      .filter((v: any) => v && v.baslangic && v.bitis)
      .map((v: any) => ({ no: Number(v.no), baslangic: String(v.baslangic), bitis: String(v.bitis) }))
  })()

  // PT aktif proje kontrolü
  let ptAktif = false
  if (projeId) {
    const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', projeId).maybeSingle()
    ptAktif = (proje as any)?.personel_takibi_aktif === true
  } else {
    const { data: firma } = await admin.from('firmalar').select('personel_takibi_aktif').eq('id', firmaId).maybeSingle()
    ptAktif = (firma as any)?.personel_takibi_aktif === true
  }

  // Mesai kayıtları — canlı + arşiv birlikte
  const alanlarSelect = 'id, user_id, firma_id, proje_id, kayit_tarihi, giris_saati, cikis_saati'
  let cQ = admin.from('personel_mesai_kayitlari')
    .select(alanlarSelect)
    .eq('firma_id', firmaId)
    .gte('kayit_tarihi', tarihBaslangic)
    .lte('kayit_tarihi', tarihBitis)
    .not('giris_saati', 'is', null)
  if (projeId) cQ = cQ.eq('proje_id', projeId)
  if (personelIdFilter) cQ = cQ.eq('user_id', personelIdFilter)

  let aQ = admin.from('personel_mesai_kayitlari_arsiv')
    .select(alanlarSelect)
    .eq('firma_id', firmaId)
    .gte('kayit_tarihi', tarihBaslangic)
    .lte('kayit_tarihi', tarihBitis)
    .not('giris_saati', 'is', null)
  if (projeId) aQ = aQ.eq('proje_id', projeId)
  if (personelIdFilter) aQ = aQ.eq('user_id', personelIdFilter)

  const [canliRes, arsivRes] = await Promise.all([cQ, aQ])
  const mesaiRows = [...((canliRes.data ?? []) as any[]), ...((arsivRes.data ?? []) as any[])]

  // Personel bilgileri (ust lokasyon)
  const userIds = [...new Set(mesaiRows.map(m => m.user_id).filter(Boolean))] as string[]
  const { data: kullaniciRows } = userIds.length > 0
    ? await admin.from('users').select('id, isim_soyisim, ust_lokasyon_id').in('id', userIds)
    : { data: [] as any[] }
  const kullaniciMap = new Map<string, any>()
  for (const u of (kullaniciRows ?? [])) kullaniciMap.set(u.id, u)

  // Ust lokasyon adları
  const ustLokIds = [...new Set((kullaniciRows ?? []).map((u: any) => u.ust_lokasyon_id).filter(Boolean))] as string[]
  const { data: ustLokRows } = ustLokIds.length > 0
    ? await admin.from('lokasyonlar').select('id, tanim').in('id', ustLokIds)
    : { data: [] as any[] }
  const ustLokMap = new Map<string, string>()
  for (const l of (ustLokRows ?? [])) ustLokMap.set(l.id, l.tanim)

  // Ust lokasyon filtresi (kullanici bazlı)
  const filteredRows = ustLokId
    ? mesaiRows.filter(m => kullaniciMap.get(m.user_id)?.ust_lokasyon_id === ustLokId)
    : mesaiRows

  // Görev sayıları — canlı + arşiv, tamamlayan_kullanici_id + tamamlanma_tarihi
  // Personel bazlı toplu çek (tarih aralığında), sonra her mesai için filtre
  let gorevRows: any[] = []
  if (userIds.length > 0) {
    const gorevSelect = 'tamamlayan_kullanici_id, tamamlanma_tarihi, tamamlanma_suresi_saniye'
    const [cg, gg, cga, ga] = await Promise.all([
      admin.from('canli_gorevler').select(gorevSelect)
        .in('tamamlayan_kullanici_id', userIds)
        .eq('durum', 'TAMAMLANDI')
        .gte('tamamlanma_tarihi', `${tarihBaslangic}T00:00:00+03:00`)
        .lte('tamamlanma_tarihi', `${tarihBitis}T23:59:59+03:00`)
        .limit(50000),
      admin.from('gorevler').select(gorevSelect)
        .in('tamamlayan_kullanici_id', userIds)
        .eq('durum', 'TAMAMLANDI')
        .gte('tamamlanma_tarihi', `${tarihBaslangic}T00:00:00+03:00`)
        .lte('tamamlanma_tarihi', `${tarihBitis}T23:59:59+03:00`)
        .limit(50000),
      admin.from('canli_gorevler_arsiv').select(gorevSelect)
        .in('tamamlayan_kullanici_id', userIds)
        .eq('durum', 'TAMAMLANDI')
        .gte('tamamlanma_tarihi', `${tarihBaslangic}T00:00:00+03:00`)
        .lte('tamamlanma_tarihi', `${tarihBitis}T23:59:59+03:00`)
        .limit(50000),
      admin.from('gorevler_arsiv').select(gorevSelect)
        .in('tamamlayan_kullanici_id', userIds)
        .eq('durum', 'TAMAMLANDI')
        .gte('tamamlanma_tarihi', `${tarihBaslangic}T00:00:00+03:00`)
        .lte('tamamlanma_tarihi', `${tarihBitis}T23:59:59+03:00`)
        .limit(50000),
    ])
    gorevRows = [
      ...((cg.data ?? []) as any[]),
      ...((gg.data ?? []) as any[]),
      ...((cga.data ?? []) as any[]),
      ...((ga.data ?? []) as any[]),
    ]
  }

  // Her mesai için giris-cikis arasindaki gorevleri bul
  const data = filteredRows.map((m: any) => {
    const u = kullaniciMap.get(m.user_id) ?? {}
    const girisMs = new Date(m.giris_saati).getTime()
    const cikisMs = m.cikis_saati ? new Date(m.cikis_saati).getTime() : null
    const calisma = cikisMs ? Math.max(0, Math.floor((cikisMs - girisMs) / 1000)) : null
    const vNo = vardiyaBul(m.giris_saati, vardiyaMeta)
    const vObj = vardiyaMeta.find((v: any) => v.no === vNo)

    // Bu mesai icinde tamamlanan gorevler: tamamlayan_kullanici_id=personel VE
    // tamamlanma_tarihi giris ile cikis (veya bugun 23:59) arasinda
    const bitisMs = cikisMs ?? new Date(`${m.kayit_tarihi}T23:59:59+03:00`).getTime()
    const gorevler = gorevRows.filter(g =>
      g.tamamlayan_kullanici_id === m.user_id &&
      g.tamamlanma_tarihi &&
      (() => {
        const t = new Date(g.tamamlanma_tarihi).getTime()
        return t >= girisMs && t <= bitisMs
      })()
    )
    const gorevToplamSure = gorevler.reduce((s, g) => s + (g.tamamlanma_suresi_saniye ?? 0), 0)

    return {
      personel_id: m.user_id,
      isim_soyisim: u.isim_soyisim ?? '—',
      ust_lokasyon_id: u.ust_lokasyon_id ?? null,
      ust_lokasyon_adi: u.ust_lokasyon_id ? (ustLokMap.get(u.ust_lokasyon_id) ?? null) : null,
      kayit_tarihi: m.kayit_tarihi,
      vardiya_no: vNo,
      vardiya_baslangic: vObj?.baslangic ?? null,
      vardiya_bitis: vObj?.bitis ?? null,
      giris_saati: m.giris_saati,
      cikis_saati: m.cikis_saati,
      calisma_sure_saniye: calisma,
      gorev_sayi: gorevler.length,
      gorev_toplam_sure_saniye: gorevToplamSure,
    }
  }).filter((r: any) => !vardiyaNoFilter || String(r.vardiya_no) === vardiyaNoFilter)

  // Meta — dropdown listeleri
  const ustLokasyonlarMeta = [...ustLokMap.entries()].map(([id, tanim]) => ({ id, tanim }))
    .sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))
  const personellerMeta = (kullaniciRows ?? []).map((u: any) => ({
    id: u.id, isim_soyisim: u.isim_soyisim, ust_lokasyon_id: u.ust_lokasyon_id ?? null,
  })).sort((a: any, b: any) => (a.isim_soyisim ?? '').localeCompare(b.isim_soyisim ?? '', 'tr'))

  // Kayit_tarihi + personel adına göre sırala
  data.sort((a: any, b: any) => {
    if (a.kayit_tarihi !== b.kayit_tarihi) return a.kayit_tarihi < b.kayit_tarihi ? 1 : -1  // yeni önce
    if (a.isim_soyisim !== b.isim_soyisim) return a.isim_soyisim.localeCompare(b.isim_soyisim, 'tr')
    return (a.vardiya_no ?? 0) - (b.vardiya_no ?? 0)
  })

  return NextResponse.json({
    ok: true,
    data,
    meta: {
      tarih_baslangic: tarihBaslangic,
      tarih_bitis: tarihBitis,
      ust_lokasyonlar: ustLokasyonlarMeta,
      personeller: personellerMeta,
      vardiyalar: vardiyaMeta,
      pt_aktif_proje_var: ptAktif,
    },
  })
}
