import { NextRequest, NextResponse } from 'next/server'
import { requireImportScope } from '@/lib/import-export/auth'
import { normalizeEmail, normalizeText } from '@/lib/import-export/format'
import { readXlsxFromBuffer } from '@/lib/import-export/xlsx'

const GUN_MAP: Record<string, number> = {
  pzt: 1, sal: 2, car: 3, çar: 3, per: 4, cum: 5, cmt: 6, paz: 0,
  pazartesi: 1, sali: 2, carsamba: 3, persembe: 4, cuma: 5, cumartesi: 6, pazar: 0,
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0,
}

function parseGunler(raw: string): number[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[,;/\s]+/)
    .map(s => s.trim().toLowerCase()
      .replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o')
      .replace(/ü/g, 'u').replace(/ğ/g, 'g'))
    .map(s => GUN_MAP[s])
    .filter((v): v is number => v !== undefined)
}

export async function POST(req: NextRequest) {
  try {
    const form     = await req.formData()
    const file     = form.get('file')
    const firmaIdP = form.get('firmaId') ? String(form.get('firmaId')) : null
    if (!(file instanceof File)) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })

    const scope  = await requireImportScope(firmaIdP)
    const parsed = await readXlsxFromBuffer(Buffer.from(await file.arrayBuffer()))
    if (!parsed.rows.length) return NextResponse.json({ error: 'Excel içinde veri bulunamadı' }, { status: 400 })

    const [{ data: locs, error: le }, { data: users, error: ue }] = await Promise.all([
      scope.admin.from('lokasyonlar').select('id,parent_id,tanim,gunluk_frekans_sayisi').eq('firma_id', scope.firmaId),
      scope.admin.from('users').select('id,email').eq('firma_id', scope.firmaId),
    ])
    if (le) throw new Error(le.message)
    if (ue) throw new Error(ue.message)

    // Lokasyon yol haritası
    const locById  = new Map((locs ?? []).map((x: any) => [x.id, x]))
    const pathOf   = (id: string): string => {
      const parts: string[] = []; let cur: string | null = id; let g = 0
      while (cur && g++ < 10) { const l = locById.get(cur); if (!l) break; parts.push(l.tanim); cur = l.parent_id }
      return parts.reverse().join(' / ')
    }
    const locPathMap = new Map<string, string>()
    const locFrekansMap = new Map<string, number>()
    for (const l of locs ?? []) {
      locPathMap.set(pathOf(l.id).toLowerCase(), l.id)
      locFrekansMap.set(l.id, (l as any).gunluk_frekans_sayisi ?? 1)
    }
    const userMap = new Map((users ?? []).map((x: any) => [String(x.email).toLowerCase(), x.id]))

    let created = 0
    let updated = 0
    const errors: string[] = []

    for (let i = 0; i < parsed.rows.length; i++) {
      const row   = parsed.rows[i]
      const rowNo = i + 2

      const tanim       = normalizeText(row.tanim)
      const lokYolu     = normalizeText(row.lokasyon_yolu ?? '').toLowerCase()
      const atananEmail = normalizeEmail(row.atanan_email ?? '')
      const gunlerRaw   = normalizeText(row.gorev_gunleri ?? '')
      const saat        = normalizeText(row.aktif_olma_saati ?? '08:00')
      const baslangic   = normalizeText(row.baslangic_tarihi ?? new Date().toISOString().slice(0, 10))
      const bitis       = normalizeText(row.bitis_tarihi ?? '')
      const frekansRaw  = normalizeText(row.gunluk_frekans_sayisi ?? '')
      const frekansExcel = frekansRaw ? Number(frekansRaw) : NaN
      if (!tanim || !lokYolu) {
        errors.push(`Satır ${rowNo}: tanim ve lokasyon_yolu zorunludur.`)
        continue
      }

      const lokId = locPathMap.get(lokYolu)
      if (!lokId) {
        errors.push(`Satır ${rowNo}: lokasyon bulunamadı (${row.lokasyon_yolu}).`)
        continue
      }

      const gunler = parseGunler(gunlerRaw)
      if (gunler.length === 0) {
        errors.push(`Satır ${rowNo}: geçerli gün bulunamadı (${gunlerRaw}). Örnek: Pzt,Sal,Car,Per,Cum`)
        continue
      }

      const atananId = atananEmail ? userMap.get(atananEmail) ?? null : null
      if (atananEmail && !atananId) {
        errors.push(`Satır ${rowNo}: kullanıcı bulunamadı (${atananEmail}).`)
        continue
      }

      const saatNorm = saat.length === 5 ? saat + ':00' : saat

      // Upsert: aynı firma + lokasyon + tanım + aktif_olma_saati varsa üzerine yaz
      const { data: mevcut } = await scope.admin.from('gorev_kurallari')
        .select('id')
        .eq('firma_id', scope.firmaId)
        .eq('lokasyon_id', lokId)
        .eq('tanim', tanim)
        .eq('aktif_olma_saati', saatNorm)
        .maybeSingle()

      // Frekans sayısı: Excel'de geçerli bir sayı varsa onu kullan, yoksa lokasyondan
      const gunlukFrekans = Number.isFinite(frekansExcel) && frekansExcel > 0
        ? Math.floor(frekansExcel)
        : (locFrekansMap.get(lokId) ?? 1)

      const payload = {
        firma_id: scope.firmaId,
        lokasyon_id: lokId,
        tanim,
        aktif_gunler: gunler,
        gunluk_frekans_sayisi: gunlukFrekans,
        aktif_olma_saati: saatNorm,
        baslangic_tarihi: baslangic,
        bitis_tarihi: bitis || null,
        atanan_kullanici_id: atananId,
        kaynak: 'import',
        aktif: true,
      }

      if (mevcut?.id) {
        const { error: updateErr } = await scope.admin.from('gorev_kurallari')
          .update({ ...payload, guncelleme_tarihi: new Date().toISOString() })
          .eq('id', mevcut.id)
        if (updateErr) {
          errors.push(`Satır ${rowNo}: ${updateErr.message}`)
          continue
        }
        updated++
      } else {
        const { error: insertErr } = await scope.admin.from('gorev_kurallari')
          .insert({ ...payload, olusturan_id: scope.me.id })
        if (insertErr) {
          errors.push(`Satır ${rowNo}: ${insertErr.message}`)
          continue
        }
        created++
      }
    }

    return NextResponse.json({ ok: true, created, updated, failed: errors.length, errors })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
