import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { getReportDefinition, type ReportKey } from './config'

/**
 * CHUNK-AWARE: musteri rolu tum ust lokasyonlara yetkili olunca
 * yetkiliLokIds binlerce UUID -> .in(col, ids) URL overflow -> fetch failed.
 * 100'luk slice'larla sorgulayip ID-bazli dedup ile merge eder. ids yoksa
 * tek sorgu calistirir (fetchAll ile paginate).
 */
async function fetchAllChunkedLok<T extends { id: string } = any>(
  ids: string[] | null | undefined,
  buildQ: (slice: string[] | null) => any,
): Promise<T[]> {
  if (!ids || ids.length === 0) {
    return await fetchAll<T>(() => buildQ(null))
  }
  const seen = new Set<string>()
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await fetchAll<T>(() => buildQ(ids.slice(i, i + 100)))
    for (const r of rows) {
      if (!seen.has(r.id)) { seen.add(r.id); out.push(r) }
    }
  }
  return out
}

export type ReportFilters = {
  firmaId?: string | null
  projeId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  yetkiliLokIds?: string[] | null       // rol bazli: ust+alt tumu (lokasyon_id icin)
  yetkiliUstLokIds?: string[] | null    // rol bazli: SADECE ust lokasyon ID'leri (ust_lokasyon_id icin)
  ustLokasyonId?: string | null         // SA/TA/manuel secim (tek ust lokasyon)
  ustLokasyonAltIds?: string[] | null   // secilen ust lokasyonun TUM alt ID'leri (BFS ile hesaplanmis)
}

export type PreparedReport = {
  title: string
  columns: Array<{ key: string; label: string; width?: number }>
  rows: Record<string, string>[]
  generatedAt: string
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Süper Admin',
  alt_super_admin: 'Alt Süper Admin',
  tenant_admin: 'Firma Admini',
  tenant_user: 'Kullanıcı',
}

