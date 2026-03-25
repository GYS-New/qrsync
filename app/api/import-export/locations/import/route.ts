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

    // ── Mevcut lokasyonları yükle ─────────────────────────────────────────
    const { data: existingRows, error: existingErr } = await scope.admin
      .from('lokasyonlar')
      .select('id,parent_id,tanim')
      .eq('firma_id', scope.firmaId)
      .order('kayit_tarihi', { ascending: true })
    if (existingErr) throw new Error(existingErr.message)

    // id → {tanim, parent_id}
    const byId = new Map<string, any>()
    for (const item of existingRows ?? []) byId.set(item.id, item)

    // path-key → lokasyon (örn. "merkez > kat 1 > depo")
    const pathKeyFor = (parts: string[]) => parts.map(x => x.trim().toLowerCase()).join(' > ')
    const pathOfExisting = (id: string | null | undefined): string[] => {
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

    const keyMap = new Map<string, any>()
    for (const item of existingRows ?? []) {
      keyMap.set(pathKeyFor(pathOfExisting(item.id)), item)
    }

    // ── Mevcut grupları yükle ─────────────────────────────────────────────
    // Grup key: "{normalize(ad)}|{ust_lokasyon_id ?? 'null'}" — aynı isim farklı üst lokasyon = farklı grup
    const { data: existingGroups } = await scope.admin
      .from('lokasyon_gruplari')
      .select('id,ad,ust_lokasyon_id,proje_id')
      .eq('firma_id', scope.firmaId)
    
    // grupKey → grup.id
    const grupKeyMap = new Map<string, string>()
    for (const g of existingGroups ?? []) {
      const key = `${normalizeText(g.ad)}|${g.ust_lokasyon_id ?? 'null'}|${g.proje_id ?? 'null'}`
      grupKeyMap.set(key, g.id)
    }

    // lokasyon_id'nin zaten bir gruba üye olup olmadığını track et
    const { data: existingMembers } = await scope.admin
      .from('lokasyon_grup_uyeleri')
      .select('grup_id,lokasyon_id')
    const memberSet = new Set<string>() // "grup_id|lokasyon_id"
    for (const m of existingMembers ?? []) {
      memberSet.set(`${m.grup_id}|${m.lokasyon_id}`)
    }

    // ── Satır işleme ──────────────────────────────────────────────────────
    let created = 0
    let grupCreated = 0
    let grupUyeAdded = 0
    const errors: string[] = []

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i]
      const rowNo = i + 2
      const levels = [
        normalizeText(row.seviye_1),
        normalizeText(row.seviye_2),
        normalizeText(row.seviye_3),
      ].filter(Boolean)

      if (!levels.length) {
        errors.push(`Satır ${rowNo}: en az seviye_1 dolu olmalı.`)
        continue
      }

      const grupAdi = normalizeText(row.grup) || null

      let parentId: string | null = null
      const builtParts: string[] = []
      let leafId: string | null = null

      // Seviyeleri oluştur/bul
      for (let idx = 0; idx < levels.length; idx++) {
        const part = levels[idx]
        builtParts.push(part)
        const key = pathKeyFor(builtParts)
        const existing = keyMap.get(key)
        if (existing) {
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
        const { data: inserted, error: insertErr } = await scope.admin
          .from('lokasyonlar').insert(payload).select('id,parent_id,tanim').single()
        if (insertErr || !inserted) {
          errors.push(`Satır ${rowNo}: ${insertErr?.message ?? 'Lokasyon eklenemedi'}`)
          parentId = null
          break
        }
        keyMap.set(key, inserted)
        byId.set(inserted.id, inserted)
        if (idx === levels.length - 1) leafId = inserted.id
        parentId = inserted.id
        created++
      }

      // ── Grup atama ────────────────────────────────────────────────────
      if (grupAdi && leafId) {
        // Grup key: grupAdi + üst lokasyon (yaprak lokasyonun parent'ı = ust_lokasyon_id)
        // Bu şekilde aynı grup adı farklı üst lokasyonda ayrı grup olur
        const leafParentId = byId.get(leafId)?.parent_id ?? null
        const grupKey = `${normalizeText(grupAdi)}|${leafParentId ?? 'null'}|${projeIdParam ?? 'null'}`

        let grupId = grupKeyMap.get(grupKey)

        // Grup yoksa oluştur
        if (!grupId) {
          const { data: newGrup, error: grupErr } = await scope.admin
            .from('lokasyon_gruplari')
            .insert({
              firma_id: scope.firmaId,
              ad: grupAdi,
              ust_lokasyon_id: leafParentId,
              proje_id: projeIdParam ?? null,
              aktif: true,
            })
            .select('id')
            .single()

          if (grupErr || !newGrup) {
            errors.push(`Satır ${rowNo}: Grup oluşturulamadı — ${grupErr?.message ?? 'bilinmeyen hata'}`)
          } else {
            grupId = newGrup.id
            grupKeyMap.set(grupKey, grupId)
            grupCreated++
          }
        }

        // Lokasyonu gruba ekle (üyelik yoksa)
        if (grupId) {
          const memberKey = `${grupId}|${leafId}`
          if (!memberSet.has(memberKey)) {
            const { error: uyeErr } = await scope.admin
              .from('lokasyon_grup_uyeleri')
              .insert({ grup_id: grupId, lokasyon_id: leafId })
            if (!uyeErr) {
              memberSet.add(memberKey)
              grupUyeAdded++
            } else {
              errors.push(`Satır ${rowNo}: Grup üyeliği eklenemedi — ${uyeErr.message}`)
            }
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      grupCreated,
      grupUyeAdded,
      failed: errors.length,
      errors,
    })
  } catch (e: any) {
    const status = e.message === 'Unauthorized' ? 401 : e.message.includes('Yetkisiz') ? 403 : 400
    return NextResponse.json({ error: e.message }, { status })
  }
}
