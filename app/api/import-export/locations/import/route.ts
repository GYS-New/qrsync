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
      const builtParts: string[] = []
      for (let idx = 0; idx < levels.length; idx++) {
        const part = levels[idx]
        builtParts.push(part)
        const key = pathKeyFor(builtParts)
        const existing = keyMap.get(key)
        if (existing) {
          parentId = existing.id
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
          break
        }
        keyMap.set(key, inserted)
        byId.set(inserted.id, inserted)
        parentId = inserted.id
        created++
      }
    }
    return NextResponse.json({ ok: true, created, failed: errors.length, errors })
  } catch (e: any) {
    const status = e.message === 'Unauthorized' ? 401 : e.message.includes('Yetkisiz') ? 403 : 400
    return NextResponse.json({ error: e.message }, { status })
  }
}
