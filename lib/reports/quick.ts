import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'

/**
 * Aktif canli_gorevler + canli_gorevler_arsiv tablosunu paralel çekip
 * id bazında deduplicate ederek birleştirir.
 * Aktif tablo kaydı her zaman arşiv kaydının önüne geçer (daha güncel).
 */
async function fetchCanliGorevlerMerged(admin: any, selectCols: string, filters: {
  firmaId?: string | null
  projeId?: string | null
}): Promise<any[]> {
  const [aktif, arsiv] = await Promise.all([
    fetchAll(() => {
      let q = admin.from('canli_gorevler').select(selectCols)
      if (filters.firmaId) q = q.eq('firma_id', filters.firmaId)
      if (filters.projeId) q = (q as any).eq('proje_id', filters.projeId)
      return q
    }),
    fetchAll(() => {
      let q = admin.from('canli_gorevler_arsiv').select(selectCols)
      if (filters.firmaId) q = q.eq('firma_id', filters.firmaId)
      if (filters.projeId) q = (q as any).eq('proje_id', filters.projeId)
      return q
    }),
  ])
  const map = new Map<string, any>()
  for (const r of arsiv) map.set(r.id, r)
  for (const r of aktif) map.set(r.id, r)  // aktif üzerine yazar
  return Array.from(map.values())
}

export type QuickReportType = 'locations' | 'users' | 'live_tasks' | 'manual_tasks' | 'location_groups'

type Filters = {
  firmaId?: string | null
  projeId?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  locationId?: string | null
  userId?: string | null
  status?: string | null
  groupId?: string | null
  parentLocationId?: string | null
}

type ChartDatum = Record<string, string | number>

type QuickReportResponse = {
  type: QuickReportType
  summary: { title: string; value: string | number; hint?: string }[]
  options: {
    locations: { id: string; label: string; parentId?: string | null }[]
    parentLocations?: { id: string; label: string }[]
    users: { id: string; label: string }[]
    statuses: string[]
  }
  charts: {
    key: string
    title: string
    subtitle?: string
    chart: 'bar' | 'line' | 'pie' | 'grouped_bar'
    data: ChartDatum[]
    xKey?: string
    dataKey?: string
    nameKey?: string
    emptyMessage?: string
  }[]
}

function parseDateStart(v?: string | null) {
  if (!v) return null
  return new Date(`${v}T00:00:00`)
}

function parseDateEnd(v?: string | null) {
  if (!v) return null
  return new Date(`${v}T23:59:59.999`)
}

function isWithinRange(value: string | null | undefined, from?: string | null, to?: string | null) {
  if (!value) return false
  const dt = new Date(value)
  const start = parseDateStart(from)
  const end = parseDateEnd(to)
  if (start && dt < start) return false
  if (end && dt > end) return false
  return true
}

function groupCount<T>(items: T[], getKey: (item: T) => string | null | undefined) {
  const out: Record<string, number> = {}
  for (const item of items) {
    const key = getKey(item)
    if (!key) continue
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

function sortEntriesDesc(obj: Record<string, number>, limit = 10) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'tr'))
    .slice(0, limit)
}

function dailyCounts(items: any[], getDate: (item: any) => string | null | undefined) {
  const out: Record<string, number> = {}
  for (const item of items) {
    const raw = getDate(item)
    if (!raw) continue
    const key = new Date(raw).toLocaleDateString('tr-TR')
    out[key] = (out[key] ?? 0) + 1
  }
  return Object.entries(out)
    .sort((a, b) => new Date(a[0].split('.').reverse().join('-')).getTime() - new Date(b[0].split('.').reverse().join('-')).getTime())
    .map(([tarih, toplam]) => ({ tarih, toplam }))
}

function pct(num: number, den: number) {
  if (!den) return 0
  return Math.round((num / den) * 100)
}

