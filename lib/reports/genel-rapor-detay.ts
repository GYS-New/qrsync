// Genel Rapor — paginated detay tablo üreticisi.
//
// Frekansiyel Görev Raporu'nun detay tabloları (Tamamlanan, Sapma, Kayıp,
// Frekans Dışı, Atanan) artık ana endpoint yerine bu endpoint'ten gelir.
// Lazy load: kullanıcı ilgili sekmeye tıkladığında çağrılır; pagination ile
// büyük veri setlerinde frontend ve network yükü kontrol altında tutulur.
//
// Filtre + sıralama DB-level (Supabase .in/.gte/.lte/.order/.range) → sadece
// istenen N satır taşınır, JS tarafında full-table aggregation yapılmaz.

import { createAdminClient } from '@/lib/supabase/server'
import {
  formatDate, formatTarihTR, formatGorevSaatleri, formatGorevSuresi,
} from './_format'
import type {
  TamamlananRow, SapmaRow, KayipRow, FrekansDisiRow, AtananFrekanRow,
} from './genel-rapor-data'

export type DetayTip = 'tamamlanan' | 'sapma' | 'kayip' | 'frekans_disi' | 'atanan'

export interface GenelRaporDetayFilters {
  firmaId: string
  projeId?: string | null
  ustLokasyonId?: string | null
  altLokasyonId?: string | null
  altAltLokasyonId?: string | null
  raporBaslangic?: string | null
  raporBitis?: string | null
  /** U/M rolü için yetkili üst lokasyon ID listesi. null = tüm erişim.
   *  Verildiğinde target lokasyon listesi bu kapsamla sınırlanır. */
  yetkiliUstLokIds?: string[] | null
  /** Vardiya filtresi — aktif_olma_tarihi'nin TR saatine göre.
   *  v1: 00-08, v2: 08-16, v3: 16-24. 'all' veya undefined → filtre yok. */
  vardiya?: 'all' | 'v1' | 'v2' | 'v3'
}

export interface DetayResponse {
  rows: TamamlananRow[] | SapmaRow[] | KayipRow[] | FrekansDisiRow[] | AtananFrekanRow[]
  total: number
  hasMore: boolean
  islemSureleriAktif: boolean
}

const SELECT_COLS = 'id,firma_id,tanim,lokasyon_id,atanan_kullanici_id,durum,aktif_olma_tarihi,vardiya_gunu,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,tamamlayan_kullanici_id,islemi_yapan_id,iptal_eden_id,durum_degisim_tarihi,olusturma_tarihi,iptal_sebep,kural_id'

// Kayıp tablosuna giren durumlar (TAMAMLANDI ve ara durumlar hariç).
const KAYIP_DURUMLAR = ['ZAMANI_GECMIS', 'IPTAL', 'SILINDI', 'BEKLEMEDE', 'KAPATILDI']

const durumLabel: Record<string, string> = {
  HAZIR: 'Hazır', ACIK: 'Açık', BEKLEMEDE: 'Beklemede', ISLEMDE: 'İşlemde',
  TAMAMLANDI: 'Tamamlandı', ZAMANINDA_YAPILAMAYAN: 'Zamanında Yapılamayan',
  ZAMANI_GECMIS: 'Zamanı Geçmiş', IPTAL: 'İptal', KAPATILDI: 'Kapatıldı', SILINDI: 'Silindi',
}

const kayipNedeniLabel: Record<string, string> = {
  ZAMANI_GECMIS: 'Süre aşıldı, gerçekleşmedi',
  IPTAL: 'Sebep belirtilmedi',
  SILINDI: 'Kayıt silindi',
  BEKLEMEDE: 'vardiya bitti', // PD cron sonrası hedef oran dışında kalan görevler
  KAPATILDI: 'Kapatıldı',
}

function getAllDescendants(rootId: string, lokMap: Map<string, any>): string[] {
  const out = [rootId]
  const stack = [rootId]
  while (stack.length) {
    const cur = stack.pop()!
    for (const l of lokMap.values()) {
      if (l.parent_id === cur) {
        out.push(l.id)
        stack.push(l.id)
      }
    }
  }
  return out
}

