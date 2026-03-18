import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getLicenseStatus } from '@/lib/license'
import { buildExcelXml, type ExcelColumn, parseExcelXml, workbookHeadersToKeys } from './excelXml'

export type ImportEntity = 'users' | 'locations' | 'live-tasks'

type Actor = {
  id: string
  rol: string
  firma_id: string | null
}

type ImportResult = {
  importedCount: number
  errors: string[]
}

const entityLabels: Record<ImportEntity, string> = {
  users: 'Kullanicilar',
  locations: 'Lokasyonlar',
  'live-tasks': 'CanliGorevler',
}

const columnsByEntity: Record<ImportEntity, ExcelColumn[]> = {
  users: [
    { key: 'isim_soyisim', label: 'isim_soyisim' },
    { key: 'email', label: 'email' },
    { key: 'telefon', label: 'telefon' },
    { key: 'password', label: 'password' },
  ],
  locations: [
    { key: 'tanim', label: 'tanim' },
    { key: 'aciklama', label: 'aciklama' },
    { key: 'parent_yol', label: 'parent_yol' },
  ],
  'live-tasks': [
    { key: 'tanim', label: 'tanim' },
    { key: 'lokasyon_yolu', label: 'lokasyon_yolu' },
    { key: 'atanan_email', label: 'atanan_email' },
    { key: 'aktif_olma_tarihi', label: 'aktif_olma_tarihi' },
    { key: 'durum', label: 'durum' },
  ],
}

const templateRows: Record<ImportEntity, Record<string, string>[]> = {
  users: [
    {
      isim_soyisim: 'Ahmet Yilmaz',
      email: 'ahmet.yilmaz@example.com',
      telefon: '05551234567',
      password: 'Temp1234',
    },
  ],
  locations: [
    { tanim: 'Merkez Ofis', aciklama: 'Ana lokasyon', parent_yol: '' },
    { tanim: '1. Kat', aciklama: 'Operasyon katı', parent_yol: 'Merkez Ofis' },
    { tanim: 'Depo', aciklama: 'Arka depo', parent_yol: 'Merkez Ofis > 1. Kat' },
  ],
  'live-tasks': [
    {
      tanim: 'Sabah kontrol turu',
      lokasyon_yolu: 'Merkez Ofis > 1. Kat > Depo',
      atanan_email: 'ahmet.yilmaz@example.com',
      aktif_olma_tarihi: '2026-03-08 09:00',
      durum: 'HAZIR',
    },
  ],
}

function normalizePath(value: string) {
  return value
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' > ')
}

function fileNameFor(entity: ImportEntity, mode: 'template' | 'export') {
  return `${mode === 'template' ? 'sablon' : 'export'}_${entity}.xml`
}

export async function getActorAndFirma(requestedFirmaId: string | null, entity: ImportEntity) {
  const supabase = createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()
  if (!authUser) throw new Error('Oturum bulunamadı.')

  const { data: me, error } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (error || !me) throw new Error('Kullanıcı bilgisi okunamadı.')

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'

  if (!isSA && !isTA) throw new Error('Bu işlem için yetkiniz yok.')

  if (!isSA && !me.firma_id) throw new Error('Firma bilgisi bulunamadı.')

  const firmaId = isSA ? requestedFirmaId : me.firma_id
  if (!firmaId) throw new Error('Firma seçilmedi.')

  return { actor: me, firmaId, isSA, isTA, admin: createAdminClient(), label: entityLabels[entity] }
}

export function buildTemplateFile(entity: ImportEntity) {
  const xml = buildExcelXml(`${entityLabels[entity]} Şablon`, columnsByEntity[entity], templateRows[entity])
  return { xml, fileName: fileNameFor(entity, 'template') }
}