function locationPath(id: string, map: Map<string, any>) {
  const parts: string[] = []
  let cur = map.get(id)
  let safety = 0
  while (cur && safety < 10) {
    parts.unshift(cur.tanim ?? '-')
    if (!cur.parent_id) break
    cur = map.get(cur.parent_id)
    safety += 1
  }
  return parts.join(' > ')
}

function findTopLocationId(id: string | null | undefined, map: Map<string, any>) {
  if (!id) return null
  let cur = map.get(id)
  let safety = 0
  while (cur && cur.parent_id && safety < 20) {
    cur = map.get(cur.parent_id)
    safety += 1
  }
  return cur?.id ?? id
}

function collectDescendantIds(rootId: string | null | undefined, locs: any[]) {
  if (!rootId) return [] as string[]
  const result: string[] = []
  const stack = locs.filter((x: any) => x.parent_id === rootId).map((x: any) => x.id)
  while (stack.length) {
    const currentId = stack.pop()!
    result.push(currentId)
    for (const child of locs.filter((x: any) => x.parent_id === currentId)) {
      stack.push(child.id)
    }
  }
  return result
}

function chartOrEmpty(config: QuickReportResponse['charts'][number]) {
  if (config.data.length) return config
  return { ...config, emptyMessage: 'Seçilen filtrelerle gösterilecek veri bulunamadı.' }
}

