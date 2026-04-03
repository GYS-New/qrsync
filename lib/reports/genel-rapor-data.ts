import { createAdminClient } from '@/lib/supabase/server'

export interface GenelRaporFilters {
  firmaId: string
  projeId?: string | null
  ustLokasyonId?: string | null
  altLokasyonId?: string | null
  raporBaslangic?: string | null   // 'YYYY-MM-DD'
  raporBitis?: string | null       // 'YYYY-MM-DD'
  raporuAlan?: string | null
}

export interface GrupMetrik {
  grup: string
  lokasyon: string
  gorevTanimi: string   // Gruba ait görev tanımı (varsa ilk eşleşen)
  gunlukFrekans: number
  hedef: number
  tamamlanan: number
  sapma: number
  kayip: number
  basariOrani: string
  genelOran: string
}

export interface TamamlananRow {
  sn: number
  personel: string
  ustLokasyon: string
  lokasyon: string
  gorevNo: string
  gorevTanimi: string
  tarihSaat: string
  durum: string
}

export interface SapmaRow {
  sn: number
  personel: string
  ustLokasyon: string
  lokasyon: string
  gorevNo: string
  gorevTanimi: string
  tarihSaat: string
  sapmaNedeni: string
}

export interface KayipRow {
  sn: number
  ustLokasyon: string
  lokasyon: string
  gorevNo: string
  gorevTanimi: string
  tarihSaat: string
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
  aciklama: string
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
  toplamGorev: number
  toplamTamamlanan: number
  toplamSapma: number
  toplamKayip: number
  genelBasari: number
  // Tablo verileri
  grupMetrikleri: GrupMetrik[]
  tamamlananGorevler: TamamlananRow[]
  sapmaGorevler: SapmaRow[]
  kayipGorevler: KayipRow[]
  frekansDisiGorevler: FrekansDisiRow[]
}

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function withinRange(value: string | null | undefined, from?: string | null, to?: string | null): boolean {
  if (!from && !to) return true
  if (!value) return false
  const ts = new Date(value).getTime()
  if (Number.isNaN(ts)) return false
  if (from) {
    const fromTs = new Date(`${from}T00:00:00`).getTime()
    if (ts < fromTs) return false
  }
  if (to) {
    const toTs = new Date(`${to}T23:59:59.999`).getTime()
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
    .select('id,tanim,parent_id,firma_id')
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

  if (filters.ustLokasyonId) {
    const ust = lokMap.get(filters.ustLokasyonId) as any
    ustLokTanim = ust?.tanim ?? ''
    if (filters.altLokasyonId) {
      const alt = lokMap.get(filters.altLokasyonId) as any
      altLokTanim = alt?.tanim ?? ''
      // Seçilen alt lokasyon + tüm torunları
      targetLokasyonIds = getAllDescendants(filters.altLokasyonId)
    } else {
      // Üst lokasyon + tüm torunları (n seviye derinlik)
      targetLokasyonIds = getAllDescendants(filters.ustLokasyonId)
    }
  }

  // 3. Görevleri çek: aktif tablo + arşiv tablosu birleşik
  // Arşiv tablosu terminal durumları (TAMAMLANDI, ZAMANI_GECMIS vb.) tutar
  const SELECT_COLS = 'id,firma_id,tanim,lokasyon_id,atanan_kullanici_id,durum,aktif_olma_tarihi,tamamlanma_tarihi,tamamlayan_kullanici_id,islemi_yapan_id,durum_degisim_tarihi,olusturma_tarihi,gunluk_frekans_sayisi'

  let qAktif = admin
    .from('canli_gorevler')
    .select(SELECT_COLS)
    .eq('firma_id', filters.firmaId)
  let qArsiv = admin
    .from('canli_gorevler_arsiv')
    .select(SELECT_COLS)
    .eq('firma_id', filters.firmaId)
  if (filters.projeId) {
    qAktif = (qAktif as any).or(`proje_id.eq.${filters.projeId},proje_id.is.null`)
    qArsiv = (qArsiv as any).or(`proje_id.eq.${filters.projeId},proje_id.is.null`)
  }

  if (targetLokasyonIds && targetLokasyonIds.length > 0) {
    qAktif = qAktif.in('lokasyon_id', targetLokasyonIds)
    qArsiv = qArsiv.in('lokasyon_id', targetLokasyonIds)
  }

  // Tarih aralığına göre DB tarafında filtrele (performans için)
  if (filters.raporBaslangic) {
    qAktif = qAktif.gte('aktif_olma_tarihi', filters.raporBaslangic)
    qArsiv = qArsiv.gte('aktif_olma_tarihi', filters.raporBaslangic)
  }
  if (filters.raporBitis) {
    qAktif = qAktif.lte('aktif_olma_tarihi', filters.raporBitis)
    qArsiv = qArsiv.lte('aktif_olma_tarihi', filters.raporBitis)
  }

  const [{ data: aktifGorevler }, { data: arsivGorevler }] = await Promise.all([qAktif, qArsiv])

  // Birleştir, çakışan id varsa aktif tablosu öncelikli
  const arsivMap = new Map((arsivGorevler ?? []).map((g: any) => [g.id, g]))
  for (const g of (aktifGorevler ?? [])) arsivMap.set((g as any).id, g)
  const tumGorevler = Array.from(arsivMap.values()).filter((g: any) =>
    withinRange(g.aktif_olma_tarihi, filters.raporBaslangic, filters.raporBitis)
  )

  // 4. Kullanıcı isimleri
  const userIds = Array.from(new Set(tumGorevler.flatMap((g: any) =>
    [g.atanan_kullanici_id, g.tamamlayan_kullanici_id, g.islemi_yapan_id].filter(Boolean)
  )))
  const userMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('users')
      .select('id,isim_soyisim')
      .in('id', userIds)
    for (const u of users ?? []) userMap.set((u as any).id, (u as any).isim_soyisim ?? '')
  }

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
    tekil: number                  // gunluk_frekans_sayisi=0 olan tekil görevler
  }>()

  for (const g of tumGorevler) {
    const lid = (g as any).lokasyon_id
    if (!lid) continue
    if (!lokGorevCount.has(lid)) lokGorevCount.set(lid, { gunlukFrekansToplamı: 0, tamamlanan: 0, sapma: 0, kayip: 0, tekil: 0 })
    const entry = lokGorevCount.get(lid)!
    const gfs = (g as any).gunluk_frekans_sayisi ?? 0

    if (gfs > 0) {
      // gfs değerini lokasyon+tanim bazlı sakla — grup hesabında kullanılacak
      // (günlük frekans = GRUP düzeyinde benzersiz tanım başına gfs — lokasyon sayısından bağımsız)
      const tanim = (g as any).tanim ?? ''
      const tanımKey = `${lid}::${tanim}`
      if (!lokGunFrekans.has(lid)) lokGunFrekans.set(lid, new Map())
      const gunMap = lokGunFrekans.get(lid)!
      if (!gunMap.has(tanımKey)) {
        gunMap.set(tanımKey, gfs)
      }
    } else {
      // gfs=0 → tekil görev
      // HAZIR/ACIK/ISLEMDE: hedef'e dahil edilir ama tekil sayımına girmiyor (hazirAcikSayisi ayrıca ekleniyor)
      const durumTekil = (g as any).durum
      if (durumTekil !== 'HAZIR' && durumTekil !== 'ACIK' && durumTekil !== 'ISLEMDE') {
        entry.tekil++
      }
    }

    const durum = (g as any).durum
    // Durum → Kategori:
    // TAMAMLANDI                          → tamamlanan
    // ZAMANINDA_YAPILAMAYAN               → sapma
    // ZAMANI_GECMIS, IPTAL, SILINDI, BEKLEMEDE → kayıp
    // HAZIR, ACIK, ISLEMDE               → hedef'e girer ama kategoriye girmez (henüz aktif)
    if (durum === 'TAMAMLANDI') entry.tamamlanan++
    else if (durum === 'ZAMANINDA_YAPILAMAYAN') entry.sapma++
    else if (durum === 'ZAMANI_GECMIS' || durum === 'IPTAL' || durum === 'SILINDI' || durum === 'BEKLEMEDE') entry.kayip++
    // HAZIR, ACIK, ISLEMDE: sayılmaz (aktif görevler)
  }
  // Günlük frekans = günlükFrekansToplamı / gunSayisi
  // (11 gün × 6/gün = 66 → toplam 66 kayıt, 66/11 = 6 günlük frekans)

  // 7. Grup metrikleri
  const grupMetrikleri: GrupMetrik[] = []
  for (const grup of gruplar ?? []) {
    const lokIds = grupLokMap.get((grup as any).id) ?? []
    // targetLokasyonIds filtresi: grup üyelerinden sadece hedef kapsamındaki lokasyonları al
    const filteredLokIds = targetLokasyonIds
      ? lokIds.filter(id => targetLokasyonIds!.includes(id))
      : lokIds

    // Grup kapsamında görev olan lokasyon varsa dahil et (hedef=0 olsa bile grup görünsün)
    // (sadece filteredLokIds boşsa ve hiç görev yoksa atla)
    if (filteredLokIds.length === 0) continue

    let tekilToplamı = 0
    let tamamlanan = 0, sapma = 0, kayip = 0
    for (const lid of filteredLokIds) {
      const entry = lokGorevCount.get(lid)
      if (!entry) continue
      tekilToplamı += entry.tekil
      tamamlanan += entry.tamamlanan
      sapma += entry.sapma
      kayip += entry.kayip
    }

    // Günlük frekans: GRUP içindeki benzersiz görev TANIMI başına gfs toplamı
    // Lokasyon sayısından bağımsız — "FREKANS TEST GÖREVİ" gfs=6 demek günde 6 kez yapılır
    // Birden fazla lokasyon aynı tanımı içerse de gfs 1 kez sayılır
    const grupTanimGfs = new Map<string, number>()
    for (const g of tumGorevler) {
      if (!filteredLokIds.includes((g as any).lokasyon_id)) continue
      const gfs = (g as any).gunluk_frekans_sayisi ?? 0
      if (gfs === 0) continue
      const tanim = (g as any).tanim ?? ''
      if (!grupTanimGfs.has(tanim)) {
        grupTanimGfs.set(tanim, gfs)  // Her benzersiz tanım için gfs bir kez alınır
      }
    }
    const gunlukFrekansToplamı = Array.from(grupTanimGfs.values()).reduce((s, v) => s + v, 0)

    // Hedef = rapor tarih aralığında kaydedilen TÜM görevler (duruma bakılmaz)
    // HAZIR/ACIK/ISLEMDE da dahil — henüz tamamlanmamış ama planlanmış görevler
    const hazirAcikSayisi = (tumGorevler as any[]).filter((g: any) =>
      filteredLokIds.includes(g.lokasyon_id) && (g.durum === 'HAZIR' || g.durum === 'ACIK' || g.durum === 'ISLEMDE')
    ).length
    const toplamGrupGorev = tamamlanan + sapma + kayip + tekilToplamı + hazirAcikSayisi
    const hedef = toplamGrupGorev

    // Günlük frekans: gfs değeri (migration varsa), yoksa hedef/gunSayisi
    let gunlukFrekans = gunlukFrekansToplamı > 0
      ? gunlukFrekansToplamı
      : (gunSayisi > 0 ? Math.round(hedef / gunSayisi) : hedef)

    // Lokasyon tam yolu: kök'ten görev lokasyonuna "Ust > Alt > AltAlt" formatında
    let lokTanim = ''
    if (filteredLokIds.length > 0) {
      // İlk lokasyonun tam yolunu kullan (tüm üyeler aynı hiyerarşideyse)
      const firstLok = filteredLokIds[0]
      lokTanim = getLokasyonFullPath(firstLok)
    }

    // Kayıp = DB'deki gerçek kayıp sayısı (ZAMANI_GECMIS + IPTAL + SILINDI)
    // Kayıp Frekanslar sekmesi ile senkronize — formül değil DB sayımı
    const kayipFormul = kayip
    const basariOran = hedef > 0 ? Math.round((tamamlanan / hedef) * 100) : 0
    const genelOran  = hedef > 0 ? Math.round(((tamamlanan + sapma) / hedef) * 100) : 0

    // Gruba ait görev tanımını bul: filteredLokIds'teki lokasyonlarda en sık görülen tanim
    let gorevTanimi = ''
    const taninCounts = new Map<string, number>()
    for (const g of tumGorevler) {
      if (filteredLokIds.includes((g as any).lokasyon_id)) {
        const t = (g as any).tanim ?? ''
        if (t) taninCounts.set(t, (taninCounts.get(t) ?? 0) + 1)
      }
    }
    if (taninCounts.size > 0) {
      gorevTanimi = Array.from(taninCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
    }

    grupMetrikleri.push({
      grup: (grup as any).ad ?? '',
      lokasyon: lokTanim,
      gorevTanimi,
      gunlukFrekans,
      hedef,
      tamamlanan,
      sapma,
      kayip: kayipFormul,
      basariOrani: `%${basariOran}`,
      genelOran: `%${genelOran}`,
    })
  }

  // Aynı isimli grupları birleştir (Tümü seçilince farklı üst lokasyonlardaki aynı isimli gruplar tekrarlanır)
  const birlesikGruplar = new Map<string, GrupMetrik>()
  for (const gm of grupMetrikleri) {
    const mevcut = birlesikGruplar.get(gm.grup)
    if (!mevcut) {
      birlesikGruplar.set(gm.grup, { ...gm })
    } else {
      const yeniHedef     = mevcut.hedef + gm.hedef
      const yeniTamamlanan = mevcut.tamamlanan + gm.tamamlanan
      const yeniSapma     = mevcut.sapma + gm.sapma
      const yeniKayip     = mevcut.kayip + gm.kayip
      const yeniGunluk    = mevcut.gunlukFrekans + gm.gunlukFrekans
      const basariOran    = yeniHedef > 0 ? Math.round((yeniTamamlanan / yeniHedef) * 100) : 0
      const genelOran     = yeniHedef > 0 ? Math.round(((yeniTamamlanan + yeniSapma) / yeniHedef) * 100) : 0
      birlesikGruplar.set(gm.grup, {
        grup: gm.grup,
        lokasyon: '',   // birden fazla lokasyon — boş bırak
        gorevTanimi: mevcut.gorevTanimi || gm.gorevTanimi,
        gunlukFrekans: yeniGunluk,
        hedef: yeniHedef,
        tamamlanan: yeniTamamlanan,
        sapma: yeniSapma,
        kayip: yeniKayip,
        basariOrani: `%${basariOran}`,
        genelOran: `%${genelOran}`,
      })
    }
  }
  grupMetrikleri.length = 0
  grupMetrikleri.push(...Array.from(birlesikGruplar.values()))

  // Grup yoksa genel toplamı göster
  if (grupMetrikleri.length === 0) {
    let hedef = 0, tamamlanan = 0, sapma = 0, kayip = 0
    for (const g of tumGorevler) {
      const durum = (g as any).durum
      hedef++  // TÜM görevler hedefe dahil (duruma bakılmaz)
      if (durum === 'TAMAMLANDI') tamamlanan++
      else if (durum === 'ZAMANINDA_YAPILAMAYAN') sapma++
      else if (durum === 'ZAMANI_GECMIS' || durum === 'IPTAL' || durum === 'SILINDI' || durum === 'BEKLEMEDE') kayip++
      // HAZIR, ACIK, ISLEMDE: hedefe girer ama kategoriye girmez
    }
    if (hedef > 0) {
      grupMetrikleri.push({
        grup: 'Genel',
        lokasyon: ustLokTanim || altLokTanim || 'Tüm Lokasyonlar',
        gunlukFrekans: Math.round(hedef / gunSayisi),
        hedef,
        tamamlanan,
        sapma,
        kayip,
        basariOrani: `%${hedef > 0 ? Math.round((tamamlanan / hedef) * 100) : 0}`,
        genelOran: `%${hedef > 0 ? Math.round(((tamamlanan + sapma) / hedef) * 100) : 0}`,
        gorevTanimi: '',
      })
    }
  }

  // 8. Özet toplamlar
  // Hedef = TÜM görevler (duruma bakılmaz) — rapor tarih aralığında kaydedilen tümü
  const toplamGorev      = tumGorevler.length
  const toplamTamamlanan = tumGorevler.filter((g: any) => g.durum === 'TAMAMLANDI').length
  const toplamSapma      = tumGorevler.filter((g: any) => g.durum === 'ZAMANINDA_YAPILAMAYAN').length
  // Kayıp: ZAMANI_GECMIS + IPTAL + SILINDI + BEKLEMEDE (HAZIR/ACIK/ISLEMDE aktif sayılır, kayıp değil)
  const toplamKayip      = tumGorevler.filter((g: any) =>
    g.durum === 'ZAMANI_GECMIS' || g.durum === 'IPTAL' || g.durum === 'SILINDI' || g.durum === 'BEKLEMEDE'
  ).length
  const genelBasari  = toplamGorev > 0 ? Math.round((toplamTamamlanan / toplamGorev) * 100) : 0

  // 9. Tamamlanan görevler
  const tamamlananGorevler: TamamlananRow[] = tumGorevler
    .filter((g: any) => g.durum === 'TAMAMLANDI')
    .map((g: any, i: number) => {
      const lok = lokMap.get(g.lokasyon_id) as any
      const kullanici = userMap.get(g.islemi_yapan_id ?? g.tamamlayan_kullanici_id ?? g.atanan_kullanici_id ?? '') ?? ''
      return {
        sn: i + 1,
        personel: kullanici,
        ustLokasyon: getUstLokasyon(g.lokasyon_id),
        lokasyon: lok?.tanim ?? '',
        gorevNo: g.id?.slice(-8)?.toUpperCase() ?? '',
        gorevTanimi: g.tanim ?? '',
        tarihSaat: formatDate(g.tamamlanma_tarihi ?? g.durum_degisim_tarihi),
        durum: 'TAMAMLANDI',
      }
    })

  // 10. Sapma görevleri
  // Sapma: sadece ZAMANINDA_YAPILAMAYAN
  const sapmaGorevler: SapmaRow[] = tumGorevler
    .filter((g: any) => g.durum === 'ZAMANINDA_YAPILAMAYAN')
    .map((g: any, i: number) => {
      const lok = lokMap.get(g.lokasyon_id) as any
      const kullanici = userMap.get(g.islemi_yapan_id ?? g.atanan_kullanici_id ?? '') ?? ''
      const sapmaNedeni = g.durum === 'BEKLEMEDE' ? 'Zamanında tamamlanamadı' : 'Gecikme ile tamamlandı'
      return {
        sn: i + 1,
        personel: kullanici,
        ustLokasyon: getUstLokasyon(g.lokasyon_id),
        lokasyon: lok?.tanim ?? '',
        gorevNo: g.id?.slice(-8)?.toUpperCase() ?? '',
        gorevTanimi: g.tanim ?? '',
        tarihSaat: formatDate(g.durum_degisim_tarihi ?? g.aktif_olma_tarihi),
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
    IPTAL: 'Manuel iptal edildi',
    SILINDI: 'Kayıt silindi',
    BEKLEMEDE: 'Beklemede kaldı',
    KAPATILDI: 'Kapatıldı',
  }
  const kayipGorevler: KayipRow[] = tumGorevler
    .filter((g: any) => !KAYIP_HARIC_DURUMLAR.has(g.durum))
    .map((g: any, i: number) => {
      const lok = lokMap.get(g.lokasyon_id) as any
      return {
        sn: i + 1,
        ustLokasyon: getUstLokasyon(g.lokasyon_id),
        lokasyon: lok?.tanim ?? '',
        gorevNo: g.id?.slice(-8)?.toUpperCase() ?? '',
        gorevTanimi: g.tanim ?? '',
        tarihSaat: formatDate(g.aktif_olma_tarihi),
        durum: durumLabel[g.durum] ?? g.durum,
        kayipNedeni: kayipNedeniLabel[g.durum] ?? g.durum,
      }
    })

  // 11. Frekans dışı görevler (gorevler tablosu — spesifik görevler)
  const frekansDisiGorevler: FrekansDisiRow[] = []
  if (targetLokasyonIds && targetLokasyonIds.length > 0 || !filters.ustLokasyonId) {
    // Grup → lokasyon → üst lokasyon haritası (frekans dışı için)
    const lokGrupMap = new Map<string, string>() // lokasyon_id → grup adı
    const lokUstMap  = new Map<string, string>() // lokasyon_id → üst lokasyon adı
    for (const [grupId, lokIds] of grupLokMap) {
      const grup = (gruplar ?? []).find((g: any) => g.id === grupId) as any
      for (const lid of lokIds) {
        if (grup) lokGrupMap.set(lid, grup.ad ?? '')
        // Üst lokasyon: en tepedeki parent
        let cur = lokMap.get(lid) as any
        let ust = cur
        while (cur?.parent_id) { cur = lokMap.get(cur.parent_id) as any; if (cur) ust = cur }
        lokUstMap.set(lid, ust?.tanim ?? '')
      }
    }

    let spQ = admin
      .from('gorevler')
      .select('id,tanim,lokasyon_id,islemi_yapan_id,atanan_kullanici_id,tamamlanma_tarihi,olusturma_tarihi,durum,aciklama')
      .eq('firma_id', filters.firmaId)
    if (filters.projeId) spQ = (spQ as any).eq('proje_id', filters.projeId)
    if (targetLokasyonIds?.length) spQ = spQ.in('lokasyon_id', targetLokasyonIds)
    if (filters.raporBaslangic) spQ = spQ.gte('olusturma_tarihi', filters.raporBaslangic)
    if (filters.raporBitis) spQ = spQ.lte('olusturma_tarihi', filters.raporBitis + 'T23:59:59')
    const { data: spGorevler } = await spQ

    // Spesifik görevlerin kullanıcı id'lerini topla
    const spUserIds = Array.from(new Set(
      (spGorevler ?? []).flatMap((g: any) => [g.islemi_yapan_id, g.atanan_kullanici_id].filter(Boolean))
    ))
    if (spUserIds.length > 0) {
      const { data: spUsers } = await admin.from('users').select('id,isim_soyisim').in('id', spUserIds)
      for (const u of spUsers ?? []) userMap.set((u as any).id, (u as any).isim_soyisim ?? '')
    }

    for (let i = 0; i < (spGorevler ?? []).length; i++) {
      const g = (spGorevler as any[])[i]
      const lok = lokMap.get(g.lokasyon_id) as any
      const personelId = g.islemi_yapan_id ?? g.atanan_kullanici_id ?? ''
      frekansDisiGorevler.push({
        sn: i + 1,
        ustLokasyon: lokUstMap.get(g.lokasyon_id) ?? '',
        grupTanimi: lokGrupMap.get(g.lokasyon_id) ?? '',
        lokasyonTanimi: lok?.tanim ?? '',
        personel: userMap.get(personelId) ?? '',
        tarihSaat: formatDate(g.tamamlanma_tarihi ?? g.olusturma_tarihi),
        aciklama: g.aciklama ?? g.tanim ?? '',
      })
    }
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
    genelBasari,
    grupMetrikleri,
    tamamlananGorevler,
    sapmaGorevler,
    kayipGorevler,
    frekansDisiGorevler,
  }
}
