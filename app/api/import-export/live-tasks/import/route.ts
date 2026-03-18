import { NextRequest, NextResponse } from 'next/server'
import { requireImportScope } from '@/lib/import-export/auth'
import { normalizeEmail, normalizeText, toIsoDateTime } from '@/lib/import-export/format'
import { readXlsxFromBuffer } from '@/lib/import-export/xlsx'

// Gün kısaltmalarını JS getDay() değerlerine eşler (0=Pazar, 1=Pazartesi, ...)
const GUN_MAP: Record<string, number> = {
  pzt: 1, sal: 2, car: 3, çar: 3, per: 4, cum: 5, cmt: 6, paz: 0,
  pazartesi: 1, sali: 2, carsamba: 3, persembe: 4, cuma: 5, cumartesi: 6, pazar: 0,
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0,
}

function parseGunler(raw: string): number[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[,;/\s]+/)
    .map(s => s.trim().toLowerCase().replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g'))
    .map(s => GUN_MAP[s])
    .filter((v): v is number => v !== undefined)
}

function isoDateOnly(s: string): string {
  // "YYYY-MM-DD" veya Date.toISOString() -> "YYYY-MM-DD"
  return String(s).slice(0, 10)
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    const firmaIdParam = form.get('firmaId') ? String(form.get('firmaId')) : null
    if (!(file instanceof File)) return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    const scope = await requireImportScope(firmaIdParam)
    const parsed = await readXlsxFromBuffer(Buffer.from(await file.arrayBuffer()))
    if (!parsed.rows.length) return NextResponse.json({ error: 'Excel içinde veri bulunamadı' }, { status: 400 })

    const [{ data: locs, error: locErr }, { data: users, error: userErr }] = await Promise.all([
      scope.admin.from('lokasyonlar').select('id,parent_id,tanim').eq('firma_id', scope.firmaId),
      scope.admin.from('users').select('id,email').eq('firma_id', scope.firmaId),
    ])
    if (locErr) throw new Error(locErr.message)
    if (userErr) throw new Error(userErr.message)

    const locMap = new Map(locs?.map((x: any) => [x.id, x]) ?? [])
    const locPathMap = new Map<string, string>()
    const pathOf = (id: string) => {
      const parts: string[] = []
      let cur: string | null = id
      let guard = 0
      while (cur && guard < 10) {
        const item = locMap.get(cur)
        if (!item) break
        parts.push(item.tanim)
        cur = item.parent_id
        guard++
      }
      return parts.reverse().join(' / ')
    }
    for (const item of locs ?? []) locPathMap.set(pathOf(item.id).toLowerCase(), item.id)
    const userMap = new Map((users ?? []).map((x: any) => [String(x.email).toLowerCase(), x.id]))

    let created = 0
    const errors: string[] = []

    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i]
      const rowNo = i + 2

      const tanim = normalizeText(row.tanim)
      const lokasyonYolu = normalizeText(row.lokasyon_yolu).toLowerCase()
      const atananEmail = normalizeEmail(row.atanan_email)

      if (!tanim || !lokasyonYolu || !normalizeText(row.aktif_olma_tarihi)) {
        errors.push(`Satır ${rowNo}: tanim, lokasyon_yolu ve aktif_olma_tarihi zorunludur.`)
        continue
      }

      const lokasyonId = locPathMap.get(lokasyonYolu)
      if (!lokasyonId) {
        errors.push(`Satır ${rowNo}: lokasyon bulunamadı (${row.lokasyon_yolu}).`)
        continue
      }

      const atananId = atananEmail ? userMap.get(atananEmail) : null
      if (atananEmail && !atananId) {
        errors.push(`Satır ${rowNo}: kullanıcı bulunamadı (${atananEmail}).`)
        continue
      }

      let aktifIso = ''
      try {
        aktifIso = toIsoDateTime(row.aktif_olma_tarihi)
      } catch (e: any) {
        errors.push(`Satır ${rowNo}: ${e.message}`)
        continue
      }

      // Frekans alanlarını oku
      const frekansAdetRaw = row.gunluk_frekans_sayisi
      const gunlerRaw = normalizeText(row.gorev_gunleri ?? '')
      const bitisTarihiRaw = normalizeText(row.bitis_tarihi ?? '')

      const frekansAdet = frekansAdetRaw ? Math.max(1, Math.min(24, parseInt(String(frekansAdetRaw)) || 1)) : 0
      const gunler = parseGunler(gunlerRaw)
      const isFrekans = frekansAdet > 0 && gunler.length > 0 && bitisTarihiRaw

      const basePayload = {
        firma_id: scope.firmaId,
        tanim,
        lokasyon_id: lokasyonId,
        atanan_kullanici_id: atananId ?? null,
        durum: 'HAZIR' as const,
        olusturan_id: scope.me.id,
        islemi_yapan_id: scope.me.id,
      }

      if (!isFrekans) {
        // Tekil görev — direkt canli_gorevler'e ekle
        const { error: insertErr } = await scope.admin.from('canli_gorevler').insert({
          ...basePayload,
          aktif_olma_tarihi: aktifIso,
        })
        if (insertErr) {
          errors.push(`Satır ${rowNo}: ${insertErr.message}`)
          continue
        }
        created++
      } else {
        // Frekans modu — gorev_kurallari tablosuna kural olarak kaydet
        // Cron job gece 00:01'de bu kuraldan her gün otomatik görev üretir
        const aktifSaat = aktifIso.slice(11, 16) // "HH:mm"
        const baslangicGun = isoDateOnly(aktifIso)  // "YYYY-MM-DD"

        let bitisTarih: string | null = null
        if (bitisTarihiRaw) {
          try {
            const bd = new Date(isoDateOnly(bitisTarihiRaw) + 'T00:00:00')
            if (isNaN(bd.getTime())) throw new Error('Geçersiz bitiş tarihi')
            bitisTarih = isoDateOnly(bitisTarihiRaw)
          } catch {
            errors.push(`Satır ${rowNo}: Geçersiz bitis_tarihi (${bitisTarihiRaw}).`)
            continue
          }
        }

        const { error: kuralErr } = await scope.admin.from('gorev_kurallari').insert({
          firma_id: scope.firmaId,
          lokasyon_id: lokasyonId,
          tanim,
          aktif_gunler: gunler,
          gunluk_frekans_sayisi: frekansAdet,
          aktif_olma_saati: aktifSaat + ':00',
          baslangic_tarihi: baslangicGun,
          bitis_tarihi: bitisTarih,
          atanan_kullanici_id: atananId ?? null,
          olusturan_id: scope.me.id,
          kaynak: 'import',
          aktif: true,
        })
        if (kuralErr) {
          errors.push(`Satır ${rowNo}: Kural kaydı başarısız — ${kuralErr.message}`)
          continue
        }
        created++
      }
    }

    return NextResponse.json({ ok: true, created, failed: errors.length, errors })
  } catch (e: any) {
    const status = e.message === 'Unauthorized' ? 401 : e.message.includes('Yetkisiz') ? 403 : 400
    return NextResponse.json({ error: e.message }, { status })
  }
}