function formatDate(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const trt = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(trt.getUTCDate())}.${pad(trt.getUTCMonth() + 1)}.${trt.getUTCFullYear()} ${pad(trt.getUTCHours())}:${pad(trt.getUTCMinutes())}`
}

function formatBool(value: boolean | null | undefined) {
  return value ? 'Evet' : 'Hayır'
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || Number.isNaN(seconds)) return ''
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts = []
  if (h) parts.push(`${h} sa`)
  if (m) parts.push(`${m} dk`)
  if (s || parts.length === 0) parts.push(`${s} sn`)
  return parts.join(' ')
}

function withinRange(value: string | null | undefined, from?: string | null, to?: string | null) {
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

function makePath(id: string | null | undefined, map: Map<string, any>) {
  if (!id) return ''
  const parts: string[] = []
  let current = map.get(id)
  let guard = 0
  while (current && guard < 10) {
    parts.unshift(current.tanim ?? '')
    current = current.parent_id ? map.get(current.parent_id) : null
    guard += 1
  }
  return parts.filter(Boolean).join(' > ')
}

export async function buildReportData(reportKey: ReportKey, selectedColumns: string[], filters: ReportFilters): Promise<PreparedReport> {
  const admin = createAdminClient()
  const def = getReportDefinition(reportKey)
  if (!def) throw new Error('Geçersiz rapor tipi.')

  const columns = def.columns.filter((c) => selectedColumns.includes(c.key))
  if (!columns.length) throw new Error('En az bir sütun seçilmelidir.')

  const firmalarRes = await admin.from('firmalar').select('id,ticari_unvan,firma_adi')
  if (firmalarRes.error) throw new Error(firmalarRes.error.message)
  const firmalar = firmalarRes.data ?? []
  const firmaMap = new Map<string, string>(firmalar.map((f: any) => [f.id, f.firma_adi || f.ticari_unvan || '-']))

  let rows: Record<string, string>[] = []

  if (reportKey === 'locations') {
    // CHUNK-AWARE + fetchAll pagination: 1000-row cap + URL overflow her ikisi birden.
    const locLokIds = filters.yetkiliLokIds ?? filters.ustLokasyonAltIds ?? null
    const locs = await fetchAllChunkedLok<any>(locLokIds, (slice) => {
      let q: any = admin
        .from('lokasyonlar')
        .select('id,firma_id,tanim,parent_id,aciklama,aktif,qr_veri,qr_id,nfc_token,checklist_sablon_id,sureli_gorev_aktif,atanan_kullanici_id,kayit_tarihi')
        .order('kayit_tarihi', { ascending: true })
      if (filters.firmaId) q = q.eq('firma_id', filters.firmaId)
      if (filters.projeId) q = q.eq('proje_id', filters.projeId)
      if (slice) q = q.in('id', slice)
      return q
    })
    const map = new Map<string, any>(locs.map((row: any) => [row.id, row]))
    const checklistIds = Array.from(new Set(locs.map((x: any) => x.checklist_sablon_id).filter(Boolean)))
    const userIds = Array.from(new Set(locs.map((x: any) => x.atanan_kullanici_id).filter(Boolean)))
    const [templateRes, userRes] = await Promise.all([
      checklistIds.length ? admin.from('checklist_sablonlari').select('id,baslik').in('id', checklistIds) : Promise.resolve({ data: [], error: null } as any),
      userIds.length ? admin.from('users').select('id,isim_soyisim').in('id', userIds) : Promise.resolve({ data: [], error: null } as any),
    ])
    if (templateRes.error) throw new Error(templateRes.error.message)
    if (userRes.error) throw new Error(userRes.error.message)
    const checklistMap = new Map<string, string>((templateRes.data ?? []).map((x: any) => [x.id, x.baslik ?? '']))
    const userMap = new Map<string, string>((userRes.data ?? []).map((x: any) => [x.id, x.isim_soyisim ?? '']))

    rows = locs.map((row: any) => {
      const parentPath = makePath(row.parent_id, map)
      const fullPath = makePath(row.id, map)
      const level = fullPath ? fullPath.split(' > ').length : 1
      return {
        firma: firmaMap.get(row.firma_id) ?? '-',
        tanim: row.tanim ?? '',
        parent_yolu: parentPath,
        seviye: String(level),
        aciklama: row.aciklama ?? '',
        aktif: formatBool(row.aktif),
        qr_veri: row.qr_veri ?? '',
        qr_id: row.qr_id ?? '',
        nfc_token: row.nfc_token ?? '',
        checklist_sablonu: row.checklist_sablon_id ? checklistMap.get(row.checklist_sablon_id) ?? '' : '',
        sureli_gorev_aktif: formatBool(row.sureli_gorev_aktif),
        atanan_kullanici: row.atanan_kullanici_id ? userMap.get(row.atanan_kullanici_id) ?? '' : '',
        kayit_tarihi: formatDate(row.kayit_tarihi),
      }
    })
  }

  if (reportKey === 'users') {
    let query = admin
      .from('users')
      .select('id,firma_id,isim_soyisim,email,telefon,rol,aktif,ust_lokasyon_id,kayit_tarihi')
      .in('rol', ['tenant_admin', 'tenant_user'])
      .order('kayit_tarihi', { ascending: false })
    if (filters.firmaId) query = query.eq('firma_id', filters.firmaId)
    if (filters.projeId) query = (query as any).eq('proje_id', filters.projeId)
    // Ust lokasyon bazli filtreleme:
    //   yetkiliUstLokIds: U/M rol sinirlamasi (MONTAJ yetkilisi BOYA personelini gormesin)
    //   ustLokasyonId: SA/TA manuel secim
    if (filters.yetkiliUstLokIds) query = (query as any).in('ust_lokasyon_id', filters.yetkiliUstLokIds)
    if (filters.ustLokasyonId) query = (query as any).eq('ust_lokasyon_id', filters.ustLokasyonId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    rows = (data ?? []).map((row: any) => ({
      firma: firmaMap.get(row.firma_id) ?? '-',
      isim_soyisim: row.isim_soyisim ?? '',
      email: row.email ?? '',
      telefon: row.telefon ?? '',
      rol: ROLE_LABELS[row.rol] ?? row.rol ?? '',
      aktif: formatBool(row.aktif),
      kayit_tarihi: formatDate(row.kayit_tarihi),
    }))
  }

  if (reportKey === 'live_tasks') {
    const liveSelect = 'id,firma_id,tanim,lokasyon_id,atanan_kullanici_id,durum,aktif_olma_tarihi,olusturma_tarihi,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,baslatan_kullanici_id,tamamlayan_kullanici_id,islemi_yapan_id'

    // Aktif tablo + arşiv tablosunu paralel çek, birleştir (chunk-aware).
    // Kaynaklar: yetkiliLokIds (U/M yetki scope) ve ustLokasyonAltIds (secili ust+torunlar).
    // Her ikisi de buyuk olabilir -> ayri ayri chunk + merge + dedup.
    const lokIdsForFilter = filters.yetkiliLokIds ?? filters.ustLokasyonAltIds ?? null
    const buildLiveQ = (table: string, slice: string[] | null) => {
      let q = (admin.from(table) as any).select(liveSelect).order('olusturma_tarihi', { ascending: false })
      if (filters.firmaId) q = q.eq('firma_id', filters.firmaId)
      if (filters.projeId) q = q.eq('proje_id', filters.projeId)
      if (slice) q = q.in('lokasyon_id', slice)
      return q
    }
    const [aktifData, arsivData] = await Promise.all([
      fetchAllChunkedLok<any>(lokIdsForFilter, (slice) => buildLiveQ('canli_gorevler', slice)),
      fetchAllChunkedLok<any>(lokIdsForFilter, (slice) => buildLiveQ('canli_gorevler_arsiv', slice)),
    ])

    // id'ye göre deduplicate — aktif tablo öncelikli (daha güncel)
    const mergedMap = new Map<string, any>()
    for (const r of arsivData) mergedMap.set(r.id, r)
    for (const r of aktifData) mergedMap.set(r.id, r)

    const filtered = Array.from(mergedMap.values()).filter((row: any) => withinRange(row.olusturma_tarihi, filters.dateFrom, filters.dateTo))
    const locIds = Array.from(new Set(filtered.map((x: any) => x.lokasyon_id).filter(Boolean)))
    const userIds = Array.from(new Set(filtered.flatMap((x: any) => [x.atanan_kullanici_id, x.baslatan_kullanici_id, x.tamamlayan_kullanici_id, x.islemi_yapan_id]).filter(Boolean)))
    const [locRes, userRes] = await Promise.all([
      locIds.length ? admin.from('lokasyonlar').select('id,tanim').in('id', locIds) : Promise.resolve({ data: [], error: null } as any),
      userIds.length ? admin.from('users').select('id,isim_soyisim').in('id', userIds) : Promise.resolve({ data: [], error: null } as any),
    ])
    if (locRes.error) throw new Error(locRes.error.message)
    if (userRes.error) throw new Error(userRes.error.message)
    const locMap = new Map<string, string>((locRes.data ?? []).map((x: any) => [x.id, x.tanim ?? '']))
    const userMap = new Map<string, string>((userRes.data ?? []).map((x: any) => [x.id, x.isim_soyisim ?? '']))

    rows = filtered.map((row: any) => ({
      firma: firmaMap.get(row.firma_id) ?? '-',
      tanim: row.tanim ?? '',
      lokasyon: row.lokasyon_id ? locMap.get(row.lokasyon_id) ?? '' : '',
      atanan_kullanici: row.atanan_kullanici_id ? userMap.get(row.atanan_kullanici_id) ?? '' : '',
      durum: row.durum ?? '',
      aktif_olma_tarihi: formatDate(row.aktif_olma_tarihi),
      olusturma_tarihi: formatDate(row.olusturma_tarihi),
      baslatilma_tarihi: formatDate(row.baslatilma_tarihi),
      tamamlanma_tarihi: formatDate(row.tamamlanma_tarihi),
      tamamlanma_suresi: formatDuration(row.tamamlanma_suresi_saniye),
      baslatan_kullanici: row.baslatan_kullanici_id ? userMap.get(row.baslatan_kullanici_id) ?? '' : '',
      tamamlayan_kullanici: row.tamamlayan_kullanici_id ? userMap.get(row.tamamlayan_kullanici_id) ?? '' : '',
      islemi_yapan: row.islemi_yapan_id ? userMap.get(row.islemi_yapan_id) ?? '' : '',
    }))
  }

  if (reportKey === 'manual_tasks') {
    // gorevler_normal view: Oto Yıkama görevleri spesifik raporlara dahil olmaz
    // CHUNK-AWARE: yetkiliLokIds/ustLokasyonAltIds buyuk olabilir -> URL overflow.
    const mtLokIds = filters.yetkiliLokIds ?? filters.ustLokasyonAltIds ?? null
    const data = await fetchAllChunkedLok<any>(mtLokIds, (slice) => {
      let q: any = admin.from('gorevler_normal')
        .select('id,firma_id,tanim,lokasyon_id,atanan_kullanici_id,durum,olusturan_id,olusturma_tarihi,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,islemi_yapan_id')
        .order('olusturma_tarihi', { ascending: false })
      if (filters.firmaId) q = q.eq('firma_id', filters.firmaId)
      if (filters.projeId) q = q.eq('proje_id', filters.projeId)
      if (slice) q = q.in('lokasyon_id', slice)
      return q
    })
    const filtered = (data ?? []).filter((row: any) => withinRange(row.olusturma_tarihi, filters.dateFrom, filters.dateTo))
    const locIds = Array.from(new Set(filtered.map((x: any) => x.lokasyon_id).filter(Boolean)))
    const userIds = Array.from(new Set(filtered.flatMap((x: any) => [x.atanan_kullanici_id, x.olusturan_id, x.islemi_yapan_id]).filter(Boolean)))
    const [locRes, userRes] = await Promise.all([
      locIds.length ? admin.from('lokasyonlar').select('id,tanim').in('id', locIds) : Promise.resolve({ data: [], error: null } as any),
      userIds.length ? admin.from('users').select('id,isim_soyisim').in('id', userIds) : Promise.resolve({ data: [], error: null } as any),
    ])
    if (locRes.error) throw new Error(locRes.error.message)
    if (userRes.error) throw new Error(userRes.error.message)
    const locMap = new Map<string, string>((locRes.data ?? []).map((x: any) => [x.id, x.tanim ?? '']))
    const userMap = new Map<string, string>((userRes.data ?? []).map((x: any) => [x.id, x.isim_soyisim ?? '']))

    rows = filtered.map((row: any) => ({
      firma: firmaMap.get(row.firma_id) ?? '-',
      tanim: row.tanim ?? '',
      lokasyon: row.lokasyon_id ? locMap.get(row.lokasyon_id) ?? '' : '',
      atanan_kullanici: row.atanan_kullanici_id ? userMap.get(row.atanan_kullanici_id) ?? '' : '',
      durum: row.durum ?? '',
      olusturan: row.olusturan_id ? userMap.get(row.olusturan_id) ?? '' : '',
      olusturma_tarihi: formatDate(row.olusturma_tarihi),
      baslatilma_tarihi: formatDate(row.baslatilma_tarihi),
      tamamlanma_tarihi: formatDate(row.tamamlanma_tarihi),
      tamamlanma_suresi: formatDuration(row.tamamlanma_suresi_saniye),
      islemi_yapan: row.islemi_yapan_id ? userMap.get(row.islemi_yapan_id) ?? '' : '',
    }))
  }

  if (reportKey === 'checklist_templates') {
    let query = admin
      .from('checklist_sablonlari')
      .select('id,firma_id,baslik,tanim,aktif,versiyon,kayit_tarihi,guncelleme_tarihi')
      .order('guncelleme_tarihi', { ascending: false })
    if (filters.firmaId) query = query.eq('firma_id', filters.firmaId)
    if (filters.projeId) query = (query as any).eq('proje_id', filters.projeId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const list = data ?? []
    const ids = list.map((x: any) => x.id)
    const [maddeRes, lokasyonRes] = await Promise.all([
      ids.length ? admin.from('checklist_sablon_maddeleri').select('id,sablon_id').in('sablon_id', ids) : Promise.resolve({ data: [], error: null } as any),
      ids.length ? admin.from('lokasyonlar').select('id,checklist_sablon_id').in('checklist_sablon_id', ids) : Promise.resolve({ data: [], error: null } as any),
    ])
    if (maddeRes.error) throw new Error(maddeRes.error.message)
    if (lokasyonRes.error) throw new Error(lokasyonRes.error.message)
    const maddeCount: Record<string, number> = {}
    const kullanimCount: Record<string, number> = {}
    for (const item of maddeRes.data ?? []) maddeCount[(item as any).sablon_id] = (maddeCount[(item as any).sablon_id] ?? 0) + 1
    for (const item of lokasyonRes.data ?? []) kullanimCount[(item as any).checklist_sablon_id] = (kullanimCount[(item as any).checklist_sablon_id] ?? 0) + 1

    rows = list.map((row: any) => ({
      firma: firmaMap.get(row.firma_id) ?? '-',
      baslik: row.baslik ?? '',
      tanim: row.tanim ?? '',
      aktif: formatBool(row.aktif),
      versiyon: row.versiyon == null ? '' : String(row.versiyon),
      madde_sayisi: String(maddeCount[row.id] ?? 0),
      kullanim_sayisi: String(kullanimCount[row.id] ?? 0),
      kayit_tarihi: formatDate(row.kayit_tarihi),
      guncelleme_tarihi: formatDate(row.guncelleme_tarihi),
    }))
  }

  // ── LOKASYON GRUPLARI ────────────────────────────────────────────
  if (reportKey === 'location_groups') {
    const lgFirmaId = filters.firmaId ?? null
    let grpQ = admin.from('lokasyon_gruplari')
      .select('id,firma_id,ad,aciklama,ust_lokasyon_id,kayit_tarihi')
      .order('ad')
    if (lgFirmaId) grpQ = grpQ.eq('firma_id', lgFirmaId)
    if (filters.projeId) grpQ = (grpQ as any).eq('proje_id', filters.projeId)
    // U/M yetki filtresi: sadece yetkili ust_lokasyon'a bagli gruplari goster
    if (filters.yetkiliUstLokIds) grpQ = grpQ.in('ust_lokasyon_id', filters.yetkiliUstLokIds)
    if (filters.ustLokasyonId) grpQ = grpQ.eq('ust_lokasyon_id', filters.ustLokasyonId)

    const { data: grpList, error: grpErr } = await grpQ
    if (grpErr) throw new Error(grpErr.message)

    const locIds: string[] = []
    const grpLocMap: Record<string, string[]> = {}
    // Uye sorgusunu SADECE listelenen gruplar icin cek — hem yetki hem proje
    // filtresi (grup) via yukaridaki filtre ile dolayli uygulanmis olur.
    const listelenenGrupIds = (grpList ?? []).map((g: any) => g.id)
    if (listelenenGrupIds.length > 0) {
      const { data: members } = await admin
        .from('lokasyon_grup_uyeleri')
        .select('grup_id,lokasyon_id')
        .in('grup_id', listelenenGrupIds)
      for (const m of members ?? []) {
        if (!grpLocMap[m.grup_id]) grpLocMap[m.grup_id] = []
        grpLocMap[m.grup_id].push(m.lokasyon_id)
        locIds.push(m.lokasyon_id)
      }
    }

    // Lokasyon isimleri — CHUNK-AWARE (locIds buyuk grup secilince 2000+ olabilir)
    const uniqLocIds = Array.from(new Set(locIds))
    const locList = uniqLocIds.length === 0
      ? []
      : await fetchAllChunkedLok<any>(uniqLocIds, (slice) => admin.from('lokasyonlar').select('id,tanim,parent_id').in('id', slice ?? uniqLocIds))
    const locMap2 = new Map((locList ?? []).map((l: any) => [l.id, l]))

    function pathOf2(id: string): string {
      const parts: string[] = []
      const seen = new Set<string>()
      let cur: any = locMap2.get(id)
      while (cur && !seen.has(cur.id)) { parts.unshift(cur.tanim); seen.add(cur.id); cur = locMap2.get(cur.parent_id) }
      return parts.join(' / ')
    }

    // Görev istatistikleri — proje ve yetki filtresi de uygulansin.
    // CHUNK-AWARE: yetkiliLokIds buyukse URL overflow. Burada id-dedup yerine
    // raw concat yapiyoruz cunku ayni görev farkli chunk'larda cikamaz
    // (bir satir tek lokasyon_id'ye sahip). Istatistik sayilar icin yeterli.
    const gorevler: any[] = []
    const gorevLokChunks: (string[] | null)[] = !filters.yetkiliLokIds || filters.yetkiliLokIds.length === 0
      ? [null]
      : filters.yetkiliLokIds.length <= 100
        ? [filters.yetkiliLokIds]
        : Array.from({ length: Math.ceil(filters.yetkiliLokIds.length / 100) }, (_, i) => filters.yetkiliLokIds!.slice(i * 100, (i + 1) * 100))
    for (const slice of gorevLokChunks) {
      const rows = await fetchAll(() => {
        let q = admin.from('canli_gorevler').select('lokasyon_id,durum')
        if (lgFirmaId) q = q.eq('firma_id', lgFirmaId)
        if (filters.projeId) q = (q as any).eq('proje_id', filters.projeId)
        if (slice) q = q.in('lokasyon_id', slice)
        if (filters.dateFrom) q = q.gte('aktif_olma_tarihi', new Date(filters.dateFrom + 'T00:00:00+03:00').toISOString())
        if (filters.dateTo) q = q.lte('aktif_olma_tarihi', new Date(filters.dateTo + 'T23:59:59+03:00').toISOString())
        return q
      })
      gorevler.push(...rows)
    }
    const locGorevMap: Record<string, { toplam: number; tamamlanan: number }> = {}
    for (const g of gorevler) {
      if (!g.lokasyon_id) continue
      if (!locGorevMap[g.lokasyon_id]) locGorevMap[g.lokasyon_id] = { toplam: 0, tamamlanan: 0 }
      locGorevMap[g.lokasyon_id].toplam++
      if (g.durum === 'TAMAMLANDI') locGorevMap[g.lokasyon_id].tamamlanan++
    }

    rows = (grpList ?? []).map((grp: any) => {
      const lIds = grpLocMap[grp.id] ?? []
      const locPaths = lIds.map(pathOf2).filter(Boolean).sort().join(', ')
      const ustPath = grp.ust_lokasyon_id ? pathOf2(grp.ust_lokasyon_id) : ''
      let toplam = 0, tamamlanan = 0
      for (const lid of lIds) { toplam += locGorevMap[lid]?.toplam ?? 0; tamamlanan += locGorevMap[lid]?.tamamlanan ?? 0 }
      const basari = toplam > 0 ? Math.round((tamamlanan / toplam) * 100) : 0
      return {
        grup_adi: grp.ad ?? '',
        ust_lokasyon: ustPath,
        lokasyon_sayisi: String(lIds.length),
        lokasyonlar: locPaths,
        toplam_gorev: String(toplam),
        tamamlanan: String(tamamlanan),
        basari_orani: toplam > 0 ? `%${basari}` : '—',
        kayit_tarihi: formatDate(grp.kayit_tarihi),
      }
    })
  }

  return {
    title: def.title,
    columns,
    rows,
    generatedAt: formatDate(new Date().toISOString()),
  }
}
