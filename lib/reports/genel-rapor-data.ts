import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { getUstLokasyonYetkiliUserIds } from '@/lib/yetki/getUstLokasyonYetkiliUserIds'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'

export type VardiyaFilter = 'all' | 'v1' | 'v2' | 'v3'

export interface GenelRaporFilters {
  firmaId: string
  projeId?: string | null
  ustLokasyonId?: string | null
  altLokasyonId?: string | null
  altAltLokasyonId?: string | null
  raporBaslangic?: string | null   // 'YYYY-MM-DD'
  raporBitis?: string | null       // 'YYYY-MM-DD'
  raporuAlan?: string | null
  /** Vardiya filtresi — aktif_olma_tarihi'nin TR saatine göre.
   *  v1: 00-08, v2: 08-16, v3: 16-24. 'all' veya undefined → filtre yok. */
  vardiya?: VardiyaFilter
  /** U/M rolü için yetkili üst lokasyon ID listesi. null = tüm erişim (SA/TA).
   *  Verildiğinde tüm sorgular ve Departman Analizi sadece bu üst lokasyonlar +
   *  alt lokasyonlarıyla sınırlanır. lib/yetki/getLokasyonYetki.ts ile uyumlu. */
  yetkiliUstLokIds?: string[] | null
  /** false ise detay listelerini (tamamlananGorevler, sapmaGorevler, kayipGorevler,
   *  frekansDisiGorevler, atananFrekanslar) üretmez — özet + grup metrikleri + count'lar
   *  döner. Detay tablolar `/api/reports/genel-rapor-detay` üzerinden paginated alınır.
   *  Default true (geriye uyum: Excel export gibi tüm satırı isteyen tüketiciler kırılmasın). */
  includeDetails?: boolean
}

export interface GrupMetrik {
  grup: string
  ustLokasyon: string
  lokasyon: string
  gorevTanimi: string   // Gruba ait görev tanımı (varsa ilk eşleşen)
  gunlukFrekans: number
  kuralSayisi: number   // Unique görev tanımı sayısı (kural sayısı)
  hedef: number
  tamamlanan: number
  sapma: number
  kayip: number
  ekstra: number        // Ekstra frekansiyel (kural dışı) tamamlanan sayısı
  basariOrani: string
  genelOran: string
}

export interface TamamlananRow {
  sn: number
  personel: string
  /** Personel UUID — frontend agg'lerinde yönetici filtresi için kullanılır */
  personelId: string | null
  ustLokasyon: string
  lokasyon: string
  gorevNo: string
  gorevTanimi: string
  /** ESKİ — geriye uyum için tutuluyor (Excel export vs. eski tüketicileri kırmasın) */
  tarihSaat: string
  /** YENİ — DD.MM.YYYY formatında sadece tarih */
  tarih: string
  /** YENİ — "HH:MM - HH:MM" başlatma-tamamlama */
  gorevSaatleri: string
  /** YENİ — "X dk" / "Y sn" / "H sa M dk" */
  gorevSuresi: string
  durum: string
}

export interface SapmaRow {
  sn: number
  personel: string
  personelId: string | null
  ustLokasyon: string
  lokasyon: string
  gorevNo: string
  gorevTanimi: string
  tarihSaat: string
  tarih: string
  gorevSaatleri: string
  gorevSuresi: string
  sapmaNedeni: string
}

export interface KayipRow {
  sn: number
  ustLokasyon: string
  lokasyon: string
  gorevNo: string
  gorevTanimi: string
  tarihSaat: string
  tarih: string
  gorevSaatleri: string
  gorevSuresi: string
  durum: string
  kayipNedeni: string
}

export interface FrekansDisiRow {
  sn: number
  ustLokasyon: string
  grupTanimi: string
  lokasyonTanimi: string
  personel: string
  tarihSaat: string
  tarih: string
  gorevSaatleri: string
  gorevSuresi: string
  aciklama: string
}

export interface AtananFrekanRow {
  sn: number
  atanan: string
  tamamlayan: string
  ustLokasyon: string
  lokasyon: string
  gorevTanimi: string
  gorevDurumu: string
  durumKod: string
  atamaTarihi: string
  tamamlanmaTarihi: string
}

/** Üst lokasyon (departman) bazında özet. Departman Analizi kartı için. */
export interface DepartmanMetrik {
  ustLokasyonId: string
  ustLokasyonAd: string
  hedef: number       // toplam kural-üretimli görev
  tamamlanan: number  // durum=TAMAMLANDI
  sapma: number       // durum=ZAMANINDA_YAPILAMAYAN
  kayip: number       // durum IN (ZAMANI_GECMIS, IPTAL, SILINDI, BEKLEMEDE, KAPATILDI)
}

/** Özet & Grafikler sekmesinde tüketilen önceden agg-edilmiş veriler.
 *  Frontend artık detay listelerden hesaplamaz (lazy load sonrası boş gelirler);
 *  doğrudan bu alanlardan okur. Tüm key formatları "Üst Lokasyon - X". */
export interface OzetAgg {
  departmanMetrikleri: DepartmanMetrik[]                   // üst lokasyon bazlı, hedef desc
  personelTamamlananTop: { key: string; sayi: number }[]   // Üst Lok - Personel, top 10, yönetici hariç
  lokasyonTamamlananTop: { key: string; sayi: number }[]   // Üst Lok - Lokasyon, top 10
  kayipNedeniDagilim: { neden: string; sayi: number }[]    // desc, tüm nedenler
  sapmaNedeniDagilim: { neden: string; sayi: number }[]
  kayipLokasyonTop: { key: string; sayi: number }[]        // top 10
  sapmaLokasyonTop: { key: string; sayi: number }[]
  atananPersonelBasari: {                                  // tüm atanan personel
    personel: string; atanan: number; tamamlanan: number; sapma: number; kayip: number; aktif: number
  }[]
}

export interface GenelRaporData {
  firmaAdi: string
  projeAdi: string
  ustLokTanim: string
  altLokTanim: string
  raporTarihLabel: string
  gunSayisi: number
  raporuAlan: string
  // Özet
  toplamGorev: number        // Hedef: kural-üretimli görev sayısı
  toplamTamamlanan: number   // Kural tamamlanan + ekstra tamamlanan (başarıya katılır)
  toplamSapma: number        // Sadece kural-üretimli
  toplamKayip: number        // Sadece kural-üretimli
  toplamEkstra: number       // kural_id IS NULL & TAMAMLANDI
  genelBasari: number        // Ekstra dahil (>%100 olabilir)
  // Tablo verileri
  grupMetrikleri: GrupMetrik[]
  tamamlananGorevler: TamamlananRow[]
  sapmaGorevler: SapmaRow[]
  kayipGorevler: KayipRow[]
  frekansDisiGorevler: FrekansDisiRow[]
  atananFrekanslar: AtananFrekanRow[]
  /** Özet sayfası grafikleri için önceden hesaplanmış agg'ler.
   *  includeDetails=false durumunda detay listeler boş gelir; özet bu alanlardan okur. */
  ozetAgg: OzetAgg
  /** Üst lokasyon yöneticileri (vardiya şefleri) — frontend personel başarı
   *  agg'lerinde hariç tutmak için. Listelerde tüm satırlar var, denetim için. */
  yoneticiIds: string[]
  /** Proje ayarı: false ise UI'de Görev/İşlem Saatleri ve Süresi sütunları gizlenir */
  islemSureleriAktif: boolean
}

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  // TRT (UTC+3) olarak göster
  const trt = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(trt.getUTCDate())}.${pad(trt.getUTCMonth() + 1)}.${trt.getUTCFullYear()} ${pad(trt.getUTCHours())}:${pad(trt.getUTCMinutes())}`
}

// Sadece tarih (DD.MM.YYYY) — TR saat
function formatTarihTR(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  const trt = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(trt.getUTCDate())}.${pad(trt.getUTCMonth() + 1)}.${trt.getUTCFullYear()}`
}

