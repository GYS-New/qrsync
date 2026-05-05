import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/simulasyon/kurallar?firma_id=...&ust_lokasyon_id=...&proje_id=...
 *
 * Üst lokasyonun alt-altlarındaki tüm aktif görev kurallarını döndürür.
 * Her kural için: id, tanim, lokasyon (yol), aktif_olma_saati, vardiya_no.
 *
 * Vardiya numarası kuralın aktif_olma_saati'nin firmanın tum_vardiya_ayarlari
 * JSONB'sindeki hangi vardiya aralığına düştüğüne bakılarak hesaplanır.
 *
 * Simülasyon UI'sında her kurala personel atama formu için kullanılır.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const p = req.nextUrl.searchParams
  const firmaId = ['super_admin', 'alt_super_admin'].includes(me.rol) ? p.get('firma_id') : me.firma_id
  const ustLokasyonId = p.get('ust_lokasyon_id')
  const projeId = p.get('proje_id') || null

  if (!firmaId || !ustLokasyonId) {
    return NextResponse.json({ ok: false, error: 'firma_id ve ust_lokasyon_id zorunlu' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Firma vardiya ayarı
  const { data: firma } = await admin
    .from('firmalar')
    .select('vardiya_sayisi, tum_vardiya_ayarlari')
    .eq('id', firmaId)
    .single()
  const vardiyaSayisi: number = (firma as any)?.vardiya_sayisi ?? 3
  const aktifSet: { no: number; baslangic: string; bitis: string }[] =
    ((firma as any)?.tum_vardiya_ayarlari?.[String(vardiyaSayisi)] ?? []) as any

  // Üst lokasyonun tüm alt-altlarını bul (BFS)
  const { data: tumLokasyonlar } = await admin
    .from('lokasyonlar')
    .select('id, parent_id, tanim')
    .eq('firma_id', firmaId)

  const childrenMap = new Map<string, string[]>()
  const lokAdMap = new Map<string, string>()
  const lokParentMap = new Map<string, string | null>()
  for (const l of (tumLokasyonlar ?? [])) {
    lokAdMap.set((l as any).id, (l as any).tanim)
    lokParentMap.set((l as any).id, (l as any).parent_id ?? null)
    if (!l.parent_id) continue
    const arr = childrenMap.get((l as any).parent_id) ?? []
    arr.push((l as any).id)
    childrenMap.set((l as any).parent_id, arr)
  }
  const altLokIds = new Set<string>([ustLokasyonId])
  const queue = [ustLokasyonId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const child of childrenMap.get(cur) ?? []) {
      if (altLokIds.has(child)) continue
      altLokIds.add(child)
      queue.push(child)
    }
  }

  // Lokasyon yolu (üst > alt > alt-alt) hesapla
  function lokasyonYolu(lokId: string): string {
    const parts: string[] = []
    let cur: string | null = lokId
    let guard = 0
    while (cur && guard < 8) {
      const ad = lokAdMap.get(cur)
      if (ad) parts.push(ad)
      cur = lokParentMap.get(cur) ?? null
      guard++
    }
    return parts.reverse().join(' > ')
  }

  // Bu üst lokasyonun alt-altlarındaki aktif kuralları çek
  let kQ = admin
    .from('gorev_kurallari')
    .select('id, tanim, lokasyon_id, aktif_olma_saati, frekans_tipi, gunluk_frekans_sayisi')
    .eq('aktif', true)
    .eq('firma_id', firmaId)
    .in('lokasyon_id', [...altLokIds])
  if (projeId) kQ = (kQ as any).eq('proje_id', projeId)
  const { data: kurallar } = await kQ

  // Saat → vardiya_no çözümleyici
  function vardiyaBul(saatStr: string): number | null {
    for (const v of aktifSet) {
      const gece = v.bitis <= v.baslangic
      const eslesir = gece
        ? (saatStr >= v.baslangic || saatStr < v.bitis)
        : (saatStr >= v.baslangic && saatStr < v.bitis)
      if (eslesir) return v.no
    }
    return null
  }

  const enriched = (kurallar ?? []).map((k: any) => {
    const saat = String(k.aktif_olma_saati ?? '').slice(0, 5)
    const vardiyaNo = vardiyaBul(saat)
    return {
      id: k.id,
      tanim: k.tanim,
      lokasyon_id: k.lokasyon_id,
      lokasyon_yolu: lokasyonYolu(k.lokasyon_id),
      aktif_olma_saati: saat,
      vardiya_no: vardiyaNo,
      frekans_tipi: k.frekans_tipi,
      gunluk_frekans_sayisi: k.gunluk_frekans_sayisi,
    }
  })

  // Vardiya → kural sayısı sıralı liste (öncelik: vardiya, sonra saat, sonra tanım)
  enriched.sort((a, b) => {
    if ((a.vardiya_no ?? 99) !== (b.vardiya_no ?? 99)) return (a.vardiya_no ?? 99) - (b.vardiya_no ?? 99)
    if (a.aktif_olma_saati !== b.aktif_olma_saati) return a.aktif_olma_saati.localeCompare(b.aktif_olma_saati)
    return a.tanim.localeCompare(b.tanim, 'tr')
  })

  return NextResponse.json({ ok: true, data: enriched })
}
