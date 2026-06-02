import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const ONLINE_WINDOW_SECONDS = 600 // 10 dakika

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') ?? '6') || 6))
  const firmaParam = url.searchParams.get('firma')
  const projeId = url.searchParams.get('projeId') || null
  // Üst lokasyon filtresi: virgülle ayrılmış lokasyon UUID listesi (genelde alt lokasyonlar)
  // users.ust_lokasyon_id bu listede olan kullanıcılar gösterilir
  const lokIdsRaw = url.searchParams.get('lokIds') || ''
  const lokIds = lokIdsRaw ? lokIdsRaw.split(',').filter(Boolean) : []

  const since = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000).toISOString()
  const admin = createAdminClient()

  // device_tokens'tan son 10dk içinde aktif olan tüm user_id'leri çek
  // ÖNEMLİ: önce limit uygulayıp sonra filtrelersek bazı user'lar limit'ten önce
  // düşer (örn MONTAJ user'ı 7. sırada → ilk 6'da yok → filter sonrası eksik).
  // Bu yüzden TÜM online user_id'leri çekip → users filter et → en güncel ilk 6.
  let dtQ = admin.from('device_tokens').select('user_id, son_kullanim, firma_id')
    .eq('aktif', true)
    .gte('son_kullanim', since)
    .order('son_kullanim', { ascending: false })

  if (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin') {
    if (me.firma_id) dtQ = (dtQ as any).eq('firma_id', me.firma_id)
  } else {
    if (firmaParam) dtQ = (dtQ as any).eq('firma_id', firmaParam)
  }

  const { data: dtRows, error: dtErr } = await dtQ
  if (dtErr) {
    return NextResponse.json({ ok: true, users: [], since, _error: dtErr.message })
  }

  // Unique user_id'ler (son_kullanim DESC sırasında — en güncel önce)
  const seenIds = new Set<string>()
  const orderedUserIds: string[] = []
  for (const dt of (dtRows ?? [])) {
    if (!seenIds.has(dt.user_id)) {
      seenIds.add(dt.user_id)
      orderedUserIds.push(dt.user_id)
    }
  }

  if (orderedUserIds.length === 0) {
    return NextResponse.json({ ok: true, users: [], since })
  }

  // Tüm online user'ları filter et (proje + üst lokasyon) — sonra slice
  let uQ = admin.from('users')
    .select('id,isim_soyisim,rol,profil_foto,firma_id,ust_lokasyon_id')
    .in('id', orderedUserIds)
    .eq('aktif', true)
  if (projeId) uQ = (uQ as any).eq('proje_id', projeId)
  if (lokIds.length) uQ = (uQ as any).in('ust_lokasyon_id', lokIds)
  const { data: users, error: uErr } = await uQ
  if (uErr) {
    return NextResponse.json({ ok: true, users: [], since, _error: uErr.message })
  }

  // Filter sonrası en güncel ilk N — orderedUserIds sırasına göre yeniden sırala
  const userById = new Map((users ?? []).map((u: any) => [u.id, u]))
  const sorted: any[] = []
  for (const uid of orderedUserIds) {
    const u = userById.get(uid)
    if (u) sorted.push(u)
    if (sorted.length >= limit) break
  }

  return NextResponse.json({ ok: true, users: sorted, since })
}