// Sadece saat (HH:MM) — TR saat
function formatSaatTR(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const trt = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(trt.getUTCHours())}:${pad(trt.getUTCMinutes())}`
}

// "HH:MM - HH:MM" (başlatma - tamamlanma) — bir taraf eksikse "—"
function formatGorevSaatleri(baslatilma?: string | null, tamamlanma?: string | null): string {
  const b = formatSaatTR(baslatilma)
  const t = formatSaatTR(tamamlanma)
  if (!b && !t) return '—'
  return `${b || '—'} - ${t || '—'}`
}

// Süre: "X dk", "Y sn", veya "H sa M dk"
function formatGorevSuresi(saniye?: number | null): string {
  if (saniye == null || saniye <= 0) return '—'
  if (saniye < 60) return `${saniye} sn`
  const dk = saniye / 60
  if (dk < 60) return `${dk.toFixed(1)} dk`
  const saat = Math.floor(dk / 60)
  const kalanDk = Math.round(dk % 60)
  return kalanDk > 0 ? `${saat} sa ${kalanDk} dk` : `${saat} sa`
}

// Sıralama için ms timestamp döndür (en yeni üstte için DESC)
function tsMs(value?: string | null): number {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}

function withinRange(value: string | null | undefined, from?: string | null, to?: string | null): boolean {
  if (!from && !to) return true
  if (!value) return false
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return false
  if (from) {
    const fromTs = new Date(`${from}T00:00:00+03:00`).getTime()
    if (ts < fromTs) return false
  }
  if (to) {
    const toTs = new Date(`${to}T23:59:59.999+03:00`).getTime()
    if (ts > toTs) return false
  }
  return true
}

function daysBetween(from?: string | null, to?: string | null): number {
  if (!from || !to) return 1
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return 1
  return Math.max(1, Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24)) + 1)
}

export async function buildGenelRaporData(filters: GenelRaporFilters): Promise<GenelRaporData> {
  const admin = createAdminClient()
  // Default true — eski tüketiciler (Excel export vb.) hala tüm listeleri bekler.
  // Yeni rapor sayfası bunu false geçer (detay tablolar ayrı endpoint'ten lazy gelir).
  const includeDetails = filters.includeDetails !== false

  // 1. Firma ve proje bilgisi
  const [{ data: firma }, { data: proje }] = await Promise.all([
    admin.from('firmalar').select('id,ticari_unvan,firma_adi').eq('id', filters.firmaId).single(),
    filters.projeId
      ? admin.from('projeler').select('id,ad').eq('id', filters.projeId).single()
      : Promise.resolve({ data: null }),
  ])
  const firmaAdi = firma ? (firma.firma_adi || firma.ticari_unvan || '') : ''
  const projeAdi = (proje as any)?.ad ?? ''

  // 2. Lokasyon bilgileri
  let ustLokTanim = ''
  let altLokTanim = ''
  let targetLokasyonIds: string[] | null = null

  let lokQ = admin
    .from('lokasyonlar')
    .select('id,tanim,parent_id,firma_id,gunluk_frekans_sayisi')
    .eq('firma_id', filters.firmaId)
  if (filters.projeId) lokQ = (lokQ as any).eq('proje_id', filters.projeId)
  const { data: lokasyonlar } = await lokQ
  const allLokasyonlar = lokasyonlar ?? []
  const lokMap = new Map(allLokasyonlar.map((l: any) => [l.id, l]))

  // Bir lokasyonun tüm alt ağacını (recursive) toplayan yardımcı fonksiyon
  function getAllDescendants(rootId: string): string[] {
    const result: string[] = [rootId]
    const queue = [rootId]
    while (queue.length > 0) {
      const parentId = queue.shift()!
      const children = allLokasyonlar.filter((l: any) => l.parent_id === parentId)
      for (const child of children) {
        result.push(child.id)
        queue.push(child.id)
      }
    }
    return result
  }

  // Bir lokasyonun kök'ten bu lokasyona kadar tam yolunu döndürür: "Ust > Alt > AltAlt"
  function getLokasyonFullPath(lokId: string): string {
    const parts: string[] = []
    let current = lokMap.get(lokId) as any
    while (current) {
      parts.unshift(current.tanim ?? '')
      current = current.parent_id ? lokMap.get(current.parent_id) as any : null
    }
    return parts.join(' > ')
  }

  // Bir lokasyonun en tepedeki (kök) üst lokasyon adını döndürür
  function getUstLokasyon(lokId: string): string {
    let cur = lokMap.get(lokId) as any
    if (!cur) return ''
    while (cur.parent_id) {
      const parent = lokMap.get(cur.parent_id) as any
      if (!parent) break
      cur = parent
    }
    return cur.tanim ?? ''
  }

  // Filtre seviyesine göre ÜST LOKASYON değerini döndürür:
  // altAltLokasyonId seçiliyse → direkt parent adı (alt seviye)
  // diğer durumlarda → kök adı
  function getContextUstLokasyon(lokId: string): string {
    if (filters.altAltLokasyonId) {
      const loc = lokMap.get(lokId) as any
      if (loc?.parent_id) return (lokMap.get(loc.parent_id) as any)?.tanim ?? ''
      return ''
    }
    return getUstLokasyon(lokId)
  }

  if (filters.ustLokasyonId) {
    const ust = lokMap.get(filters.ustLokasyonId) as any
    ustLokTanim = ust?.tanim ?? ''
    if (filters.altLokasyonId) {
      const alt = lokMap.get(filters.altLokasyonId) as any
      altLokTanim = alt?.tanim ?? ''
      if (filters.altAltLokasyonId) {
        // Üst + Alt + Alt-Alt seçili: alt-alt + tüm torunları
        targetLokasyonIds = getAllDescendants(filters.altAltLokasyonId)
      } else {
        // Üst + Alt seçili: alt + tüm torunları
        targetLokasyonIds = getAllDescendants(filters.altLokasyonId)
      }
    } else {
      // Sadece Üst seçili: üst + tüm torunları
      targetLokasyonIds = getAllDescendants(filters.ustLokasyonId)
    }
  }

  // U/M yetki scope: kullanıcı manuel filter seçmemişse, yetkili üst lokasyonların
  // tümünün altındaki lokasyonlar kapsama alınır. Filter seçtiyse o zaten yetkili
  // listesinde olduğu route.ts'te doğrulandı; mevcut targetLokasyonIds geçerli.
  if (!targetLokasyonIds && filters.yetkiliUstLokIds && filters.yetkiliUstLokIds.length > 0) {
    targetLokasyonIds = filters.yetkiliUstLokIds.flatMap(id => getAllDescendants(id))
  }

  // 3. Görevleri çek: aktif tablo + arşiv tablosu birleşik
  // Arşiv tablosu terminal durumları (TAMAMLANDI, ZAMANI_GECMIS vb.) tutar.
  //
  // Sütun seti includeDetails'a göre değişir:
  //   - false (yeni rapor sayfası): özet & grafikler agg'leri için gerekli 11 sütun.
  //     Personel/lokasyon/kayıp-neden top-N grafikleri response.ozetAgg üzerinden
  //     hesaplanır (frontend artık detay listelerden değil bu agg'lerden okur).
  //   - true (Excel/Export/Mail): tüm sütunlar, mevcut davranış korunur.
  const SELECT_COLS_MID = 'id,firma_id,lokasyon_id,durum,aktif_olma_tarihi,gunluk_frekans_sayisi,kural_id,islemi_yapan_id,tamamlayan_kullanici_id,atanan_kullanici_id,iptal_sebep'
  const SELECT_COLS_FULL = 'id,firma_id,tanim,lokasyon_id,atanan_kullanici_id,durum,aktif_olma_tarihi,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,tamamlayan_kullanici_id,islemi_yapan_id,durum_degisim_tarihi,olusturma_tarihi,gunluk_frekans_sayisi,iptal_sebep,kural_id'
  const SELECT_COLS = includeDetails ? SELECT_COLS_FULL : SELECT_COLS_MID

  const baslangicUTC = filters.raporBaslangic ? new Date(filters.raporBaslangic + 'T00:00:00+03:00').toISOString() : null
  const bitisUTC = filters.raporBitis ? new Date(filters.raporBitis + 'T23:59:59+03:00').toISOString() : null

  function buildGorevQuery(table: string) {
    let q = admin.from(table).select(SELECT_COLS).eq('firma_id', filters.firmaId)
    if (filters.projeId) q = (q as any).eq('proje_id', filters.projeId)
    if (targetLokasyonIds && targetLokasyonIds.length > 0) q = q.in('lokasyon_id', targetLokasyonIds)
    if (baslangicUTC) q = q.gte('aktif_olma_tarihi', baslangicUTC)
    if (bitisUTC) q = q.lte('aktif_olma_tarihi', bitisUTC)
    return q
  }

  const [aktifGorevler, arsivGorevler] = await Promise.all([
    fetchAll(() => buildGorevQuery('canli_gorevler')),
    fetchAll(() => buildGorevQuery('canli_gorevler_arsiv')),
  ])

  // Birleştir, çakışan id varsa aktif tablosu öncelikli
  const arsivMap = new Map((arsivGorevler ?? []).map((g: any) => [g.id, g]))
  for (const g of (aktifGorevler ?? [])) arsivMap.set((g as any).id, g)
  // Vardiya filtresi — aktif_olma_tarihi'nin TR saatine göre filtreler.
  const vardiya = filters.vardiya ?? 'all'
  const vardiyaRange: { from: number; to: number } | null =
    vardiya === 'v1' ? { from: 0, to: 8 } :
    vardiya === 'v2' ? { from: 8, to: 16 } :
    vardiya === 'v3' ? { from: 16, to: 24 } : null
  function isInShift(iso: string | null | undefined): boolean {
    if (!vardiyaRange) return true
    if (!iso) return false
    const h = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false,
    }).format(new Date(iso)))
    return h >= vardiyaRange.from && h < vardiyaRange.to
  }
  const tumGorevler = Array.from(arsivMap.values()).filter((g: any) =>
    withinRange(g.aktif_olma_tarihi, filters.raporBaslangic, filters.raporBitis)
    && isInShift(g.aktif_olma_tarihi)
  )

  // KURAL ÜRETİMLİ vs EKSTRA FREKANSİYEL AYRIMI
  //   kural_id IS NOT NULL → kural tarafından üretilmiş frekansiyel görev (hedef hesabına girer)
  //   kural_id IS NULL     → mobilden eklenen ekstra frekansiyel (hedefe girmez, tamamlanan'a eklenir)
  const kuralGorevler  = tumGorevler.filter((g: any) => g.kural_id != null)
  const ekstraGorevler = tumGorevler.filter((g: any) => g.kural_id == null)

  // 4. Kullanıcı isimleri + proje personel ID seti
  //    Hem detay liste row'larında personel adı/filtresi için, hem de özet
  //    sayfası agg'lerinde (en aktif personel grafiği vb.) gerekli.
  const userMap = new Map<string, string>()
  let projePersonelIds: Set<string> | null = null
  const userIds = Array.from(new Set(tumGorevler.flatMap((g: any) =>
    [g.atanan_kullanici_id, g.tamamlayan_kullanici_id, g.islemi_yapan_id].filter(Boolean)
  )))
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('users')
      .select('id,isim_soyisim')
      .in('id', userIds)
    for (const u of users ?? []) userMap.set((u as any).id, (u as any).isim_soyisim ?? '')
  }
  if (filters.projeId) {
    const { data: projeUsers } = await admin.from('users').select('id').eq('proje_id', filters.projeId).eq('aktif', true)
    projePersonelIds = new Set((projeUsers ?? []).map((u: any) => u.id))
  }

  // Üst lokasyon yöneticileri — başarı analizinden hariç tutulur
  const yoneticiIds = await getUstLokasyonYetkiliUserIds(filters.firmaId)

  // Proje ayarı: islem_sureleri_aktif (false ise UI Görev/İşlem Saatleri ve Süresi sütunlarını gizler)
  const efektifAyar = await getEfektifAyar(filters.firmaId, filters.projeId)
  const islemSureleriAktif = efektifAyar.islem_sureleri_aktif !== false

  // 5. Lokasyon grupları
  let grupQ = admin
    .from('lokasyon_gruplari')
    .select('id,ad,ust_lokasyon_id')
    .eq('firma_id', filters.firmaId)
    .eq('aktif', true)
  if (filters.projeId) grupQ = (grupQ as any).eq('proje_id', filters.projeId)
  const { data: gruplar } = await grupQ

  const { data: grupUyeler } = await admin
    .from('lokasyon_grup_uyeleri')
    .select('grup_id,lokasyon_id')
    .in('grup_id', (gruplar ?? []).map((g: any) => g.id))

  const grupLokMap = new Map<string, string[]>() // grup_id -> lokasyon_id[]
  for (const u of grupUyeler ?? []) {
    const arr = grupLokMap.get((u as any).grup_id) ?? []
    arr.push((u as any).lokasyon_id)
    grupLokMap.set((u as any).grup_id, arr)
  }

  // 6. Günlük frekans sayısını lokasyon bazında hesapla (lokasyonda görev sayısı / gün sayısı)
  const gunSayisi = daysBetween(filters.raporBaslangic, filters.raporBitis)

  // Her lokasyon için görev sayısı ve günlük frekans toplamını hesapla.
  // Doğru günlük frekans hesabı:
  //   Frekans görevleri: her (lokasyon, gün) çifti için gunluk_frekans_sayisi değerini bir kez say.
  //   Aynı lokasyon aynı gün N görev → gunluk_frekans_sayisi = N → günlük o lokasyonda N frekans var.
  //   Unique (lokasyon, tarih) → gunluk_frekans_sayisi al → toplam günlük frekans.
  //   Tekil görevler (gunluk_frekans_sayisi=0): hedef'e 1 olarak eklenir.
  //
  //   Örnek: BAYAN WC lokasyonu, 11 gün, günlük 6 frekans
  //   DB'de 66 görev var, her birinde gunluk_frekans_sayisi=6
  //   Unique tarihler: 11 adet, her birinde 6 frekans → günlük toplam = 6

  // Map<lokasyon_id, Map<tarih_str, gfs>> — unique (lokasyon, tarih) başına gfs
  const lokGunFrekans = new Map<string, Map<string, number>>()

  const lokGorevCount = new Map<string, {
    gunlukFrekansToplamı: number   // unique (lokasyon, gün) toplamı
    tamamlanan: number
    sapma: number
    kayip: number
  }>()

  // Metric hesabı SADECE kural-üretimli görevler üzerinden yapılır.
  // Ekstra frekansiyel (kural_id IS NULL) hedef/kayıp hesabına girmez.
  for (const g of kuralGorevler) {
    const lid = (g as any).lokasyon_id
    if (!lid) continue
    if (!lokGorevCount.has(lid)) lokGorevCount.set(lid, { gunlukFrekansToplamı: 0, tamamlanan: 0, sapma: 0, kayip: 0 })
    const entry = lokGorevCount.get(lid)!
    const gfs = (g as any).gunluk_frekans_sayisi ?? 0

    if (gfs > 0) {
      // gfs değerini lokasyon+tanim bazlı sakla — grup hesabında kullanılacak
      const tanim = (g as any).tanim ?? ''
      const tanımKey = `${lid}::${tanim}`
      if (!lokGunFrekans.has(lid)) lokGunFrekans.set(lid, new Map())
      const gunMap = lokGunFrekans.get(lid)!
      if (!gunMap.has(tanımKey)) {
        gunMap.set(tanımKey, gfs)
      }
    }

    const durum = (g as any).durum
    // Durum → Kategori (gfs değerinden bağımsız, her görev bir kez sayılır):
    // TAMAMLANDI                                → tamamlanan
    // ZAMANINDA_YAPILAMAYAN                     → sapma
    // ZAMANI_GECMIS, IPTAL, SILINDI, BEKLEMEDE → kayıp
    // HAZIR, ACIK, ISLEMDE                      → hedef'e girer (hazirAcik), kategoriye girmez
    if (durum === 'TAMAMLANDI') entry.tamamlanan++
    else if (durum === 'ZAMANINDA_YAPILAMAYAN') entry.sapma++
    else if (durum === 'ZAMANI_GECMIS' || durum === 'IPTAL' || durum === 'SILINDI' || durum === 'BEKLEMEDE') entry.kayip++
  }

  // EKSTRA FREKANSİYEL: lokasyon başına tamamlanan ekstra sayısı (rapor özetinde gösterilir)
  const lokEkstraCount = new Map<string, number>()
  for (const g of ekstraGorevler) {
    if ((g as any).durum !== 'TAMAMLANDI') continue
    const lid = (g as any).lokasyon_id
    if (!lid) continue
    lokEkstraCount.set(lid, (lokEkstraCount.get(lid) ?? 0) + 1)
  }
  // Günlük frekans = günlükFrekansToplamı / gunSayisi
  // (11 gün × 6/gün = 66 → toplam 66 kayıt, 66/11 = 6 günlük frekans)

  // 7. Grup metrikleri
  const grupMetrikleri: GrupMetrik[] = []

  // Bir lokasyon ID kümesi için aggregate metrik hesapla ve GrupMetrik satırı döndür
  function buildRowForLokSet(
    grupAd: string,
    ids: string[],
    lokTanim: string,
    ustLokasyon: string,
  ): GrupMetrik | null {
    let tamamlanan = 0, sapma = 0, kayip = 0, ekstra = 0
    for (const id of ids) {
      const e = lokGorevCount.get(id)
      if (!e) continue
      tamamlanan += e.tamamlanan
      sapma      += e.sapma
      kayip      += e.kayip
      ekstra     += lokEkstraCount.get(id) ?? 0
    }
    // Vardiya frekans: lokasyonlar tablosundaki gunluk_frekans_sayisi toplamı
    let gunlukFrekans = 0
    for (const id of ids) {
      const lok = lokMap.get(id) as any
      if (lok?.gunluk_frekans_sayisi) gunlukFrekans += lok.gunluk_frekans_sayisi
    }
    // Hazır/Açık/İşlemde sadece kural-üretimli görevlerden sayılır
    const hazirAcik = (kuralGorevler as any[]).filter((g: any) =>
      ids.includes(g.lokasyon_id) && (g.durum === 'HAZIR' || g.durum === 'ACIK' || g.durum === 'ISLEMDE')
    ).length
    const hedef = tamamlanan + sapma + kayip + hazirAcik
    // Fallback: lokasyonda frekans tanımlı değilse görevlerden hesapla
    if (gunlukFrekans === 0 && hedef > 0) {
      gunlukFrekans = gunSayisi > 0 ? Math.round(hedef / gunSayisi) : hedef
    }
    // Unique görev tanımı sayısı (kural sayısı) — sadece kural-üretimli görevler
    const taninCounts = new Map<string, number>()
    for (const g of kuralGorevler) {
      if (ids.includes((g as any).lokasyon_id)) {
        const t = (g as any).tanim ?? ''
        if (t) taninCounts.set(t, (taninCounts.get(t) ?? 0) + 1)
      }
    }
    const kuralSayisi = taninCounts.size
    const gorevTanimi = taninCounts.size > 0
      ? Array.from(taninCounts.entries()).sort((a, b) => b[1] - a[1])[0][0] : ''
    // Başarı = (kural tamamlanan + ekstra) / hedef → ekstra başarıyı ARTIRIR, hedefi değiştirmez
    const gerceklesen = tamamlanan + ekstra
    const basariOran = hedef > 0 ? Math.round((gerceklesen / hedef) * 100) : 0
    const genelOran  = hedef > 0 ? Math.round(((gerceklesen + sapma) / hedef) * 100) : 0
    return {
      grup: grupAd, ustLokasyon, lokasyon: lokTanim, gorevTanimi,
      gunlukFrekans, kuralSayisi, hedef, tamamlanan, sapma, kayip, ekstra,
      basariOrani: `%${basariOran}`, genelOran: `%${genelOran}`,
    }
  }

  // ÜST LOKASYON sütununa yazılacak değer: hangi filtre seçiliyse onun adı
  const grupUstLokLabel: string = filters.altAltLokasyonId
    ? ((lokMap.get(filters.altAltLokasyonId) as any)?.tanim ?? '')
    : filters.altLokasyonId
      ? ((lokMap.get(filters.altLokasyonId) as any)?.tanim ?? '')
      : filters.ustLokasyonId
        ? ((lokMap.get(filters.ustLokasyonId) as any)?.tanim ?? '')
        : 'Tümü'

  for (const grup of gruplar ?? []) {
    const lokIds = grupLokMap.get((grup as any).id) ?? []
    const grupAd = (grup as any).ad ?? ''

    if (targetLokasyonIds) {
      // Herhangi bir lokasyon filtresi aktif:
      // filteredLokIds = grup üyelerinden targetLokasyonIds kapsamındakiler
      // Her biri ayrı satır — ustLokasyon = seçili filtre adı, lokasyon = üyenin kendi adı
      const filteredLokIds = lokIds.filter(id => targetLokasyonIds!.includes(id))
      if (filteredLokIds.length === 0) continue
      for (const lid of filteredLokIds) {
        const lokTanim = (lokMap.get(lid) as any)?.tanim ?? ''
        const row = buildRowForLokSet(grupAd, [lid], lokTanim, grupUstLokLabel)
        if (row) grupMetrikleri.push(row)
      }
    } else {
      // Filtre yok: grup başına tek satır (tüm lokasyonlar aggregate)
      if (lokIds.length === 0) continue
      const row = buildRowForLokSet(grupAd, lokIds, 'Tümü', 'Tümü')
      if (row) grupMetrikleri.push(row)
    }
  }

  // Filtre yok: aynı isimli grupları birleştir
  if (!filters.ustLokasyonId && !filters.altLokasyonId) {
    const birlesik = new Map<string, GrupMetrik>()
    for (const gm of grupMetrikleri) {
      const m = birlesik.get(gm.grup)
      if (!m) {
        birlesik.set(gm.grup, { ...gm })
      } else {
        const yH = m.hedef + gm.hedef, yT = m.tamamlanan + gm.tamamlanan
        const yS = m.sapma + gm.sapma,  yK = m.kayip + gm.kayip, yG = m.gunlukFrekans + gm.gunlukFrekans
        const yE = m.ekstra + gm.ekstra
        const yKS = m.kuralSayisi + gm.kuralSayisi
        const yGer = yT + yE
        birlesik.set(gm.grup, {
          grup: gm.grup, ustLokasyon: 'Tümü', lokasyon: 'Tümü',
          gorevTanimi: m.gorevTanimi || gm.gorevTanimi,
          gunlukFrekans: yG, kuralSayisi: yKS, hedef: yH, tamamlanan: yT, sapma: yS, kayip: yK, ekstra: yE,
          basariOrani: `%${yH > 0 ? Math.round(yGer / yH * 100) : 0}`,
          genelOran:   `%${yH > 0 ? Math.round((yGer + yS) / yH * 100) : 0}`,
        })
      }
    }
    grupMetrikleri.length = 0
    grupMetrikleri.push(...Array.from(birlesik.values()))
  }

  // Grup yoksa genel toplamı göster
  if (grupMetrikleri.length === 0) {
    let hedef = 0, tamamlanan = 0, sapma = 0, kayip = 0
    // Hedef/kayıp/sapma: sadece kural-üretimli görevler üzerinden
    for (const g of kuralGorevler) {
      const durum = (g as any).durum
      hedef++
      if (durum === 'TAMAMLANDI') tamamlanan++
      else if (durum === 'ZAMANINDA_YAPILAMAYAN') sapma++
      else if (durum === 'ZAMANI_GECMIS' || durum === 'IPTAL' || durum === 'SILINDI' || durum === 'BEKLEMEDE') kayip++
      // HAZIR, ACIK, ISLEMDE: hedefe girer ama kategoriye girmez
    }
    // Ekstra: tüm tamamlanan ekstra frekansiyeller
    const ekstra = ekstraGorevler.filter((g: any) => g.durum === 'TAMAMLANDI').length
    if (hedef > 0 || ekstra > 0) {
      // Lokasyonlar tablosundan frekans topla
      const gorevLokIds = new Set(kuralGorevler.map((g: any) => g.lokasyon_id).filter(Boolean))
      let lokFrekTop = 0
      for (const lid of gorevLokIds) {
        const lok = lokMap.get(lid) as any
        if (lok?.gunluk_frekans_sayisi > 0) { lokFrekTop += lok.gunluk_frekans_sayisi }
      }
      const gerceklesen = tamamlanan + ekstra
      grupMetrikleri.push({
        grup: 'Genel',
        ustLokasyon: '',
        lokasyon: ustLokTanim || altLokTanim || 'Tüm Lokasyonlar',
        gunlukFrekans: lokFrekTop > 0 ? lokFrekTop : Math.round(hedef / gunSayisi),
        kuralSayisi: new Set(kuralGorevler.map((g: any) => g.tanim).filter(Boolean)).size,
        hedef,
        tamamlanan,
        sapma,
        kayip,
        ekstra,
        basariOrani: `%${hedef > 0 ? Math.round((gerceklesen / hedef) * 100) : 0}`,
        genelOran:   `%${hedef > 0 ? Math.round(((gerceklesen + sapma) / hedef) * 100) : 0}`,
        gorevTanimi: '',
      })
    }
  }

  // 8. Özet toplamlar
  // Hedef = kural-üretimli görevler (kural_id IS NOT NULL) — duruma bakılmaz
  // Tamamlanan = kural tamamlanan + ekstra tamamlanan (başarıya katılır)
  // Ekstra     = kural_id IS NULL olan ve TAMAMLANDI — hedefi değiştirmez, başarı oranını artırır
  // Sapma/Kayıp = sadece kural-üretimli
  const toplamGorev          = kuralGorevler.length
  const toplamTamamlananKural = kuralGorevler.filter((g: any) => g.durum === 'TAMAMLANDI').length
  const toplamEkstra         = ekstraGorevler.filter((g: any) => g.durum === 'TAMAMLANDI').length
  const toplamTamamlanan     = toplamTamamlananKural + toplamEkstra
  const toplamSapma          = kuralGorevler.filter((g: any) => g.durum === 'ZAMANINDA_YAPILAMAYAN').length
  const toplamKayip          = kuralGorevler.filter((g: any) =>
    g.durum === 'ZAMANI_GECMIS' || g.durum === 'IPTAL' || g.durum === 'SILINDI' || g.durum === 'BEKLEMEDE'
  ).length
  // Başarı: ekstra dahil tamamlanan / hedef → ekstra varsa %100'ü geçebilir (örn %115)
  const genelBasari  = toplamGorev > 0 ? Math.round((toplamTamamlanan / toplamGorev) * 100) : 0

  // 9. Tamamlanan görevler (sadece kural-üretimli — ekstra olanlar Frekans Dışı bölümünde)
  // NOT: Yönetici filtresi liste seviyesinde YAPILMAZ — denetim listesi tüm satırları
  // göstermeli. Yönetici filtresi sadece "personel başarı sıralaması" agg'lerinde
  // (frontend Özet & Grafikler sekmesi) uygulanır — response'taki yoneticiIds set'i
  // kullanılır.
  const tamamlananGorevler: TamamlananRow[] = !includeDetails ? [] : kuralGorevler
    .filter((g: any) => g.durum === 'TAMAMLANDI')
    // En son tamamlanan üstte
    .sort((a: any, b: any) => tsMs(b.tamamlanma_tarihi ?? b.durum_degisim_tarihi) - tsMs(a.tamamlanma_tarihi ?? a.durum_degisim_tarihi))
    .map((g: any, i: number) => {
      const lok = lokMap.get(g.lokasyon_id) as any
      const kullaniciId = g.islemi_yapan_id ?? g.tamamlayan_kullanici_id ?? g.atanan_kullanici_id ?? ''
      const isProjePersonel = !projePersonelIds || projePersonelIds.has(kullaniciId)
      const kullanici = isProjePersonel ? (userMap.get(kullaniciId) ?? '') : ''
      return {
        sn: i + 1,
        personel: kullanici,
        personelId: kullaniciId || null,
        ustLokasyon: getContextUstLokasyon(g.lokasyon_id),
        lokasyon: lok?.tanim ?? '',
        gorevNo: g.id?.slice(-8)?.toUpperCase() ?? '',
        gorevTanimi: g.tanim ?? '',
        tarihSaat: formatDate(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        tarih: formatTarihTR(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        gorevSaatleri: formatGorevSaatleri(g.baslatilma_tarihi, g.tamamlanma_tarihi),
        gorevSuresi: formatGorevSuresi(g.tamamlanma_suresi_saniye),
        durum: 'TAMAMLANDI',
      }
    })

  // 10. Sapma görevleri (sadece kural-üretimli — ekstra'da sapma olmaz)
  // Sapma: sadece ZAMANINDA_YAPILAMAYAN. Yönetici filtresi liste'de YOK (denetim).
  const sapmaGorevler: SapmaRow[] = !includeDetails ? [] : kuralGorevler
    .filter((g: any) => g.durum === 'ZAMANINDA_YAPILAMAYAN')
    .sort((a: any, b: any) => tsMs(b.tamamlanma_tarihi ?? b.durum_degisim_tarihi) - tsMs(a.tamamlanma_tarihi ?? a.durum_degisim_tarihi))
    .map((g: any, i: number) => {
      const lok = lokMap.get(g.lokasyon_id) as any
      const kullaniciIdS = g.islemi_yapan_id ?? g.atanan_kullanici_id ?? ''
      const isProjePersonelS = !projePersonelIds || projePersonelIds.has(kullaniciIdS)
      const kullanici = isProjePersonelS ? (userMap.get(kullaniciIdS) ?? '') : ''
      const sapmaNedeni = g.durum === 'BEKLEMEDE' ? 'Zamanında tamamlanamadı' : 'Gecikme ile tamamlandı'
      return {
        sn: i + 1,
        personel: kullanici,
        personelId: kullaniciIdS || null,
        ustLokasyon: getContextUstLokasyon(g.lokasyon_id),
        lokasyon: lok?.tanim ?? '',
        gorevNo: g.id?.slice(-8)?.toUpperCase() ?? '',
        gorevTanimi: g.tanim ?? '',
        tarihSaat: formatDate(g.durum_degisim_tarihi ?? g.aktif_olma_tarihi),
        tarih: formatTarihTR(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        gorevSaatleri: formatGorevSaatleri(g.baslatilma_tarihi, g.tamamlanma_tarihi),
        gorevSuresi: formatGorevSuresi(g.tamamlanma_suresi_saniye),
        sapmaNedeni,
      }
    })

  // 10b. Kayıp görevler: ZAMANI_GECMIS, IPTAL, SILINDI, BEKLEMEDE
  const KAYIP_HARIC_DURUMLAR = new Set(['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'HAZIR', 'ACIK', 'ISLEMDE'])
  const durumLabel: Record<string, string> = {
    HAZIR: 'Hazır', ACIK: 'Açık', BEKLEMEDE: 'Beklemede',
    ZAMANI_GECMIS: 'Zamanı Geçmiş', IPTAL: 'İptal', KAPATILDI: 'Kapatıldı', SILINDI: 'Silindi',
  }
  const kayipNedeniLabel: Record<string, string> = {
    ZAMANI_GECMIS: 'Süre aşıldı, gerçekleşmedi',
    IPTAL: 'Sebep belirtilmedi',  // sadece iptal_sebep null ise fallback olarak görünür
    SILINDI: 'Kayıt silindi',
    BEKLEMEDE: 'Beklemede kaldı',
    KAPATILDI: 'Kapatıldı',
  }
  // Kayıp görevler: sadece kural-üretimli (ekstra'da kayıp olmaz, TAMAMLANDI olarak açılır)
  const kayipGorevler: KayipRow[] = !includeDetails ? [] : kuralGorevler
    .filter((g: any) => !KAYIP_HARIC_DURUMLAR.has(g.durum))
    // En son durumu değişen üstte (kayıp = yapılamamış, son aksiyon zamanı önemli)
    .sort((a: any, b: any) => tsMs(b.durum_degisim_tarihi ?? b.aktif_olma_tarihi) - tsMs(a.durum_degisim_tarihi ?? a.aktif_olma_tarihi))
    .map((g: any, i: number) => {
      const lok = lokMap.get(g.lokasyon_id) as any
      const iptalSebep = typeof g.iptal_sebep === 'string' ? g.iptal_sebep.trim() : ''
      const kayipNedeni = (g.durum === 'IPTAL' && iptalSebep)
        ? iptalSebep
        : (kayipNedeniLabel[g.durum] ?? g.durum)
      return {
        sn: i + 1,
        ustLokasyon: getContextUstLokasyon(g.lokasyon_id),
        lokasyon: lok?.tanim ?? '',
        gorevNo: g.id?.slice(-8)?.toUpperCase() ?? '',
        gorevTanimi: g.tanim ?? '',
        tarihSaat: formatDate(g.aktif_olma_tarihi),
        // Kayıp görevlerin çoğu tamamlanmamış — tarih = aktif olma günü, görev saatleri/süresi varsa göster
        tarih: formatTarihTR(g.durum_degisim_tarihi ?? g.aktif_olma_tarihi),
        gorevSaatleri: formatGorevSaatleri(g.baslatilma_tarihi, g.tamamlanma_tarihi),
        gorevSuresi: formatGorevSuresi(g.tamamlanma_suresi_saniye),
        durum: durumLabel[g.durum] ?? g.durum,
        kayipNedeni,
      }
    })

  // 11. Frekans dışı görevler — mobilden eklenen EKSTRA FREKANSİYEL
  // (canli_gorevler WHERE kural_id IS NULL AND durum = 'TAMAMLANDI')
  // Spesifik görevler (gorevler tablosu) bu rapora dahil değildir.
  const frekansDisiGorevler: FrekansDisiRow[] = []
  if (includeDetails) {
    // Lokasyon → grup adı / üst lokasyon haritası
    const lokGrupMap = new Map<string, string>()
    const lokUstMap  = new Map<string, string>()
    for (const [grupId, lokIds] of grupLokMap) {
      const grup = (gruplar ?? []).find((g: any) => g.id === grupId) as any
      for (const lid of lokIds) {
        if (grup) lokGrupMap.set(lid, grup.ad ?? '')
        let cur = lokMap.get(lid) as any
        let ust = cur
        while (cur?.parent_id) { cur = lokMap.get(cur.parent_id) as any; if (cur) ust = cur }
        lokUstMap.set(lid, ust?.tanim ?? '')
      }
    }

    const ekstraTamamlanan = ekstraGorevler.filter((g: any) => g.durum === 'TAMAMLANDI')
    // Ekstra görevleri kullanan personel id'lerini topla (userMap'te eksik olanlar için)
    const ekstraUserIds = Array.from(new Set(
      ekstraTamamlanan.flatMap((g: any) =>
        [g.islemi_yapan_id, g.tamamlayan_kullanici_id].filter(Boolean)
      )
    ))
    const missingEkstraUserIds = ekstraUserIds.filter(id => !userMap.has(id))
    if (missingEkstraUserIds.length > 0) {
      const { data: eu } = await admin.from('users').select('id,isim_soyisim').in('id', missingEkstraUserIds)
      for (const u of eu ?? []) userMap.set((u as any).id, (u as any).isim_soyisim ?? '')
    }

    // En son tamamlanan üstte
    ekstraTamamlanan.sort((a: any, b: any) => tsMs(b.tamamlanma_tarihi ?? b.durum_degisim_tarihi) - tsMs(a.tamamlanma_tarihi ?? a.durum_degisim_tarihi))
    ekstraTamamlanan.forEach((g: any, i: number) => {
      const lok = lokMap.get(g.lokasyon_id) as any
      const personelId = g.islemi_yapan_id ?? g.tamamlayan_kullanici_id ?? ''
      // Ekstra görevler anlık (başlatma=tamamlama=aktif, süre 0). Saatler/Süre alanlarına
      // standart format yerine "Ekstra" gösteriyoruz — frontend bunu badge olarak render edebilir
      // veya plain text olarak gösterir (string olduğu için tüketici esnek davranır).
      frekansDisiGorevler.push({
        sn: i + 1,
        ustLokasyon: lokUstMap.get(g.lokasyon_id) ?? '',
        grupTanimi: lokGrupMap.get(g.lokasyon_id) ?? '',
        lokasyonTanimi: lok?.tanim ?? '',
        personel: userMap.get(personelId) ?? '',
        tarihSaat: formatDate(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        tarih: formatTarihTR(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        gorevSaatleri: formatGorevSaatleri(g.baslatilma_tarihi, g.tamamlanma_tarihi),
        gorevSuresi: 'Ekstra',
        aciklama: g.tanim ?? '',
      })
    })
  }

  // 12. Atanan frekanslar: atanan_kullanici_id dolu olan tüm canli_gorevler
  let atananFrekanslar: AtananFrekanRow[] = []
  if (includeDetails) {
    const durumTurkce: Record<string, string> = {
      HAZIR: 'Hazır', ACIK: 'Açık', BEKLEMEDE: 'Beklemede', ISLEMDE: 'İşlemde',
      TAMAMLANDI: 'Tamamlandı', ZAMANINDA_YAPILAMAYAN: 'Zamanında Yapılamayan',
      ZAMANI_GECMIS: 'Zamanı Geçmiş', IPTAL: 'İptal', KAPATILDI: 'Kapatıldı', SILINDI: 'Silindi',
    }

    // Tüm atanan kullanıcı id'lerini userMap'e ekle (eksik varsa toplu çek)
    const atananIds = Array.from(new Set(
      tumGorevler.filter((g: any) => g.atanan_kullanici_id).map((g: any) => g.atanan_kullanici_id as string)
    ))
    const missingIds = atananIds.filter(id => !userMap.has(id))
    if (missingIds.length > 0) {
      const { data: extraUsers } = await admin.from('users').select('id,isim_soyisim').in('id', missingIds)
      for (const u of extraUsers ?? []) userMap.set((u as any).id, (u as any).isim_soyisim ?? '')
    }

    // Atanan Frekanslar: sadece kural-üretimli (ekstra atanamaz)
    atananFrekanslar = kuralGorevler
      .filter((g: any) => g.atanan_kullanici_id)
      .sort((a: any, b: any) => new Date(b.olusturma_tarihi ?? 0).getTime() - new Date(a.olusturma_tarihi ?? 0).getTime())
      .map((g: any, i: number) => {
        const lok = lokMap.get(g.lokasyon_id) as any
        const tamamlayanId = g.islemi_yapan_id ?? g.tamamlayan_kullanici_id ?? ''
        return {
          sn: i + 1,
          atanan: userMap.get(g.atanan_kullanici_id) ?? '—',
          tamamlayan: tamamlayanId ? (userMap.get(tamamlayanId) ?? '—') : '—',
          ustLokasyon: getContextUstLokasyon(g.lokasyon_id),
          lokasyon: lok?.tanim ?? '—',
          gorevTanimi: g.tanim ?? '—',
          gorevDurumu: durumTurkce[g.durum] ?? g.durum ?? '—',
          durumKod: g.durum ?? '',
          atamaTarihi: formatDate(g.olusturma_tarihi),
          tamamlanmaTarihi: g.tamamlanma_tarihi ? formatDate(g.tamamlanma_tarihi) : '—',
        }
      })
  }

  // 13. Özet & Grafikler sekmesi için agg'ler — frontend artık detay listelerden değil
  //     burayı kullanır. Detay listeler lazy load olduğu için boş gelir, özet bozulurdu.
  const yoneticiSet = yoneticiIds
  const kayipNedeniLabelInline: Record<string, string> = {
    ZAMANI_GECMIS: 'Süre aşıldı, gerçekleşmedi', IPTAL: 'Sebep belirtilmedi',
    SILINDI: 'Kayıt silindi', BEKLEMEDE: 'Beklemede kaldı', KAPATILDI: 'Kapatıldı',
  }
  function ustLokAd(lokId: string | null | undefined): string {
    if (!lokId) return '—'
    let cur = lokMap.get(lokId) as any
    let safety = 0
    while (cur?.parent_id && safety < 20) { cur = lokMap.get(cur.parent_id) as any; safety++ }
    return cur?.tanim ?? '—'
  }
  const ozetAgg: OzetAgg = {
    departmanMetrikleri: [],
    personelTamamlananTop: [],
    lokasyonTamamlananTop: [],
    kayipNedeniDagilim: [],
    sapmaNedeniDagilim: [],
    kayipLokasyonTop: [],
    sapmaLokasyonTop: [],
    atananPersonelBasari: [],
  }
  {
    // Departman Analizi — üst lokasyon (parent_id IS NULL) bazlı.
    // Görev olmayan üst lokasyonlar da 0 değerleriyle dahil edilir (kullanıcı her
    // departmanı görmek istiyor; boş çubuklar departmanın atıl olduğunu gösterir).
    // U/M yetki scope: yetkiliUstLokIds verilmişse sadece o departmanlar listelenir.
    const yetkiliSet = filters.yetkiliUstLokIds && filters.yetkiliUstLokIds.length > 0
      ? new Set(filters.yetkiliUstLokIds)
      : null
    const departmanAgg = new Map<string, DepartmanMetrik>()
    for (const l of (lokasyonlar ?? []) as any[]) {
      if (l.parent_id) continue
      if (l.aktif === false) continue
      if (yetkiliSet && !yetkiliSet.has(l.id)) continue
      departmanAgg.set(l.id, {
        ustLokasyonId: l.id, ustLokasyonAd: l.tanim ?? '—',
        hedef: 0, tamamlanan: 0, sapma: 0, kayip: 0,
      })
    }
    for (const g of kuralGorevler) {
      const lokId = (g as any).lokasyon_id
      if (!lokId) continue
      let cur = lokMap.get(lokId) as any
      let safety = 0
      while (cur?.parent_id && safety < 20) { cur = lokMap.get(cur.parent_id) as any; safety++ }
      const ustId = cur?.id
      if (!ustId) continue
      if (!departmanAgg.has(ustId)) {
        // Pasif veya beklenmeyen bir üst lokasyon — yine de görünsün
        departmanAgg.set(ustId, {
          ustLokasyonId: ustId, ustLokasyonAd: cur?.tanim ?? '—',
          hedef: 0, tamamlanan: 0, sapma: 0, kayip: 0,
        })
      }
      const m = departmanAgg.get(ustId)!
      m.hedef++
      const d = (g as any).durum
      if (d === 'TAMAMLANDI') m.tamamlanan++
      else if (d === 'ZAMANINDA_YAPILAMAYAN') m.sapma++
      else if (d === 'ZAMANI_GECMIS' || d === 'IPTAL' || d === 'SILINDI' || d === 'BEKLEMEDE' || d === 'KAPATILDI') m.kayip++
    }
    // Görev olanlar önce (hedef desc), sonra boşlar (alfabetik)
    ozetAgg.departmanMetrikleri = [...departmanAgg.values()].sort((a, b) => {
      if (a.hedef !== b.hedef) return b.hedef - a.hedef
      return a.ustLokasyonAd.localeCompare(b.ustLokasyonAd, 'tr')
    })
  }
  {
    const persSayac = new Map<string, number>()
    const lokSayac = new Map<string, number>()
    for (const g of kuralGorevler) {
      if ((g as any).durum !== 'TAMAMLANDI') continue
      const lokId = (g as any).lokasyon_id
      const lok = lokMap.get(lokId) as any
      const ust = ustLokAd(lokId)
      const personelId = (g as any).islemi_yapan_id ?? (g as any).tamamlayan_kullanici_id
      // Personel agg: boş personel atlanır, yönetici filtrelenir, proje dışı kişiler dahil edilmez
      if (personelId && !yoneticiSet.has(personelId)) {
        const isProje = !projePersonelIds || projePersonelIds.has(personelId)
        if (isProje) {
          const isim = userMap.get(personelId)
          if (isim) {
            const key = `${ust} - ${isim}`
            persSayac.set(key, (persSayac.get(key) ?? 0) + 1)
          }
        }
      }
      // Lokasyon agg
      const lokKey = `${ust} - ${lok?.tanim ?? 'Bilinmiyor'}`
      lokSayac.set(lokKey, (lokSayac.get(lokKey) ?? 0) + 1)
    }
    ozetAgg.personelTamamlananTop = [...persSayac.entries()].map(([key, sayi]) => ({ key, sayi })).sort((a, b) => b.sayi - a.sayi).slice(0, 10)
    ozetAgg.lokasyonTamamlananTop = [...lokSayac.entries()].map(([key, sayi]) => ({ key, sayi })).sort((a, b) => b.sayi - a.sayi).slice(0, 10)
  }
  {
    const kayipNedenSayac = new Map<string, number>()
    const kayipLokSayac = new Map<string, number>()
    for (const g of kuralGorevler) {
      const d = (g as any).durum
      if (d === 'TAMAMLANDI' || d === 'ZAMANINDA_YAPILAMAYAN' || d === 'HAZIR' || d === 'ACIK' || d === 'ISLEMDE') continue
      // Kayıp neden
      const iptalSebep = typeof (g as any).iptal_sebep === 'string' ? (g as any).iptal_sebep.trim() : ''
      const neden = (d === 'IPTAL' && iptalSebep) ? iptalSebep : (kayipNedeniLabelInline[d] ?? d)
      kayipNedenSayac.set(neden, (kayipNedenSayac.get(neden) ?? 0) + 1)
      // Kayıp lokasyon
      const lokId = (g as any).lokasyon_id
      const lok = lokMap.get(lokId) as any
      const ust = ustLokAd(lokId)
      const key = `${ust} - ${lok?.tanim ?? 'Bilinmiyor'}`
      kayipLokSayac.set(key, (kayipLokSayac.get(key) ?? 0) + 1)
    }
    ozetAgg.kayipNedeniDagilim = [...kayipNedenSayac.entries()].map(([neden, sayi]) => ({ neden, sayi })).sort((a, b) => b.sayi - a.sayi)
    ozetAgg.kayipLokasyonTop = [...kayipLokSayac.entries()].map(([key, sayi]) => ({ key, sayi })).sort((a, b) => b.sayi - a.sayi).slice(0, 10)
  }
  {
    const sapmaNedenSayac = new Map<string, number>()
    const sapmaLokSayac = new Map<string, number>()
    for (const g of kuralGorevler) {
      if ((g as any).durum !== 'ZAMANINDA_YAPILAMAYAN') continue
      const neden = 'Gecikme ile tamamlandı'  // tek sebep (mevcut FE mantığı ile aynı)
      sapmaNedenSayac.set(neden, (sapmaNedenSayac.get(neden) ?? 0) + 1)
      const lokId = (g as any).lokasyon_id
      const lok = lokMap.get(lokId) as any
      const ust = ustLokAd(lokId)
      const key = `${ust} - ${lok?.tanim ?? 'Bilinmiyor'}`
      sapmaLokSayac.set(key, (sapmaLokSayac.get(key) ?? 0) + 1)
    }
    ozetAgg.sapmaNedeniDagilim = [...sapmaNedenSayac.entries()].map(([neden, sayi]) => ({ neden, sayi })).sort((a, b) => b.sayi - a.sayi)
    ozetAgg.sapmaLokasyonTop = [...sapmaLokSayac.entries()].map(([key, sayi]) => ({ key, sayi })).sort((a, b) => b.sayi - a.sayi).slice(0, 10)
  }
  {
    // Atanan personel başarı: atanan_kullanici_id NOT NULL olan kural görevleri
    const persMap = new Map<string, { atanan: number; tamamlanan: number; sapma: number; kayip: number; aktif: number }>()
    for (const g of kuralGorevler) {
      const atananId = (g as any).atanan_kullanici_id
      if (!atananId) continue
      const isim = userMap.get(atananId) ?? 'Atanmamış'
      if (!persMap.has(isim)) persMap.set(isim, { atanan: 0, tamamlanan: 0, sapma: 0, kayip: 0, aktif: 0 })
      const e = persMap.get(isim)!
      e.atanan++
      const d = (g as any).durum
      if (d === 'TAMAMLANDI') e.tamamlanan++
      else if (d === 'ZAMANINDA_YAPILAMAYAN') e.sapma++
      else if (d === 'ZAMANI_GECMIS' || d === 'IPTAL' || d === 'KAPATILDI' || d === 'SILINDI' || d === 'BEKLEMEDE') e.kayip++
      else e.aktif++
    }
    ozetAgg.atananPersonelBasari = [...persMap.entries()].map(([personel, v]) => ({ personel, ...v })).sort((a, b) => b.atanan - a.atanan)
  }

  // Rapor tarihi etiketi
  let raporTarihLabel = ''
  if (filters.raporBaslangic && filters.raporBitis) {
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: string) => {
      const dt = new Date(d)
      return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`
    }
    raporTarihLabel = `${fmt(filters.raporBaslangic)} - ${fmt(filters.raporBitis)}`
  } else {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    raporTarihLabel = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`
  }

  return {
    firmaAdi,
    projeAdi,
    ustLokTanim,
    altLokTanim,
    raporTarihLabel,
    gunSayisi,
    raporuAlan: filters.raporuAlan ?? 'Yönetim',
    toplamGorev,
    toplamTamamlanan,
    toplamSapma,
    toplamKayip,
    toplamEkstra,
    genelBasari,
    ozetAgg,
    grupMetrikleri,
    tamamlananGorevler,
    sapmaGorevler,
    kayipGorevler,
    frekansDisiGorevler,
    atananFrekanslar,
    yoneticiIds: [...yoneticiIds],
    islemSureleriAktif: islemSureleriAktif,
  }
}
