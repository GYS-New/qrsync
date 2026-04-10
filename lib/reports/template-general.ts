import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'

export type GeneralTemplateFilters = {
  firmaId?: string | null
  topLocationId?: string | null
  locationId?: string | null
  reportDate?: string | null
  requestedByName?: string | null
}

export type GeneralTemplateTaskRow = {
  no: number
  personel: string
  lokasyon: string
  gorevNo: string
  gorevTanimi: string
  tarihSaat: string
  durum?: string
  sapmaNedeni?: string
}

export type GeneralTemplateGroupRow = {
  no: number
  grup: string
  lokasyon: string
  gunlukFrekansSayisi: number
  hedefFrekansSayisi: number
  tamamlananFrekansSayisi: number
  sapmaFrekansSayisi: number
  kayipFrekansSayisi: number
  basariliIslemOrani: number
  genelOran: number
}

export type GeneralTemplatePayload = {
  template: 'genel'
  generatedAt: string
  reportDate: string
  params: {
    firmaId: string | null
    firma: string
    topLocationId: string | null
    topLocation: string
    locationId: string | null
    location: string
    reportDate: string
    reportDayCount: number
    requestedBy: string
  }
  stats: {
    totalFrequency: number
    completedFrequency: number
    realizedFrequency: number
    deviationFrequency: number
    lostFrequency: number
    successAverage: number
    completionRatio: number
    lossRatio: number
  }
  options: {
    firmalar: { id: string; label: string }[]
    topLocations: { id: string; label: string }[]
    locations: { id: string; label: string; parentId: string | null }[]
  }
  visibleGroups: GeneralTemplateGroupRow[]
  allGroups: GeneralTemplateGroupRow[]
  completedTasks: GeneralTemplateTaskRow[]
  deviationTasks: GeneralTemplateTaskRow[]
}

function toDayInput(value?: string | null) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function startOfDayIso(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toISOString()
}

function endOfDayIso(value: string) {
  return new Date(`${value}T23:59:59.999Z`).toISOString()
}