export async function buildExportFile(entity: ImportEntity, firmaId: string) {
  const admin = createAdminClient()

  if (entity === 'users') {
    const { data, error } = await admin
      .from('users')
      .select('isim_soyisim,email,telefon,aktif')
      .eq('firma_id', firmaId)
      .in('rol', ['tenant_admin', 'tenant_user'])
      .order('isim_soyisim')
    if (error) throw new Error(error.message)

    const rows = (data ?? []).map((row: any) => ({
      isim_soyisim: row.isim_soyisim ?? '',
      email: row.email ?? '',
      telefon: row.telefon ?? '',
      aktif: row.aktif ? 'true' : 'false',
    }))
    const columns = [...columnsByEntity.users, { key: 'aktif', label: 'aktif' }]
    return { xml: buildExcelXml('Kullanicilar Export', columns, rows), fileName: fileNameFor(entity, 'export') }
  }

  if (entity === 'locations') {
    const { data, error } = await admin
      .from('lokasyonlar')
      .select('id,tanim,aciklama,parent_id,aktif,nfc_token,qr_veri')
      .eq('firma_id', firmaId)
      .order('kayit_tarihi', { ascending: true })
    if (error) throw new Error(error.message)

    const map = new Map<string, any>((data ?? []).map((row: any) => [row.id, row]))
    const getPath = (id: string | null | undefined) => {
      if (!id) return ''
      const parts: string[] = []
      let current = map.get(id)
      let guard = 0
      while (current && guard < 10) {
        parts.unshift(current.tanim)
        current = current.parent_id ? map.get(current.parent_id) : null
        guard += 1
      }
      return parts.join(' > ')
    }

    const rows = (data ?? []).map((row: any) => ({
      tanim: row.tanim ?? '',
      aciklama: row.aciklama ?? '',
      parent_yol: getPath(row.parent_id),
      aktif: row.aktif ? 'true' : 'false',
      qr_veri: row.qr_veri ?? '',
      nfc_token: row.nfc_token ?? '',
    }))
    const columns = [...columnsByEntity.locations, { key: 'aktif', label: 'aktif' }, { key: 'qr_veri', label: 'qr_veri' }, { key: 'nfc_token', label: 'nfc_token' }]
    return { xml: buildExcelXml('Lokasyonlar Export', columns, rows), fileName: fileNameFor(entity, 'export') }
  }

  const { data: tasks, error: taskError } = await admin
    .from('canli_gorevler')
    .select('id,tanim,lokasyon_id,atanan_kullanici_id,aktif_olma_tarihi,durum')
    .eq('firma_id', firmaId)
    .order('aktif_olma_tarihi', { ascending: false })
  if (taskError) throw new Error(taskError.message)

  const [{ data: locations }, { data: users }] = await Promise.all([
    admin.from('lokasyonlar').select('id,tanim,parent_id').eq('firma_id', firmaId),
    admin.from('users').select('id,email').eq('firma_id', firmaId),
  ])

  const locMap = new Map<string, any>((locations ?? []).map((row: any) => [row.id, row]))
  const userMap = new Map<string, string>((users ?? []).map((row: any) => [row.id, row.email ?? '']))
  const getPath = (id: string | null | undefined) => {
    if (!id) return ''
    const parts: string[] = []
    let current = locMap.get(id)
    let guard = 0
    while (current && guard < 10) {
      parts.unshift(current.tanim)
      current = current.parent_id ? locMap.get(current.parent_id) : null
      guard += 1
    }
    return parts.join(' > ')
  }

  const rows = (tasks ?? []).map((row: any) => ({
    tanim: row.tanim ?? '',
    lokasyon_yolu: getPath(row.lokasyon_id),
    atanan_email: row.atanan_kullanici_id ? userMap.get(row.atanan_kullanici_id) ?? '' : '',
    aktif_olma_tarihi: row.aktif_olma_tarihi ? new Date(row.aktif_olma_tarihi).toISOString().slice(0, 16).replace('T', ' ') : '',
    durum: row.durum ?? 'HAZIR',
  }))

  return { xml: buildExcelXml('Canli Gorevler Export', columnsByEntity['live-tasks'], rows), fileName: fileNameFor(entity, 'export') }
}

export async function importFromXml(entity: ImportEntity, firmaId: string, actor: Actor, xmlContent: string): Promise<ImportResult> {
  const rows = parseExcelXml(xmlContent)
  if (rows.length < 2) throw new Error('Dosyada veri satırı bulunamadı.')

  const headers = workbookHeadersToKeys(rows[0])
  const dataRows = rows.slice(1).map((row) => {
    const record: Record<string, string> = {}
    headers.forEach((header, index) => {
      record[header] = row[index]?.trim?.() ?? ''
    })
    return record
  })

  if (entity === 'users') return importUsers(firmaId, actor, dataRows)
  if (entity === 'locations') return importLocations(firmaId, dataRows)
  return importLiveTasks(firmaId, actor, dataRows)
}