function getUstLokTanim(lokId: string, lokMap: Map<string, any>): string {
  let cur = lokMap.get(lokId)
  let safety = 0
  while (cur?.parent_id && safety < 20) {
    cur = lokMap.get(cur.parent_id)
    safety++
  }
  return cur?.tanim ?? ''
}

export async function buildGenelRaporDetay(
  filters: GenelRaporDetayFilters,
  tip: DetayTip,
  offset: number = 0,
  limit: number = 200,
): Promise<DetayResponse> {
  const admin = createAdminClient()

  // 1. Lokasyon hiyerarşisi (filtre + ekran adı için)
  let lokQ = admin.from('lokasyonlar').select('id,tanim,parent_id,firma_id').eq('firma_id', filters.firmaId)
  if (filters.projeId) lokQ = (lokQ as any).eq('proje_id', filters.projeId)
  const { data: lokasyonlar } = await lokQ
  const lokMap = new Map<string, any>((lokasyonlar ?? []).map((l: any) => [l.id, l]))

  // 2. Hedef lokasyon id seti (filtre uygulanmışsa)
  let targetLokIds: string[] | null = null
  if (filters.altAltLokasyonId)    targetLokIds = getAllDescendants(filters.altAltLokasyonId, lokMap)
  else if (filters.altLokasyonId)  targetLokIds = getAllDescendants(filters.altLokasyonId, lokMap)
  else if (filters.ustLokasyonId)  targetLokIds = getAllDescendants(filters.ustLokasyonId, lokMap)

  // U/M yetki scope: manuel filter yoksa yetkili üst lokasyonların torunları
  if (!targetLokIds && filters.yetkiliUstLokIds && filters.yetkiliUstLokIds.length > 0) {
    targetLokIds = filters.yetkiliUstLokIds.flatMap(id => getAllDescendants(id, lokMap))
  }

  // 3. Tarih sınırları — vardiya_gunu (date) üzerinden (sarkan V1 görevi
  //    kendi günü altında listelenir; aktif_olma_tarihi'nin TR günü değil)

  // 4. Tip'e göre durum filter + sort sütunu
  let durumFilter: string[] | null = null
  let kuralNotNull: boolean | null = null
  let sortCol: string
  switch (tip) {
    case 'tamamlanan':   durumFilter = ['TAMAMLANDI'];            kuralNotNull = true;  sortCol = 'tamamlanma_tarihi'; break
    case 'sapma':        durumFilter = ['ZAMANINDA_YAPILAMAYAN']; kuralNotNull = true;  sortCol = 'tamamlanma_tarihi'; break
    case 'kayip':        durumFilter = KAYIP_DURUMLAR;            kuralNotNull = true;  sortCol = 'durum_degisim_tarihi'; break
    case 'frekans_disi': durumFilter = ['TAMAMLANDI'];            kuralNotNull = false; sortCol = 'tamamlanma_tarihi'; break
    case 'atanan':       durumFilter = null;                      kuralNotNull = true;  sortCol = 'olusturma_tarihi'; break
  }

  function buildQ(table: string, withCount: boolean) {
    let q: any = admin.from(table).select(SELECT_COLS, withCount ? { count: 'exact' } : undefined).eq('firma_id', filters.firmaId)
    if (filters.projeId) q = q.eq('proje_id', filters.projeId)
    if (targetLokIds && targetLokIds.length > 0) q = q.in('lokasyon_id', targetLokIds)
    if (filters.raporBaslangic) q = q.gte('vardiya_gunu', filters.raporBaslangic)
    if (filters.raporBitis)     q = q.lte('vardiya_gunu', filters.raporBitis)
    if (durumFilter) q = q.in('durum', durumFilter)
    if (kuralNotNull === true) q = q.not('kural_id', 'is', null)
    if (kuralNotNull === false) q = q.is('kural_id', null)
    if (tip === 'atanan') q = q.not('atanan_kullanici_id', 'is', null)
    return q
  }

  // 5. Terminal durumlar (tamamlanan/sapma/kayip/frekans_disi) çoğunlukla SADECE arşivde.
  //    Atanan ise hem aktif hem arşivde olabilir. Aktif tabloya tek ekstra sorgu maliyeti
  //    küçük olduğu için iki tabloyu da sorgulayıp merge ediyoruz. Aktif tarafı dar:
  //    çoğu projede <500 satır.
  const [aktifRes, arsivRes] = await Promise.all([
    buildQ('canli_gorevler', true).order(sortCol, { ascending: false, nullsFirst: false }).range(0, offset + limit - 1),
    buildQ('canli_gorevler_arsiv', true).order(sortCol, { ascending: false, nullsFirst: false }).range(0, offset + limit - 1),
  ])

  const aktifCount = aktifRes.count ?? 0
  const arsivCount = arsivRes.count ?? 0
  // Vardiya filtresi yokken DB count'larını kullan; varken filter sonrası gerçek sayım
  // (vardiya filtresi DB'de uygulanamadığı için aşağıda merged üzerinden hesaplanır)
  let total = aktifCount + arsivCount

  // 6. Merge + sort + (vardiya filtresi) + slice (id-bazlı deduplicate; aktif önceliklidir)
  const map = new Map<string, any>()
  for (const g of (arsivRes.data ?? []) as any[]) map.set(g.id, g)
  for (const g of (aktifRes.data ?? []) as any[]) map.set(g.id, g)
  let merged = Array.from(map.values()).sort((a: any, b: any) => {
    const av = a[sortCol] ? new Date(a[sortCol]).getTime() : 0
    const bv = b[sortCol] ? new Date(b[sortCol]).getTime() : 0
    return bv - av
  })
  // Vardiya filtresi — firma vardiya ayarından dinamik (sarkan dahil destekli)
  const vardiya = filters.vardiya ?? 'all'
  if (vardiya !== 'all') {
    const vNo = vardiya === 'v1' ? 1 : vardiya === 'v2' ? 2 : vardiya === 'v3' ? 3 : 0
    const { data: firmaRow } = await admin
      .from('firmalar').select('vardiya_sayisi, tum_vardiya_ayarlari, vardiya_saatleri')
      .eq('id', filters.firmaId).single()
    const vs = (firmaRow as any)?.vardiya_sayisi ?? 0
    const ayarlar = (firmaRow as any)?.tum_vardiya_ayarlari?.[String(vs)] ?? (firmaRow as any)?.vardiya_saatleri ?? []
    const v = (ayarlar as any[]).find((x: any) => Number(x.no) === vNo)
    let aralik: { basMin: number; bitMin: number } | null = null
    if (v?.baslangic && v?.bitis) {
      const [bh, bm] = v.baslangic.split(':').map(Number)
      const [eh, em] = v.bitis.split(':').map(Number)
      if ([bh, bm, eh, em].every(Number.isFinite)) {
        const basMin = bh * 60 + bm
        let bitMin = eh * 60 + em
        if (bitMin === 0 && basMin !== 0) bitMin = 24 * 60
        if (bitMin <= basMin && bitMin !== 24 * 60) bitMin += 24 * 60
        aralik = { basMin, bitMin }
      }
    }
    if (aralik) {
      merged = merged.filter((g: any) => {
        if (!g.aktif_olma_tarihi) return false
        const hm = new Date(g.aktif_olma_tarihi).toLocaleTimeString('en-GB', {
          timeZone: 'Europe/Istanbul', hour12: false, hour: '2-digit', minute: '2-digit',
        })
        const [h, m] = hm.split(':').map(Number)
        if (!Number.isFinite(h) || !Number.isFinite(m)) return false
        const dk = h * 60 + m
        return aralik!.bitMin <= 24 * 60
          ? (dk >= aralik!.basMin && dk < aralik!.bitMin)
          : (dk >= aralik!.basMin || dk < (aralik!.bitMin - 24 * 60))
      })
      total = merged.length
    }
  }
  const slice = merged.slice(offset, offset + limit)

  // 7. User isim lookup (sadece bu sayfa için)
  const userIds = Array.from(new Set(
    slice.flatMap((g: any) => [g.atanan_kullanici_id, g.tamamlayan_kullanici_id, g.islemi_yapan_id, g.iptal_eden_id].filter(Boolean))
  ))
  const userMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await admin.from('users').select('id,isim_soyisim').in('id', userIds)
    for (const u of users ?? []) userMap.set((u as any).id, (u as any).isim_soyisim ?? '')
  }

  // 8. Proje personel filtresi — yabancı proje personeli isim çıkmasın
  let projePersonelIds: Set<string> | null = null
  if (filters.projeId) {
    const { data: pu } = await admin.from('users').select('id').eq('proje_id', filters.projeId)
    projePersonelIds = new Set((pu ?? []).map((u: any) => u.id))
  }

  // 9. Frekans Dışı için grup/üst lokasyon haritası (sadece bu tip)
  let lokGrupMap: Map<string, string> | null = null
  if (tip === 'frekans_disi') {
    let grupQ = admin.from('lokasyon_gruplari').select('id,ad').eq('firma_id', filters.firmaId).eq('aktif', true)
    if (filters.projeId) grupQ = (grupQ as any).eq('proje_id', filters.projeId)
    const { data: gruplar } = await grupQ
    const { data: uyeler } = await admin
      .from('lokasyon_grup_uyeleri')
      .select('grup_id,lokasyon_id')
      .in('grup_id', (gruplar ?? []).map((g: any) => g.id))
    lokGrupMap = new Map()
    for (const u of uyeler ?? []) {
      const g = (gruplar ?? []).find((x: any) => x.id === (u as any).grup_id)
      if (g) lokGrupMap.set((u as any).lokasyon_id, (g as any).ad ?? '')
    }
  }

  // 10. islem_sureleri_aktif ayarı (frontend Saat/Süre sütunlarını gizlemek için)
  let islemSureleriAktif = true
  try {
    const ayar = await import('@/lib/ayarlar/getEfektifAyar').then(m => m.getEfektifAyar(filters.firmaId, filters.projeId ?? null))
    islemSureleriAktif = ayar?.islem_sureleri_aktif !== false
  } catch { /* ignore */ }

  // 11. Tipine göre row inşası
  const rows: any[] = slice.map((g: any, idx: number) => {
    const sn = offset + idx + 1
    const lok = lokMap.get(g.lokasyon_id) as any
    const ust = getUstLokTanim(g.lokasyon_id, lokMap)

    if (tip === 'tamamlanan') {
      const kullaniciId = g.islemi_yapan_id ?? g.tamamlayan_kullanici_id ?? g.atanan_kullanici_id ?? ''
      const isProje = !projePersonelIds || projePersonelIds.has(kullaniciId)
      return {
        sn,
        personel: isProje ? (userMap.get(kullaniciId) ?? '') : '',
        personelId: kullaniciId || null,
        ustLokasyon: ust,
        lokasyon: lok?.tanim ?? '',
        gorevNo: g.id?.slice(-8)?.toUpperCase() ?? '',
        gorevTanimi: g.tanim ?? '',
        tarihSaat: formatDate(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        tarih: formatTarihTR(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        gorevSaatleri: formatGorevSaatleri(g.baslatilma_tarihi, g.tamamlanma_tarihi),
        gorevSuresi: formatGorevSuresi(g.tamamlanma_suresi_saniye),
        durum: 'TAMAMLANDI',
      } as TamamlananRow
    }

    if (tip === 'sapma') {
      const kullaniciId = g.islemi_yapan_id ?? g.atanan_kullanici_id ?? ''
      const isProje = !projePersonelIds || projePersonelIds.has(kullaniciId)
      return {
        sn,
        personel: isProje ? (userMap.get(kullaniciId) ?? '') : '',
        personelId: kullaniciId || null,
        ustLokasyon: ust,
        lokasyon: lok?.tanim ?? '',
        gorevNo: g.id?.slice(-8)?.toUpperCase() ?? '',
        gorevTanimi: g.tanim ?? '',
        tarihSaat: formatDate(g.durum_degisim_tarihi ?? g.aktif_olma_tarihi),
        tarih: formatTarihTR(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        gorevSaatleri: formatGorevSaatleri(g.baslatilma_tarihi, g.tamamlanma_tarihi),
        gorevSuresi: formatGorevSuresi(g.tamamlanma_suresi_saniye),
        sapmaNedeni: g.durum === 'BEKLEMEDE' ? 'Zamanında tamamlanamadı' : 'Gecikme ile tamamlandı',
      } as SapmaRow
    }

    if (tip === 'kayip') {
      // iptal_sebep dolu ise her zaman onu göster (IPTAL = manuel sebep,
      // ZAMANI_GECMIS = PD cron 'vardiya bitti' veya custom).
      const kayipNedeni = g.iptal_sebep
        ? g.iptal_sebep
        : (kayipNedeniLabel[g.durum] ?? '')
      return {
        sn,
        ustLokasyon: ust,
        lokasyon: lok?.tanim ?? '',
        gorevNo: g.id?.slice(-8)?.toUpperCase() ?? '',
        gorevTanimi: g.tanim ?? '',
        tarihSaat: formatDate(g.durum_degisim_tarihi ?? g.aktif_olma_tarihi),
        // Kayıp görevler için TARİH = vardiya_gunu (görevin AİT olduğu gün).
        // Sarkan V1'de görev 23:35 aktif, BEKLEMEDE/ZG geçişi ertesi gün
        // gerçekleşir; durum_degisim_tarihi yanıltıcı olur.
        tarih: g.vardiya_gunu
          ? formatTarihTR(`${g.vardiya_gunu}T00:00:00+03:00`)
          : formatTarihTR(g.durum_degisim_tarihi ?? g.aktif_olma_tarihi),
        gorevSaatleri: formatGorevSaatleri(g.baslatilma_tarihi, g.tamamlanma_tarihi),
        gorevSuresi: formatGorevSuresi(g.tamamlanma_suresi_saniye),
        // Manuel iptal → personel ismi; otomatik (ZG/BEKLEMEDE) → 'sistem'
        iptalEden: g.iptal_eden_id ? (userMap.get(g.iptal_eden_id) ?? 'sistem') : 'sistem',
        durum: durumLabel[g.durum] ?? g.durum ?? '',
        kayipNedeni,
      } as KayipRow
    }

    if (tip === 'frekans_disi') {
      const personelId = g.islemi_yapan_id ?? g.tamamlayan_kullanici_id ?? ''
      const sure = Number(g.tamamlanma_suresi_saniye) || 0
      return {
        sn,
        ustLokasyon: ust,
        grupTanimi: lokGrupMap?.get(g.lokasyon_id) ?? '',
        lokasyonTanimi: lok?.tanim ?? '',
        personel: userMap.get(personelId) ?? '',
        tarihSaat: formatDate(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        tarih: formatTarihTR(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        gorevSaatleri: formatGorevSaatleri(g.baslatilma_tarihi, g.tamamlanma_tarihi),
        gorevSuresi: sure > 0 ? formatGorevSuresi(sure) : 'Tek tık',
        aciklama: g.tanim ?? '',
      } as FrekansDisiRow
    }

    // atanan
    const tamamlayanId = g.islemi_yapan_id ?? g.tamamlayan_kullanici_id ?? ''
    return {
      sn,
      atanan: userMap.get(g.atanan_kullanici_id) ?? '—',
      tamamlayan: tamamlayanId ? (userMap.get(tamamlayanId) ?? '—') : '—',
      ustLokasyon: ust,
      lokasyon: lok?.tanim ?? '—',
      gorevTanimi: g.tanim ?? '—',
      gorevDurumu: durumLabel[g.durum] ?? g.durum ?? '—',
      durumKod: g.durum ?? '',
      atamaTarihi: formatDate(g.olusturma_tarihi),
      tamamlanmaTarihi: g.tamamlanma_tarihi ? formatDate(g.tamamlanma_tarihi) : '—',
    } as AtananFrekanRow
  })

  return {
    rows,
    total,
    hasMore: offset + slice.length < total,
    islemSureleriAktif,
  }
}
