import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/arsiv/ceklist
 * Server-side paginated çeklist arşiv
 *
 * Query: firma_id, proje_id, page, limit, q, from, to
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const firmaId = p.get('firma_id')
  const projeId = p.get('proje_id')
  const page = Math.max(1, parseInt(p.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(10, parseInt(p.get('limit') ?? '50')))
  const q = p.get('q')?.trim().toLowerCase() ?? ''
  const fromD = p.get('from') ?? ''
  const toD = p.get('to') ?? ''

  if (!firmaId) return NextResponse.json({ data: [], total: 0 })

  const admin = createAdminClient()

  // Firmanın lokasyonlarını çek (proje filtreli)
  let lokQ = admin.from('lokasyonlar').select('id,tanim,parent_id,checklist_sablon_id').eq('firma_id', firmaId)
  if (projeId) lokQ = lokQ.or(`proje_id.eq.${projeId},proje_id.is.null`)
  const { data: lokasyonlar } = await lokQ

  const lokMap: Record<string, { tanim: string; parent_id: string | null }> = {}
  for (const l of lokasyonlar ?? []) lokMap[l.id] = { tanim: l.tanim, parent_id: l.parent_id }
  const lokIds = Object.keys(lokMap)
  if (!lokIds.length) return NextResponse.json({ data: [], total: 0 })

  function getLocPath(lokasyonId: string | null): string {
    if (!lokasyonId) return '—'
    const parts: string[] = []
    let cur: string | null = lokasyonId
    let guard = 0
    while (cur && guard < 8) {
      const node: { tanim: string; parent_id: string | null } | undefined = lokMap[cur]
      if (!node) break
      parts.push(node.tanim)
      cur = node.parent_id
      guard++
    }
    return parts.reverse().join(' > ') || '—'
  }

  // firma_id ile çek, lokasyon filtresi sonradan uygula (lokIds 400+ olabilir, URL limit aşılır)
  const lokSet = new Set(lokIds)

  // Tüm firma arşiv başlıklarını çek, lokasyon filtresi uygula, sonra sayfala
  // (firma başına max birkaç bin kayıt — tek seferde çekilebilir)
  const sel = 'id,canli_gorev_id,gorev_id,lokasyon_id,sablon_id,kullanici_id,kanal,kayit_tarihi'
  let allRows: any[] = []
  let dbOffset = 0
  const CHUNK = 1000

  while (true) {
    let q = admin.from('checklist_sonuc_basliklari_arsiv')
      .select(sel).eq('firma_id', firmaId)
      .order('kayit_tarihi', { ascending: false })
      .range(dbOffset, dbOffset + CHUNK - 1)
    if (fromD) q = q.gte('kayit_tarihi', fromD + 'T00:00:00')
    if (toD) q = q.lte('kayit_tarihi', toD + 'T23:59:59')
    const { data: chunk, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!chunk?.length) break
    allRows.push(...chunk)
    if (chunk.length < CHUNK) break
    dbOffset += CHUNK
  }

  // Lokasyon filtresi
  const lokFiltered = allRows.filter(b => lokSet.has(b.lokasyon_id))
  const total = lokFiltered.length
  const skip = (page - 1) * limit
  const filtreliBsl = lokFiltered.slice(skip, skip + limit)
  if (!filtreliBsl.length) return NextResponse.json({ data: [], total })

  // Görev bilgilerini çek (batch)
  const BATCH = 80
  const canliGorevIds = [...new Set(filtreliBsl.filter(b => b.canli_gorev_id).map(b => b.canli_gorev_id))]
  const specGorevIds = [...new Set(filtreliBsl.filter(b => !b.canli_gorev_id && b.gorev_id).map(b => b.gorev_id))]
  const gorevMap: Record<string, any> = {}

  // Canli gorevler → arsiv
  for (let i = 0; i < canliGorevIds.length; i += BATCH) {
    const chunk = canliGorevIds.slice(i, i + BATCH)
    const { data } = await admin.from('canli_gorevler').select('id,tanim,durum,tamamlanma_tarihi,lokasyon_id').in('id', chunk)
    for (const g of data ?? []) gorevMap[g.id] = { ...g, dbKaynak: 'canli' }
  }
  const eksikCanli = canliGorevIds.filter(id => !gorevMap[id])
  for (let i = 0; i < eksikCanli.length; i += BATCH) {
    const chunk = eksikCanli.slice(i, i + BATCH)
    const { data } = await admin.from('canli_gorevler_arsiv').select('id,tanim,durum,tamamlanma_tarihi,lokasyon_id').in('id', chunk)
    for (const g of data ?? []) gorevMap[g.id] = { ...g, dbKaynak: 'arsiv' }
  }

  // Spesifik gorevler → arsiv
  for (let i = 0; i < specGorevIds.length; i += BATCH) {
    const chunk = specGorevIds.slice(i, i + BATCH)
    const { data } = await admin.from('gorevler').select('id,tanim,durum,tamamlanma_tarihi,lokasyon_id').in('id', chunk)
    for (const g of data ?? []) gorevMap[g.id] = { ...g, dbKaynak: 'spesifik' }
  }
  const eksikSpec = specGorevIds.filter(id => !gorevMap[id])
  for (let i = 0; i < eksikSpec.length; i += BATCH) {
    const chunk = eksikSpec.slice(i, i + BATCH)
    const { data } = await admin.from('gorevler_arsiv').select('id,tanim,durum,tamamlanma_tarihi,lokasyon_id').in('id', chunk)
    for (const g of data ?? []) gorevMap[g.id] = { ...g, dbKaynak: 'spesifik' }
  }

  // User isimleri
  const userIds = [...new Set(filtreliBsl.map(b => b.kullanici_id).filter(Boolean))]
  const userMap: Record<string, string> = {}
  for (let i = 0; i < userIds.length; i += BATCH) {
    const chunk = userIds.slice(i, i + BATCH)
    const { data } = await admin.from('users').select('id,isim_soyisim').in('id', chunk)
    for (const u of data ?? []) userMap[u.id] = u.isim_soyisim
  }

  // Sablon isimleri
  const sablonIds = [...new Set(filtreliBsl.map(b => b.sablon_id).filter(Boolean))]
  const sablonMap: Record<string, string> = {}
  if (sablonIds.length) {
    const { data } = await admin.from('checklist_sablonlari').select('id,baslik').in('id', sablonIds)
    for (const s of data ?? []) sablonMap[s.id] = s.baslik
  }

  // Madde sayıları
  const bslIds = filtreliBsl.map(b => b.id)
  const doldurulanMap: Record<string, number> = {}
  for (let i = 0; i < bslIds.length; i += BATCH) {
    const chunk = bslIds.slice(i, i + BATCH)
    const { data: m1 } = await admin.from('checklist_sonuc_maddeleri').select('sonuc_id').in('sonuc_id', chunk)
    const { data: m2 } = await admin.from('checklist_sonuc_maddeleri_arsiv').select('sonuc_id').in('sonuc_id', chunk)
    for (const m of [...(m1 ?? []), ...(m2 ?? [])]) doldurulanMap[m.sonuc_id] = (doldurulanMap[m.sonuc_id] ?? 0) + 1
  }

  // Sablon madde sayıları
  const sablonMaddeMap: Record<string, number> = {}
  if (sablonIds.length) {
    const { data } = await admin.from('checklist_sablon_maddeleri').select('sablon_id').in('sablon_id', sablonIds)
    for (const m of data ?? []) sablonMaddeMap[m.sablon_id] = (sablonMaddeMap[m.sablon_id] ?? 0) + 1
  }

  // Sonuç — yetim kayıtları (görev silinmiş) "Görev bulunamadı" olarak göster, filtreleme
  const sonuclar = filtreliBsl.map(b => {
    const gorevId = b.canli_gorev_id || b.gorev_id
    const gorev = gorevId ? gorevMap[gorevId] : null
    const yetim = !!gorevId && !gorev

    const sablonId = b.sablon_id
    const toplam = sablonId ? (sablonMaddeMap[sablonId] ?? 0) : 0
    const doldurulan = doldurulanMap[b.id] ?? 0

    return {
      id: b.id,
      gorev_tanim: gorev?.tanim ?? (yetim ? '⚠️ Görev silinmiş' : '—'),
      gorev_durum: gorev?.durum ?? '—',
      lokasyon_yol: getLocPath(b.lokasyon_id),
      lokasyon_id: b.lokasyon_id,
      sablon_adi: sablonMap[sablonId] ?? '—',
      kullanici: userMap[b.kullanici_id] ?? '—',
      kanal: b.kanal ?? '—',
      kayit_tarihi: b.kayit_tarihi,
      toplam_madde: toplam,
      doldurulan_madde: doldurulan,
      doluluk: toplam > 0 ? Math.round((doldurulan / toplam) * 100) : 0,
      canli_gorev_id: b.canli_gorev_id,
      gorev_id: b.gorev_id,
      dbKaynak: gorev?.dbKaynak ?? 'arsiv',
      yetim,
    }
  })

  // Arama filtresi (server-side)
  const filtered = q
    ? sonuclar.filter(r => [r.gorev_tanim, r.lokasyon_yol, r.kullanici, r.sablon_adi].join(' ').toLowerCase().includes(q))
    : sonuclar

  return NextResponse.json({ data: filtered, total: total ?? 0, page, limit })
}