async function importUsers(firmaId: string, actor: Actor, rows: Record<string, string>[]): Promise<ImportResult> {
  const admin = createAdminClient()
  const importedErrors: string[] = []
  let importedCount = 0

  for (let index = 0; index < rows.length; index += 1) {
    const rowNo = index + 2
    const row = rows[index]
    const isim = row.isim_soyisim?.trim()
    const email = row.email?.trim().toLowerCase()
    const telefon = row.telefon?.trim() || null
    const password = row.password?.trim()

    if (!isim || !email || !password) {
      importedErrors.push(`Satır ${rowNo}: isim_soyisim, email ve password zorunludur.`)
      continue
    }

    if (password.length < 6) {
      importedErrors.push(`Satır ${rowNo}: Şifre en az 6 karakter olmalıdır.`)
      continue
    }

    const { data: exists } = await admin.from('users').select('id').eq('email', email).maybeSingle()
    if (exists) {
      importedErrors.push(`Satır ${rowNo}: ${email} zaten kayıtlı.`)
      continue
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr || !created?.user) {
      importedErrors.push(`Satır ${rowNo}: auth kullanıcı oluşturulamadı (${createErr?.message ?? 'bilinmeyen hata'}).`)
      continue
    }

    const { error: insertErr } = await admin.from('users').insert({
      id: created.user.id,
      isim_soyisim: isim,
      email,
      telefon,
      rol: 'tenant_user',
      firma_id: firmaId,
      kayit_yapan_id: actor.id,
      aktif: true,
    })

    if (insertErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      importedErrors.push(`Satır ${rowNo}: public.users kaydı oluşturulamadı (${insertErr.message}).`)
      continue
    }

    importedCount += 1
  }

  return { importedCount, errors: importedErrors }
}

async function importLocations(firmaId: string, rows: Record<string, string>[]): Promise<ImportResult> {
  const admin = createAdminClient()
  const { data: currentLocations, error: currentErr } = await admin
    .from('lokasyonlar')
    .select('id,tanim,parent_id')
    .eq('firma_id', firmaId)
    .order('kayit_tarihi', { ascending: true })

  if (currentErr) throw new Error(currentErr.message)

  const pathMap = new Map<string, string>()
  const idMap = new Map<string, { id: string; tanim: string; parent_id: string | null }>()
  ;(currentLocations ?? []).forEach((location: any) => idMap.set(location.id, location))

  const getPath = (location: any) => {
    const parts = [location.tanim]
    let parentId = location.parent_id
    let guard = 0
    while (parentId && guard < 10) {
      const parent = idMap.get(parentId)
      if (!parent) break
      parts.unshift(parent.tanim)
      parentId = parent.parent_id
      guard += 1
    }
    return normalizePath(parts.join(' > '))
  }

  ;(currentLocations ?? []).forEach((location: any) => {
    pathMap.set(getPath(location), location.id)
  })

  const errors: string[] = []
  let importedCount = 0

  for (let index = 0; index < rows.length; index += 1) {
    const rowNo = index + 2
    const row = rows[index]
    const tanim = row.tanim?.trim()
    const aciklama = row.aciklama?.trim() || null
    const parentPath = normalizePath(row.parent_yol || '')

    if (!tanim) {
      errors.push(`Satır ${rowNo}: tanim zorunludur.`)
      continue
    }

    const fullPath = normalizePath(parentPath ? `${parentPath} > ${tanim}` : tanim)
    if (pathMap.has(fullPath)) {
      errors.push(`Satır ${rowNo}: ${fullPath} zaten mevcut.`)
      continue
    }

    const parentId = parentPath ? pathMap.get(parentPath) ?? null : null
    if (parentPath && !parentId) {
      errors.push(`Satır ${rowNo}: parent_yol bulunamadı (${parentPath}). Üst lokasyonları önce ekleyin.`)
      continue
    }

    const { data: inserted, error: insertErr } = await admin
      .from('lokasyonlar')
      .insert({
        firma_id: firmaId,
        tanim,
        aciklama,
        parent_id: parentId,
        aktif: true,
        nfc_token: crypto.randomUUID(),
        checklist_sablon_id: null,
      })
      .select('id,tanim,parent_id')
      .single()

    if (insertErr || !inserted) {
      errors.push(`Satır ${rowNo}: Lokasyon oluşturulamadı (${insertErr?.message ?? 'bilinmeyen hata'}).`)
      continue
    }

    idMap.set(inserted.id, inserted)
    pathMap.set(fullPath, inserted.id)
    importedCount += 1
  }

  return { importedCount, errors }
}