export async function buildQuickReport(type: QuickReportType, filters: Filters): Promise<QuickReportResponse> {
  const admin = createAdminClient()

  let locQuery = admin.from('lokasyonlar').select('id,firma_id,tanim,parent_id,aktif')
  let userQuery = admin.from('users').select('id,firma_id,isim_soyisim,rol,aktif').in('rol', ['tenant_admin', 'tenant_user'])
  if (filters.firmaId) {
    locQuery = locQuery.eq('firma_id', filters.firmaId)
    userQuery = userQuery.eq('firma_id', filters.firmaId)
  }
  if (filters.projeId) {
    locQuery = (locQuery as any).eq('proje_id', filters.projeId)
    // U kullanıcıları projeye göre filtrele, TA her zaman
    // Pratik çözüm: proje_id filtresi sadece tenant_user için - ama sorgu karmaşıklaşır
    // En temiz: proje lokasyonlarına atanmış kullanıcıları döndür
    userQuery = (userQuery as any).or(`rol.eq.tenant_admin,proje_id.eq.${filters.projeId}`)
  }

  const [{ data: locations, error: locError }, { data: users, error: userError }] = await Promise.all([locQuery, userQuery])
  if (locError) throw new Error(locError.message)
  if (userError) throw new Error(userError.message)

  const locs = locations ?? []
  const userList = users ?? []
  const locMap = new Map<string, any>(locs.map((x: any) => [x.id, x]))
  const userMap = new Map<string, string>(userList.map((x: any) => [x.id, x.isim_soyisim ?? '-']))
  const locationOptions = locs.map((x: any) => ({ id: x.id, label: locationPath(x.id, locMap) || x.tanim || '-', parentId: x.parent_id ?? null }))
  const userOptions = userList.map((x: any) => ({ id: x.id, label: x.isim_soyisim ?? '-' })).sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'tr'))

  if (type === 'locations') {
    const [liveTasks, { data: manualTasks, error: manualError }] = await Promise.all([
      fetchCanliGorevlerMerged(admin, 'id,lokasyon_id,durum,olusturma_tarihi,tamamlanma_tarihi,firma_id', filters),
      (() => {
        let q = filters.firmaId
          ? admin.from('gorevler').select('id,lokasyon_id,durum,olusturma_tarihi,tamamlanma_tarihi,firma_id').eq('firma_id', filters.firmaId)
          : admin.from('gorevler').select('id,lokasyon_id,durum,olusturma_tarihi,tamamlanma_tarihi,firma_id')
        if (filters.projeId) q = (q as any).eq('proje_id', filters.projeId)
        return q
      })(),
    ])
    if (manualError) throw new Error(manualError.message)
    const allTasks = [...liveTasks, ...(manualTasks ?? [])].filter((x: any) => isWithinRange(x.olusturma_tarihi, filters.dateFrom, filters.dateTo))

    const parentLocs = locs.filter((x: any) => !x.parent_id)
    const childCountMap: Record<string, number> = {}
    for (const item of locs) {
      let cur = item.parent_id ? locMap.get(item.parent_id) : null
      while (cur) {
        childCountMap[cur.id] = (childCountMap[cur.id] ?? 0) + 1
        cur = cur.parent_id ? locMap.get(cur.parent_id) : null
      }
    }
    const graph1 = parentLocs.map((x: any) => ({ lokasyon: x.tanim ?? '-', altLokasyon: childCountMap[x.id] ?? 0 }))
      .sort((a: { altLokasyon: number; lokasyon: string }, b: { altLokasyon: number; lokasyon: string }) => b.altLokasyon - a.altLokasyon || a.lokasyon.localeCompare(b.lokasyon, 'tr'))

    const activeTopLocCounts: Record<string, number> = {}
    for (const task of allTasks) {
      const topId = findTopLocationId(task.lokasyon_id, locMap)
      if (!topId) continue
      activeTopLocCounts[topId] = (activeTopLocCounts[topId] ?? 0) + 1
    }
    const graph2 = sortEntriesDesc(activeTopLocCounts, 10).map(([id, toplam]) => ({
      lokasyon: locMap.get(id)?.tanim || '-',
      gorev: toplam,
    }))

    const selectedTopLocationId = filters.locationId || parentLocs[0]?.id || null
    const descendantIds = collectDescendantIds(selectedTopLocationId, locs)
    const descendantIdSet = new Set(descendantIds)
    const descendantTasks = allTasks.filter((x: any) => descendantIdSet.has(x.lokasyon_id))
    const descendantCounts = groupCount(descendantTasks, (x: any) => x.lokasyon_id)
    const descendantTotal = Object.values(descendantCounts).reduce((sum, value) => sum + value, 0)
    const graph3 = sortEntriesDesc(descendantCounts, 12).map(([id, toplam]) => ({
      altLokasyon: locMap.get(id)?.tanim || '-',
      gorev: toplam,
      oran: pct(toplam, descendantTotal),
    }))

    const successMap: Record<string, { total: number; completed: number }> = {}
    for (const item of descendantTasks) {
      if (!item.lokasyon_id) continue
      successMap[item.lokasyon_id] = successMap[item.lokasyon_id] ?? { total: 0, completed: 0 }
      successMap[item.lokasyon_id].total += 1
      if (item.durum === 'TAMAMLANDI') successMap[item.lokasyon_id].completed += 1
    }
    const graph4 = Object.entries(successMap)
      .map(([id, meta]) => ({
        altLokasyon: locMap.get(id)?.tanim || '-',
        basari: pct(meta.completed, meta.total),
        tamamlanan: meta.completed,
        diger: Math.max(0, meta.total - meta.completed),
      }))
      .sort((a, b) => b.basari - a.basari || b.tamamlanan - a.tamamlanan)
      .slice(0, 10)

    return {
      type,
      summary: [
        { title: 'Toplam Lokasyon', value: locs.length },
        { title: 'Ana Lokasyon', value: parentLocs.length },
        { title: 'Tarihli Görev', value: allTasks.length, hint: 'Seçilen aralıkta' },
      ],
      options: { locations: locationOptions, users: userOptions, statuses: ['TAMAMLANDI', 'BEKLEMEDE', 'ACIK', 'ISLEMDE', 'IPTAL', 'ZAMANINDA_YAPILAMAYAN', 'HAZIR'] },
      charts: [
        chartOrEmpty({ key: 'g1', title: 'Ana lokasyonlar ve toplam alt lokasyon sayıları', chart: 'bar', data: graph1, xKey: 'lokasyon', dataKey: 'altLokasyon' }),
        chartOrEmpty({ key: 'g2', title: 'En aktif lokasyonlar', subtitle: 'Görev sayısına göre', chart: 'bar', data: graph2, xKey: 'lokasyon', dataKey: 'gorev' }),
        chartOrEmpty({ key: 'g3', title: 'En aktif alt / alt alt lokasyonlar', subtitle: selectedTopLocationId ? `Seçili üst lokasyon altındaki toplam ${descendantTotal} görev` : 'Üst lokasyon seçin', chart: 'bar', data: graph3, xKey: 'altLokasyon', dataKey: 'gorev' }),
        chartOrEmpty({ key: 'g4', title: 'En başarılı lokasyonlar', subtitle: selectedTopLocationId ? 'Alt lokasyon bazında tamamlanan ve diğer görev dağılımı' : 'Üst lokasyon seçin', chart: 'grouped_bar', data: graph4, xKey: 'altLokasyon', dataKey: 'tamamlanan' }),
      ],
    }
  }

  if (type === 'users') {
    const [liveTasks, { data: manualTasks, error: manualError }] = await Promise.all([
      fetchCanliGorevlerMerged(admin, 'id,durum,olusturma_tarihi,baslatan_kullanici_id,tamamlayan_kullanici_id,islemi_yapan_id,atanan_kullanici_id,firma_id', filters),
      (() => {
        let q = filters.firmaId
          ? admin.from('gorevler').select('id,durum,olusturma_tarihi,atanan_kullanici_id,olusturan_id,islemi_yapan_id,firma_id').eq('firma_id', filters.firmaId)
          : admin.from('gorevler').select('id,durum,olusturma_tarihi,atanan_kullanici_id,olusturan_id,islemi_yapan_id,firma_id')
        if (filters.projeId) q = (q as any).eq('proje_id', filters.projeId)
        return q
      })(),
    ])
    if (manualError) throw new Error(manualError.message)

    const rangedLive   = liveTasks.filter((x: any) => isWithinRange(x.olusturma_tarihi, filters.dateFrom, filters.dateTo))
    const rangedManual = (manualTasks ?? []).filter((x: any) => isWithinRange(x.olusturma_tarihi, filters.dateFrom, filters.dateTo))

    const activity: Record<string, number> = {}
    for (const item of rangedLive) {
      for (const uid of [item.atanan_kullanici_id, item.baslatan_kullanici_id, item.tamamlayan_kullanici_id, item.islemi_yapan_id]) {
        if (!uid) continue
        activity[uid] = (activity[uid] ?? 0) + 1
      }
    }
    for (const item of rangedManual) {
      for (const uid of [item.atanan_kullanici_id, item.olusturan_id, item.islemi_yapan_id]) {
        if (!uid) continue
        activity[uid] = (activity[uid] ?? 0) + 1
      }
    }
    const graph1 = sortEntriesDesc(activity, 10).map(([id, toplam]) => ({ personel: userMap.get(id) ?? '-', aktivite: toplam }))

    const success: Record<string, number> = {}
    for (const item of rangedLive) {
      if (item.durum === 'TAMAMLANDI' && item.tamamlayan_kullanici_id) success[item.tamamlayan_kullanici_id] = (success[item.tamamlayan_kullanici_id] ?? 0) + 1
    }
    for (const item of rangedManual) {
      if (item.durum === 'TAMAMLANDI' && item.islemi_yapan_id) success[item.islemi_yapan_id] = (success[item.islemi_yapan_id] ?? 0) + 1
    }
    const graph2 = sortEntriesDesc(success, 10).map(([id, toplam]) => ({ personel: userMap.get(id) ?? '-', tamamlanan: toplam }))

    const failMeta: Record<string, { total: number; completed: number }> = {}
    const allUserIds = userList.map((u: any) => u.id)
    const resolveTaskUserId = (item: any) =>
      item?.atanan_kullanici_id ||
      item?.islemi_yapan_id ||
      item?.tamamlayan_kullanici_id ||
      item?.baslatan_kullanici_id ||
      item?.olusturan_id ||
      null

    for (const uid of allUserIds) failMeta[uid] = { total: 0, completed: success[uid] ?? 0 }
    for (const item of [...rangedLive, ...rangedManual]) {
      const uid = resolveTaskUserId(item)
      if (!uid) continue
      failMeta[uid] = failMeta[uid] ?? { total: 0, completed: 0 }
      failMeta[uid].total += 1
    }
    const graph3 = Object.entries(failMeta)
      .map(([id, meta]) => ({ personel: userMap.get(id) ?? '-', tamamlanan: meta.completed, toplam: meta.total, basarisizlik: Math.max(0, meta.total - meta.completed) }))
      .filter((x) => x.toplam > 0)
      .sort((a, b) => b.basarisizlik - a.basarisizlik || a.tamamlanan - b.tamamlanan)
      .slice(0, 10)

    const targetUserId = filters.userId || null
    const statuses = Array.from(new Set([...rangedLive.map((x: any) => x.durum), ...rangedManual.map((x: any) => x.durum)].filter(Boolean))).sort()
    const userTaskRows = [...rangedLive, ...rangedManual].filter((item: any) => {
      const uid = resolveTaskUserId(item)
      if (targetUserId && uid !== targetUserId) return false
      if (filters.status && item.durum !== filters.status) return false
      return true
    })
    const graph4 = dailyCounts(userTaskRows, (x) => x.olusturma_tarihi)

    const personnelWithActivity = new Set(Object.keys(activity)).size

    return {
      type,
      summary: [
        { title: 'Toplam Personel', value: userList.length },
        { title: 'Hareketli Personel', value: personnelWithActivity, hint: 'Seçili aralıkta görev hareketi olan' },
        { title: 'Seçili Aralık Aktivitesi', value: rangedLive.length + rangedManual.length },
      ],
      options: { locations: locationOptions, users: userOptions, statuses },
      charts: [
        chartOrEmpty({ key: 'g1', title: 'En aktif personeller', subtitle: 'Görev hareketliliğine göre', chart: 'bar', data: graph1, xKey: 'personel', dataKey: 'aktivite' }),
        chartOrEmpty({ key: 'g2', title: 'En başarılı personeller', subtitle: 'En fazla tamamlanan yapanlar', chart: 'bar', data: graph2, xKey: 'personel', dataKey: 'tamamlanan' }),
        chartOrEmpty({ key: 'g3', title: 'En başarısız personeller', subtitle: 'Tamamlanan dışındaki görev yüküne göre', chart: 'bar', data: graph3, xKey: 'personel', dataKey: 'basarisizlik' }),
        chartOrEmpty({ key: 'g4', title: 'Personel görev sayıları', subtitle: targetUserId ? `Seçili personel: ${userMap.get(targetUserId) ?? '-'}` : 'Tüm personeller', chart: 'line', data: graph4, xKey: 'tarih', dataKey: 'toplam' }),
      ],
    }
  }

  const tableName = type === 'live_tasks' ? null : 'gorevler'
  const statuses = type === 'live_tasks'
    ? ['HAZIR', 'ACIK', 'BEKLEMEDE', 'ISLEMDE', 'IPTAL', 'TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS']
    : ['ACIK', 'ISLEMDE', 'IPTAL', 'TAMAMLANDI']

  let tasks: any[]
  if (type === 'live_tasks') {
    // Aktif + arşiv birleşimi
    tasks = await fetchCanliGorevlerMerged(admin, 'id,tanim,durum,olusturma_tarihi,tamamlanma_tarihi,lokasyon_id,firma_id', filters)
  } else {
    let taskQuery = admin.from('gorevler').select('id,tanim,durum,olusturma_tarihi,tamamlanma_tarihi,lokasyon_id,firma_id')
    if (filters.firmaId) taskQuery = taskQuery.eq('firma_id', filters.firmaId)
    if (filters.projeId) taskQuery = (taskQuery as any).eq('proje_id', filters.projeId)
    const { data: t, error: taskError } = await taskQuery
    if (taskError) throw new Error(taskError.message)
    tasks = t ?? []
  }
  const rangedTasks = tasks.filter((x: any) => isWithinRange(x.olusturma_tarihi, filters.dateFrom, filters.dateTo))

  const statusCounts = statuses.map((s) => ({ durum: s, toplam: rangedTasks.filter((x: any) => x.durum === s).length }))
  const selectedStatus = filters.status || statuses[0] || null
  const statusTrend = dailyCounts(rangedTasks.filter((x: any) => !selectedStatus || x.durum === selectedStatus), (x) => x.olusturma_tarihi)
  const locScoped = rangedTasks.filter((x: any) => {
    if (filters.locationId && x.lokasyon_id !== filters.locationId) return false
    if (selectedStatus && x.durum !== selectedStatus) return false
    return true
  })
  // ── LOKASYON GRUPLARI ──────────────────────────────────────────────────
  if (type === 'location_groups') {
    // Üst lokasyonlar (parent_id = null)
    const parentLocs = locs.filter((x: any) => !x.parent_id)
    const parentLocOptions = parentLocs.map((x: any) => ({ id: x.id, label: x.tanim ?? '-' }))
      .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'tr'))

    // Proje filtreli lokasyon id seti (grup ve üye filtresi için)
    const projeLokIds = new Set(locs.map((x: any) => x.id))

    // Grupları çek
    let grpQ = admin.from('lokasyon_gruplari').select('id,firma_id,ad,ust_lokasyon_id,kayit_tarihi').order('ad')
    if (filters.firmaId) grpQ = grpQ.eq('firma_id', filters.firmaId)
    if (filters.projeId) grpQ = (grpQ as any).eq('proje_id', filters.projeId)
    const { data: grpListRaw } = await grpQ
    const grpList = grpListRaw ?? []

    // Seçili üst lokasyon filtresi
    const selectedParentId = filters.parentLocationId || null
    const filteredGrpList = selectedParentId
      ? grpList.filter((g: any) => g.ust_lokasyon_id === selectedParentId)
      : grpList

    // Üyeleri çek — proje filtreli lokasyonlarla sınırla
    const { data: members } = await admin.from('lokasyon_grup_uyeleri').select('grup_id,lokasyon_id')
    const grpLocMap: Record<string, string[]> = {}
    for (const m of members ?? []) {
      // Proje filtresi: sadece projedeki lokasyonları say
      if (!projeLokIds.has(m.lokasyon_id)) continue
      if (!grpLocMap[m.grup_id]) grpLocMap[m.grup_id] = []
      grpLocMap[m.grup_id].push(m.lokasyon_id)
    }

    // Seçili gruptaki lokasyon id'leri
    const selectedGrpId = filters.groupId || null
    const activeGrpIds = selectedGrpId ? [selectedGrpId] : filteredGrpList.map((g: any) => g.id)
    const activeLocIds = activeGrpIds.flatMap((gid: string) => grpLocMap[gid] ?? [])

    // Görevleri çek — aktif + arşiv birleşimi, projeId filtreli
    const arsivCols = 'lokasyon_id,durum,aktif_olma_tarihi,firma_id'
    let qAktifGrp = admin.from('canli_gorevler').select(arsivCols)
    let qArsivGrp  = admin.from('canli_gorevler_arsiv').select(arsivCols)
    if (filters.firmaId) { qAktifGrp = qAktifGrp.eq('firma_id', filters.firmaId); qArsivGrp = qArsivGrp.eq('firma_id', filters.firmaId) }
    if (filters.projeId) { qAktifGrp = (qAktifGrp as any).eq('proje_id', filters.projeId); qArsivGrp = (qArsivGrp as any).eq('proje_id', filters.projeId) }
    if (filters.dateFrom) { const v = new Date(filters.dateFrom + 'T00:00:00+03:00').toISOString(); qAktifGrp = qAktifGrp.gte('aktif_olma_tarihi', v); qArsivGrp = qArsivGrp.gte('aktif_olma_tarihi', v) }
    if (filters.dateTo)   { const v = new Date(filters.dateTo + 'T23:59:59+03:00').toISOString(); qAktifGrp = qAktifGrp.lte('aktif_olma_tarihi', v);   qArsivGrp = qArsivGrp.lte('aktif_olma_tarihi', v) }
    if (activeLocIds.length > 0) {
      qAktifGrp = qAktifGrp.in('lokasyon_id', activeLocIds)
      qArsivGrp  = (qArsivGrp as any).in('lokasyon_id', activeLocIds)
    }

    const [aktifGrp, arsivGrp] = await Promise.all([
      fetchAll(() => qAktifGrp),
      fetchAll(() => qArsivGrp),
    ])
    const gorevler = [...arsivGrp, ...aktifGrp]
    const locGorevMap: Record<string, { toplam: number; tamamlanan: number }> = {}
    for (const g of gorevler ?? []) {
      if (!g.lokasyon_id) continue
      if (!locGorevMap[g.lokasyon_id]) locGorevMap[g.lokasyon_id] = { toplam: 0, tamamlanan: 0 }
      locGorevMap[g.lokasyon_id].toplam++
      if (g.durum === 'TAMAMLANDI') locGorevMap[g.lokasyon_id].tamamlanan++
    }

    // Grup bazında istatistik
    // Bar label: "ÜstLokasyon / Grup" formatı (filtre yoksa), sadece grup adı (filtre varsa)
    const grpStats = filteredGrpList.map((grp: any) => {
      const ustLokTanim = locMap.get(grp.ust_lokasyon_id)?.tanim ?? null
      const barLabel = selectedParentId
        ? grp.ad
        : (ustLokTanim ? `${ustLokTanim} / ${grp.ad}` : grp.ad)
      const lIds = grpLocMap[grp.id] ?? []
      let toplam = 0, tamamlanan = 0
      for (const lid of lIds) { toplam += locGorevMap[lid]?.toplam ?? 0; tamamlanan += locGorevMap[lid]?.tamamlanan ?? 0 }
      const basari = toplam > 0 ? Math.round((tamamlanan / toplam) * 100) : 0
      return { grup: barLabel, toplam, tamamlanan, basari, lokasyon_sayisi: lIds.length }
    }).sort((a: { toplam: number; grup: string }, b: { toplam: number; grup: string }) => b.toplam - a.toplam)

    // Günlük trend
    const trendMap: Record<string, { tamamlanan: number; diger: number }> = {}
    for (const g of gorevler ?? []) {
      const day = (g.aktif_olma_tarihi ?? '').slice(0, 10)
      if (!day) continue
      if (!trendMap[day]) trendMap[day] = { tamamlanan: 0, diger: 0 }
      if (g.durum === 'TAMAMLANDI') trendMap[day].tamamlanan++
      else trendMap[day].diger++
    }
    const trendData = Object.entries(trendMap).sort(([a], [b]) => a.localeCompare(b))
      .map(([tarih, v]) => ({ tarih, tamamlanan: v.tamamlanan, diger: v.diger }))

    // Grup options: parentId = ust_lokasyon_id (client-side Seçim2 filtresi için)
    const grpOptions = (grpList ?? []).map((g: any) => ({ id: g.id, label: g.ad, parentId: g.ust_lokasyon_id ?? null }))

    const totalToplam = grpStats.reduce((s: number, x: { toplam: number }) => s + x.toplam, 0)
    const totalTamamlanan = grpStats.reduce((s: number, x: { tamamlanan: number }) => s + x.tamamlanan, 0)
    const genelBasari = totalToplam > 0 ? Math.round((totalTamamlanan / totalToplam) * 100) : 0

    const parentLabel = selectedParentId ? (locMap.get(selectedParentId)?.tanim ?? '-') : null
    const grpLabel = selectedGrpId ? ((grpList ?? []).find((g: any) => g.id === selectedGrpId)?.ad ?? '-') : null
    const trendSubtitle = grpLabel ? `Grup: ${grpLabel}` : parentLabel ? `Üst lokasyon: ${parentLabel}` : 'Tüm gruplar'

    return {
      type,
      summary: [
        { title: 'Toplam Grup', value: (grpList ?? []).length },
        { title: 'Filtrelenen Grup', value: filteredGrpList.length },
        { title: 'Toplam Görev', value: totalToplam, hint: 'Tarih aralığı' },
        { title: 'Genel Başarı', value: `%${genelBasari}` },
      ],
      options: { locations: grpOptions, parentLocations: parentLocOptions, users: [], statuses: [] },
      charts: [
        chartOrEmpty({ key: 'lg1', title: 'Grup bazlı görev sayısı', subtitle: parentLabel ? `Üst lokasyon: ${parentLabel}` : 'Tüm gruplar', chart: 'bar', data: grpStats, xKey: 'grup', dataKey: 'toplam' }),
        chartOrEmpty({ key: 'lg2', title: 'Grup bazlı başarı oranı (%)', subtitle: parentLabel ? `Üst lokasyon: ${parentLabel}` : 'Tüm gruplar', chart: 'bar', data: grpStats, xKey: 'grup', dataKey: 'basari' }),
        chartOrEmpty({ key: 'lg3', title: 'Günlük görev trendi', subtitle: trendSubtitle, chart: 'line', data: trendData, xKey: 'tarih', dataKey: 'tamamlanan' }),
        chartOrEmpty({ key: 'lg4', title: 'Lokasyon sayısına göre gruplar', subtitle: parentLabel ? `Üst lokasyon: ${parentLabel}` : 'Tüm gruplar', chart: 'bar', data: grpStats, xKey: 'grup', dataKey: 'lokasyon_sayisi' }),
      ],
    }
  }

  const locTrend = dailyCounts(locScoped, (x) => x.olusturma_tarihi)
  const failedStatuses = statuses.filter((s) => s !== 'TAMAMLANDI')
  const failCounts = failedStatuses.map((durum) => ({ durum, toplam: rangedTasks.filter((x: any) => x.durum === durum).length }))

  return {
    type,
    summary: [
      { title: type === 'live_tasks' ? 'Frekansiyel Görev' : 'Spesifik Görev', value: rangedTasks.length, hint: 'Seçilen tarih aralığı' },
      { title: 'Tamamlanan', value: rangedTasks.filter((x: any) => x.durum === 'TAMAMLANDI').length },
      { title: 'Başarısız / Diğer', value: rangedTasks.filter((x: any) => x.durum !== 'TAMAMLANDI').length },
    ],
    options: { locations: locationOptions, users: userOptions, statuses },
    charts: [
      chartOrEmpty({ key: 'g1', title: 'Görev durum grafiği', subtitle: 'Toplam durum dağılımı', chart: 'bar', data: statusCounts, xKey: 'durum', dataKey: 'toplam' }),
      chartOrEmpty({ key: 'g2', title: 'Tarih ve görev durum seçimli grafik', subtitle: selectedStatus ? `Seçili durum: ${selectedStatus}` : 'Tüm durumlar', chart: 'line', data: statusTrend, xKey: 'tarih', dataKey: 'toplam' }),
      chartOrEmpty({ key: 'g3', title: 'Tarih, lokasyon ve görev durum seçimli grafik', subtitle: filters.locationId ? `Seçili lokasyon: ${locationPath(filters.locationId, locMap) || locMap.get(filters.locationId)?.tanim || '-'}` : 'Tüm lokasyonlar', chart: 'line', data: locTrend, xKey: 'tarih', dataKey: 'toplam' }),
      chartOrEmpty({ key: 'g4', title: 'Başarısız görevler grafiği', subtitle: 'Tamamlandı olmayan toplam görevler', chart: 'pie', data: failCounts, nameKey: 'durum', dataKey: 'toplam' }),
    ],
  }
}