function formatDateTime(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const trt = new Date(d.getTime() + 3 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(trt.getUTCDate())}.${pad(trt.getUTCMonth() + 1)}.${trt.getUTCFullYear()} ${pad(trt.getUTCHours())}:${pad(trt.getUTCMinutes())}`
}

function formatDateOnly(value?: string | null) {
  if (!value) return ''
  const d = new Date(`${value}T00:00:00`)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function pct(num: number, den: number) {
  if (!den) return 0
  return Number(((num / den) * 100).toFixed(1))
}

function clampText(value: string, max = 200) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

function slugId(value: string) {
  return value.replace(/-/g, '').slice(0, 8).toUpperCase()
}

function locationPath(id: string, map: Map<string, any>) {
  const parts: string[] = []
  let cur = map.get(id)
  let safety = 0
  while (cur && safety < 20) {
    parts.unshift(cur.tanim ?? '-')
    if (!cur.parent_id) break
    cur = map.get(cur.parent_id)
    safety += 1
  }
  return parts.join(' > ')
}

function collectDescendantIds(rootId: string | null | undefined, locMap: Map<string, any>) {
  if (!rootId) return new Set<string>()
  const result = new Set<string>()
  const stack = [rootId]
  while (stack.length) {
    const current = stack.pop() as string
    if (result.has(current)) continue
    result.add(current)
    for (const item of Array.from(locMap.values())) {
      if (item.parent_id === current) stack.push(item.id)
    }
  }
  return result
}

function findTopLocationId(locId: string | null | undefined, map: Map<string, any>) {
  if (!locId) return null
  let cur = map.get(locId)
  let safety = 0
  while (cur && cur.parent_id && safety < 20) {
    cur = map.get(cur.parent_id)
    safety += 1
  }
  return cur?.id ?? locId
}

export async function buildGeneralTemplateReport(filters: GeneralTemplateFilters): Promise<GeneralTemplatePayload> {
  const admin = createAdminClient()
  const reportDate = toDayInput(filters.reportDate)
  const dayStart = startOfDayIso(reportDate)
  const dayEnd = endOfDayIso(reportDate)

  const [{ data: firms, error: firmError }, { data: locations, error: locError }, { data: users, error: userError }] = await Promise.all([
    admin.from('firmalar').select('id,firma_adi,ticari_unvan').order('firma_adi', { ascending: true }),
    admin.from('lokasyonlar').select('id,firma_id,tanim,parent_id').order('kayit_tarihi', { ascending: true }),
    admin.from('users').select('id,firma_id,isim_soyisim,rol').in('rol', ['tenant_admin', 'tenant_user']).order('isim_soyisim', { ascending: true }),
  ])

  if (firmError) throw new Error(firmError.message)
  if (locError) throw new Error(locError.message)
  if (userError) throw new Error(userError.message)

  const allFirms = firms ?? []
  const requestedFirmaId = filters.firmaId ?? null
  const activeFirmaId = requestedFirmaId ?? allFirms[0]?.id ?? null
  const firma = allFirms.find((item: any) => item.id === activeFirmaId) ?? null
  const firmaLabel = firma ? (firma.firma_adi || firma.ticari_unvan || '-') : 'Tüm firmalar'

  const scopedLocations = (locations ?? []).filter((item: any) => !activeFirmaId || item.firma_id === activeFirmaId)
  const locMap = new Map<string, any>(scopedLocations.map((item: any) => [item.id, item]))
  const topLocations = scopedLocations.filter((item: any) => !item.parent_id)
  const topLocationId = filters.topLocationId && locMap.has(filters.topLocationId)
    ? filters.topLocationId
    : (filters.locationId ? findTopLocationId(filters.locationId, locMap) : null) || topLocations[0]?.id || null

  const topLocation = topLocationId ? locMap.get(topLocationId) : null
  const availableLocationIds = collectDescendantIds(topLocationId, locMap)
  const locationOptions = Array.from(availableLocationIds)
    .filter((id) => id !== topLocationId)
    .map((id) => ({ id, label: locationPath(id, locMap) || locMap.get(id)?.tanim || '-', parentId: locMap.get(id)?.parent_id ?? null }))
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'))

  const locationId = filters.locationId && availableLocationIds.has(filters.locationId)
    ? filters.locationId
    : null

  const scopeLocationIds = locationId ? collectDescendantIds(locationId, locMap) : availableLocationIds
  const location = locationId ? locMap.get(locationId) : null

  const liveTaskQueryFn = () => {
    let q = admin
      .from('canli_gorevler')
      .select('id,firma_id,lokasyon_id,tanim,durum,olusturma_tarihi,tamamlanma_tarihi,islemi_yapan_id,tamamlayan_kullanici_id,atanan_kullanici_id')
      .gte('olusturma_tarihi', dayStart)
      .lte('olusturma_tarihi', dayEnd)
    if (activeFirmaId) q = q.eq('firma_id', activeFirmaId)
    return q
  }

  let groupsQuery = admin
    .from('lokasyon_gruplari')
    .select('id,firma_id,ad,ust_lokasyon_id,aktif')
    .eq('aktif', true)
  if (activeFirmaId) groupsQuery = groupsQuery.eq('firma_id', activeFirmaId)
  if (topLocationId) groupsQuery = groupsQuery.eq('ust_lokasyon_id', topLocationId)

  const [liveTasks, { data: groups, error: groupsError }, { data: groupMembers, error: groupMembersError }] = await Promise.all([
    fetchAll(liveTaskQueryFn),
    groupsQuery,
    admin.from('lokasyon_grup_uyeleri').select('grup_id,lokasyon_id'),
  ])

  if (groupsError) throw new Error(groupsError.message)
  if (groupMembersError) throw new Error(groupMembersError.message)

  const scopedUsers = (users ?? []).filter((item: any) => !activeFirmaId || item.firma_id === activeFirmaId)
  const userMap = new Map<string, string>(scopedUsers.map((item: any) => [item.id, item.isim_soyisim ?? '-']))

  const scopedTasks = liveTasks.filter((item: any) => item.lokasyon_id && scopeLocationIds.has(item.lokasyon_id))

  const memberMap = new Map<string, string[]>()
  for (const member of groupMembers ?? []) {
    const arr = memberMap.get((member as any).grup_id) ?? []
    arr.push((member as any).lokasyon_id)
    memberMap.set((member as any).grup_id, arr)
  }

  const fallbackGroups = (topLocationId
    ? scopedLocations.filter((item: any) => item.parent_id === topLocationId)
    : topLocations
  ).map((item: any) => ({
    id: item.id,
    ad: item.tanim ?? '-',
    ust_lokasyon_id: topLocationId,
    aktif: true,
    lokasyonIds: Array.from(collectDescendantIds(item.id, locMap)),
  }))

  const rawGroups = (groups ?? []).length
    ? (groups ?? []).map((group: any) => ({
        ...group,
        lokasyonIds: (memberMap.get(group.id) ?? []).filter((locId) => scopeLocationIds.has(locId)),
      }))
    : fallbackGroups

  const usableGroups = rawGroups
    .map((group: any) => {
      const locIds = Array.from(new Set((group.lokasyonIds ?? []).filter((id: string) => scopeLocationIds.has(id))))
      const tasks = scopedTasks.filter((item: any) => locIds.includes(item.lokasyon_id))
      const target = tasks.length
      const completed = tasks.filter((item: any) => item.durum === 'TAMAMLANDI').length
      const deviation = tasks.filter((item: any) => item.durum === 'ZAMANINDA_YAPILAMAYAN').length
      const lost = Math.max(0, target - completed - deviation)
      return {
        grup: group.ad ?? '-',
        lokasyon: locIds.slice(0, 4).map((id: unknown) => locMap.get(id as string)?.tanim || '-').join(', '),
        gunlukFrekansSayisi: target,
        hedefFrekansSayisi: target,
        tamamlananFrekansSayisi: completed,
        sapmaFrekansSayisi: deviation,
        kayipFrekansSayisi: lost,
        basariliIslemOrani: pct(completed, target),
        genelOran: pct(completed + deviation, target),
      }
    })
    .filter((row) => row.hedefFrekansSayisi > 0)
    .sort((a, b) => b.hedefFrekansSayisi - a.hedefFrekansSayisi || a.grup.localeCompare(b.grup, 'tr'))

  const groupRows: GeneralTemplateGroupRow[] = (usableGroups.length ? usableGroups : [{
    grup: location ? (location.tanim ?? '-') : (topLocation?.tanim ?? 'Seçili kapsam'),
    lokasyon: location ? locationPath(location.id, locMap) : (topLocation ? locationPath(topLocation.id, locMap) : '-'),
    gunlukFrekansSayisi: scopedTasks.length,
    hedefFrekansSayisi: scopedTasks.length,
    tamamlananFrekansSayisi: scopedTasks.filter((item: any) => item.durum === 'TAMAMLANDI').length,
    sapmaFrekansSayisi: scopedTasks.filter((item: any) => item.durum === 'ZAMANINDA_YAPILAMAYAN').length,
    kayipFrekansSayisi: Math.max(0, scopedTasks.length - scopedTasks.filter((item: any) => item.durum === 'TAMAMLANDI').length - scopedTasks.filter((item: any) => item.durum === 'ZAMANINDA_YAPILAMAYAN').length),
    basariliIslemOrani: pct(scopedTasks.filter((item: any) => item.durum === 'TAMAMLANDI').length, scopedTasks.length),
    genelOran: pct(scopedTasks.filter((item: any) => ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'].includes(item.durum)).length, scopedTasks.length),
  }]).map((row, index) => ({ no: index + 1, ...row }))

  const completedTasks: GeneralTemplateTaskRow[] = scopedTasks
    .filter((item: any) => item.durum === 'TAMAMLANDI')
    .sort((a: any, b: any) => (new Date(b.tamamlanma_tarihi || b.olusturma_tarihi).getTime() - new Date(a.tamamlanma_tarihi || a.olusturma_tarihi).getTime()))
    .map((item: any, index: number) => ({
      no: index + 1,
      personel: userMap.get(item.tamamlayan_kullanici_id) || userMap.get(item.islemi_yapan_id) || userMap.get(item.atanan_kullanici_id) || '-',
      lokasyon: locationPath(item.lokasyon_id, locMap) || locMap.get(item.lokasyon_id)?.tanim || '-',
      gorevNo: slugId(item.id),
      gorevTanimi: clampText(item.tanim ?? '-', 120),
      tarihSaat: formatDateTime(item.tamamlanma_tarihi || item.olusturma_tarihi),
      durum: item.durum ?? '',
    }))

  const deviationTasks: GeneralTemplateTaskRow[] = scopedTasks
    .filter((item: any) => item.durum === 'ZAMANINDA_YAPILAMAYAN')
    .sort((a: any, b: any) => (new Date(b.olusturma_tarihi).getTime() - new Date(a.olusturma_tarihi).getTime()))
    .map((item: any, index: number) => ({
      no: index + 1,
      personel: userMap.get(item.islemi_yapan_id) || userMap.get(item.atanan_kullanici_id) || '-',
      lokasyon: locationPath(item.lokasyon_id, locMap) || locMap.get(item.lokasyon_id)?.tanim || '-',
      gorevNo: slugId(item.id),
      gorevTanimi: clampText(item.tanim ?? '-', 120),
      tarihSaat: formatDateTime(item.olusturma_tarihi),
      sapmaNedeni: 'Zamanında yapılamayan',
    }))

  const totalFrequency = groupRows.reduce((sum, row) => sum + row.hedefFrekansSayisi, 0)
  const completedFrequency = groupRows.reduce((sum, row) => sum + row.tamamlananFrekansSayisi, 0)
  const deviationFrequency = groupRows.reduce((sum, row) => sum + row.sapmaFrekansSayisi, 0)
  const lostFrequency = groupRows.reduce((sum, row) => sum + row.kayipFrekansSayisi, 0)
  const realizedFrequency = completedFrequency + deviationFrequency
  const successAverage = pct(completedFrequency, totalFrequency)

  return {
    template: 'genel',
    generatedAt: new Date().toISOString(),
    reportDate,
    params: {
      firmaId: activeFirmaId,
      firma: firmaLabel,
      topLocationId,
      topLocation: topLocation?.tanim ?? '-',
      locationId,
      location: location?.tanim ?? 'Tüm alt lokasyonlar',
      reportDate: formatDateOnly(reportDate),
      reportDayCount: 1,
      requestedBy: filters.requestedByName || 'QRSync Kullanıcısı',
    },
    stats: {
      totalFrequency,
      completedFrequency,
      realizedFrequency,
      deviationFrequency,
      lostFrequency,
      successAverage,
      completionRatio: pct(completedFrequency, totalFrequency),
      lossRatio: pct(lostFrequency, totalFrequency),
    },
    options: {
      firmalar: allFirms.map((item: any) => ({ id: item.id, label: item.firma_adi || item.ticari_unvan || '-' })),
      topLocations: topLocations.map((item: any) => ({ id: item.id, label: item.tanim ?? '-' })),
      locations: locationOptions,
    },
    visibleGroups: groupRows.slice(0, 5),
    allGroups: groupRows,
    completedTasks,
    deviationTasks,
  }
}
