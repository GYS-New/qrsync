import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { requireImportScope } from '@/lib/import-export/auth'
import { normalizeText, parseBool } from '@/lib/import-export/format'
import { readXlsxFromBuffer } from '@/lib/import-export/xlsx'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    const firmaIdParam = form.get('firmaId') ? String(form.get('firmaId')) : null
    const projeIdParam  = form.get('proje_id') ? String(form.get('proje_id')) : null
    if (!(file instanceof File)) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    const scope = await requireImportScope(firmaIdParam)
    const parsed = await readXlsxFromBuffer(Buffer.from(await file.arrayBuffer()))
    if (!parsed.rows.length) return NextResponse.json({ error: 'Excel içinde veri bulunamadı' }, { status: 400 })

    const { data: existingRows, error: existingErr } = await scope.admin.from('lokasyonlar').select('id,parent_id,tanim').eq('firma_id', scope.firmaId).order('kayit_tarihi', { ascending: true })
    if (existingErr) throw new Error(existingErr.message)

    const keyMap = new Map<string, any>()
    const byId = new Map<string, any>()
    for (const item of existingRows ?? []) {
      byId.set(item.id, item)
    }
    const pathKeyFor = (parts: string[]) => parts.map((x) => x.trim().toLowerCase()).join(' > ')
    const pathOfExisting = (id: string | null | undefined) => {
      const parts: string[] = []
      let cur = id || null
      let guard = 0
      while (cur && guard < 10) {
        const item = byId.get(cur)
        if (!item) break
        parts.push(item.tanim)
        cur = item.parent_id
        guard++
      }
      return parts.reverse()
    }
    for (const item of existingRows ?? []) {
      keyMap.set(pathKeyFor(pathOfExisting(item.id)), item)
    }

    let created = 0
    const errors: string[] = []

    // grup adı → { grupAd, lokasyonIds[], ustLokasyonId } toplayıcı
    // Her satırın en son (leaf) lokasyonunu ilgili gruba ekleyeceğiz
    const grupCollector = new Map<string, { lokasyonIds: string[]; ustLokasyonId: string | null }>()

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i]
      const rowNo = i + 2
      const levels = [normalizeText(row.seviye_1), normalizeText(row.seviye_2), normalizeText(row.seviye_3)].filter(Boolean)
      if (!levels.length) {
        errors.push(`Satır ${rowNo}: en az seviye_1 dolu olmalı.`)
        continue
      }
      if (levels.length > 3) {
        errors.push(`Satır ${rowNo}: en fazla 3 seviye desteklenir.`)
        continue
      }
      let parentId: string | null = null
      let rootId: string | null = null
      const builtParts: string[] = []
      let leafId: string | null = null
      let rowFailed = false

      for (let idx = 0; idx < levels.length; idx++) {
        const part = levels[idx]
        builtParts.push(part)
        const key = pathKeyFor(builtParts)
        const existing = keyMap.get(key)
        if (existing) {
          if (idx === 0) rootId = existing.id
          parentId = existing.id
          if (idx === levels.length - 1) leafId = existing.id
          continue
        }
        const payload: any = {
          firma_id: scope.firmaId,
          parent_id: parentId,
          tanim: part,
          aktif: idx === levels.length - 1 ? parseBool(row.aktif, true) : true,
          aciklama: idx === levels.length - 1 ? (normalizeText(row.aciklama) || null) : null,
          proje_id: projeIdParam ?? null,
          nfc_token: randomUUID(),
          checklist_sablon_id: null,
          sureli_gorev_aktif: idx === levels.length - 1 ? parseBool(row.sureli_gorev_aktif, false) : false,
        }
        const { data: inserted, error: insertErr } = await scope.admin.from('lokasyonlar').insert(payload).select('id,parent_id,tanim').single()
        if (insertErr || !inserted) {
          errors.push(`Satır ${rowNo}: ${insertErr?.message ?? 'Lokasyon eklenemedi'}`)
          parentId = null
          rowFailed = true
          break
        }
        keyMap.set(key, inserted)
        byId.set(inserted.id, inserted)
        if (idx === 0) rootId = inserted.id
        parentId = inserted.id
        if (idx === levels.length - 1) leafId = inserted.id
        created++
      }

      // Grup işleme — sadece leaf lokasyon için, yalnızca satır başarılıysa
      if (!rowFailed && leafId) {
        const grupAdi = normalizeText(row.grup)
        if (grupAdi) {
          if (!grupCollector.has(grupAdi)) {
            grupCollector.set(grupAdi, { lokasyonIds: [], ustLokasyonId: rootId })
          }
          const entry = grupCollector.get(grupAdi)!
          if (!entry.lokasyonIds.includes(leafId)) {
            entry.lokasyonIds.push(leafId)
          }
          // ustLokasyonId tutarlılığı: ilk satırdan alınan rootId kullanılır
          if (!entry.ustLokasyonId && rootId) {
            entry.ustLokasyonId = rootId
          }
        }
      }
    }

    // Grupları oluştur / güncelle
    let groupsCreated = 0
    let groupsUpdated = 0
    const groupErrors: string[] = []

    if (grupCollector.size > 0) {
      // Mevcut grupları çek
      const { data: existingGroups, error: egErr } = await scope.admin
        .from('lokasyon_gruplari')
        .select('id,ad,ust_lokasyon_id')
        .eq('firma_id', scope.firmaId)
      if (egErr) {
        groupErrors.push(`Gruplar alınamadı: ${egErr.message}`)
      } else {
        const existingGroupMap = new Map<string, any>()
        for (const g of existingGroups ?? []) {
          existingGroupMap.set(g.ad.trim().toLowerCase(), g)
        }

        for (const [grupAdi, entry] of grupCollector.entries()) {
          try {
            const existingGroup = existingGroupMap.get(grupAdi.trim().toLowerCase())
            let grupId: string

            if (existingGroup) {
              // Grup zaten var — üyeleri ekle (mevcut üyeleri koru)
              grupId = existingGroup.id
              groupsUpdated++
            } else {
              // Yeni grup oluştur
              if (!entry.ustLokasyonId) {
                groupErrors.push(`Grup "${grupAdi}": üst lokasyon belirlenemedi, grup oluşturulamadı.`)
                continue
              }
              const { data: newGroup, error: ngErr } = await scope.admin
                .from('lokasyon_gruplari')
                .insert({
                  firma_id: scope.firmaId,
                  ad: grupAdi,
                  ust_lokasyon_id: entry.ustLokasyonId,
                  aktif: true,
                  guncelleme_tarihi: new Date().toISOString(),
                  ...(projeIdParam ? { proje_id: projeIdParam } : {}),
                })
                .select('id')
                .single()
              if (ngErr || !newGroup) {
                groupErrors.push(`Grup "${grupAdi}" oluşturulamadı: ${ngErr?.message ?? 'bilinmeyen hata'}`)
                continue
              }
              grupId = newGroup.id
              groupsCreated++
            }

            // Grup üyelerini ekle (zaten var olanları atla)
            const { data: existingMembers } = await scope.admin
              .from('lokasyon_grup_uyeleri')
              .select('lokasyon_id')
              .eq('grup_id', grupId)
            const existingMemberSet = new Set((existingMembers ?? []).map((m: any) => m.lokasyon_id))
            const newMembers = entry.lokasyonIds
              .filter((id) => !existingMemberSet.has(id))
              .map((lokasyon_id) => ({ grup_id: grupId, lokasyon_id }))
            if (newMembers.length > 0) {
              const { error: memberErr } = await scope.admin.from('lokasyon_grup_uyeleri').insert(newMembers)
              if (memberErr) {
                groupErrors.push(`Grup "${grupAdi}" üyeleri eklenemedi: ${memberErr.message}`)
              }
            }
          } catch (e: any) {
            groupErrors.push(`Grup "${grupAdi}": ${e.message}`)
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      failed: errors.length,
      errors,
      groups_created: groupsCreated,
      groups_updated: groupsUpdated,
      group_errors: groupErrors,
    })
  } catch (e: any) {
    const status = e.message === 'Unauthorized' ? 401 : e.message.includes('Yetkisiz') ? 403 : 400
    return NextResponse.json({ error: e.message }, { status })
  }
}