async function importLiveTasks(firmaId: string, actor: Actor, rows: Record<string, string>[]): Promise<ImportResult> {
  const admin = createAdminClient()
  const license = await getLicenseStatus(admin as any, firmaId)
  if (license.expired) throw new Error('Lisans süresi dolduğu için canlı görev importu yapılamaz.')
  const [{ data: locations, error: locErr }, { data: users, error: userErr }] = await Promise.all([
    admin.from('lokasyonlar').select('id,tanim,parent_id').eq('firma_id', firmaId),
    admin.from('users').select('id,email').eq('firma_id', firmaId),
  ])

  if (locErr) throw new Error(locErr.message)
  if (userErr) throw new Error(userErr.message)

  const locMap = new Map<string, any>((locations ?? []).map((row: any) => [row.id, row]))
  const pathMap = new Map<string, string>()
  const userByEmail = new Map<string, string>((users ?? []).map((row: any) => [String(row.email ?? '').toLowerCase(), row.id]))

  const getPath = (id: string) => {
    const parts: string[] = []
    let current = locMap.get(id)
    let guard = 0
    while (current && guard < 10) {
      parts.unshift(current.tanim)
      current = current.parent_id ? locMap.get(current.parent_id) : null
      guard += 1
    }
    return normalizePath(parts.join(' > '))
  }
  ;(locations ?? []).forEach((location: any) => pathMap.set(getPath(location.id), location.id))

  const errors: string[] = []
  let importedCount = 0

  for (let index = 0; index < rows.length; index += 1) {
    const rowNo = index + 2
    const row = rows[index]
    const tanim = row.tanim?.trim()
    const locationPath = normalizePath(row.lokasyon_yolu || '')
    const atananEmail = row.atanan_email?.trim().toLowerCase() || ''
    const tarih = row.aktif_olma_tarihi?.trim()
    const durum = (row.durum?.trim() || 'HAZIR').toUpperCase()

    if (!tanim || !locationPath || !tarih) {
      errors.push(`Satır ${rowNo}: tanim, lokasyon_yolu ve aktif_olma_tarihi zorunludur.`)
      continue
    }

    const lokasyonId = pathMap.get(locationPath)
    if (!lokasyonId) {
      errors.push(`Satır ${rowNo}: lokasyon_yolu bulunamadı (${locationPath}).`)
      continue
    }

    const atananId = atananEmail ? userByEmail.get(atananEmail) ?? null : null
    if (atananEmail && !atananId) {
      errors.push(`Satır ${rowNo}: atanan kullanıcı bulunamadı (${atananEmail}).`)
      continue
    }

    const normalizedDate = tarih.includes('T') ? tarih : tarih.replace(' ', 'T')
    const date = new Date(normalizedDate)
    if (Number.isNaN(date.getTime())) {
      errors.push(`Satır ${rowNo}: aktif_olma_tarihi geçersiz (${tarih}).`)
      continue
    }

    if (!['HAZIR', 'ACIK', 'BEKLEMEDE', 'IPTAL', 'TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS'].includes(durum)) {
      errors.push(`Satır ${rowNo}: durum geçersiz (${durum}).`)
      continue
    }

    const { error: insertErr } = await admin.from('canli_gorevler').insert({
      firma_id: firmaId,
      tanim,
      lokasyon_id: lokasyonId,
      atanan_kullanici_id: atananId,
      aktif_olma_tarihi: date.toISOString(),
      durum,
      olusturan_id: actor.id,
      islemi_yapan_id: actor.id,
      durum_degisim_tarihi: new Date().toISOString(),
    })

    if (insertErr) {
      errors.push(`Satır ${rowNo}: canlı görev oluşturulamadı (${insertErr.message}).`)
      continue
    }

    importedCount += 1
  }

  return { importedCount, errors }
}
