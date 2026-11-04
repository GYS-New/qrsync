import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getLokasyonYetki } from '@/lib/yetki/getLokasyonYetki'

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

  // Yetki scope SERVER-SIDE hesaplanir (client lokIds URL param'i gonderemez;
  // ~2000 UUID = ~74KB URL -> Cloudflare 8KB reject -> fetch fail).
  // Musteri/tenant_user icin yetkili ust lokasyon ID listesi.
  const isUM = me.rol === 'musteri' || me.rol === 'tenant_user'
  const yetkiliUstLokIds = isUM ? await getLokasyonYetki(supabase) : null

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

  // CHUNK-AWARE: orderedUserIds + yetkiliUstLokIds cross product icin
  // kombinasyonel chunk'lama (her ikisi de buyuk olabilir). Chunk size 100.
  const userIdChunks = orderedUserIds.length <= 100
    ? [orderedUserIds]
    : Array.from({ length: Math.ceil(orderedUserIds.length / 100) }, (_, i) => orderedUserIds.slice(i * 100, (i + 1) * 100))
  const lokChunks: (string[] | null)[] = !yetkiliUstLokIds || yetkiliUstLokIds.length === 0
    ? [null]
    : yetkiliUstLokIds.length <= 100
      ? [yetkiliUstLokIds]
      : Array.from({ length: Math.ceil(yetkiliUstLokIds.length / 100) }, (_, i) => yetkiliUstLokIds!.slice(i * 100, (i + 1) * 100))

  const collected = new Map<string, any>()
  for (const userSlice of userIdChunks) {
    for (const lokSlice of lokChunks) {
      let uQ = admin.from('users')
        .select('id,isim_soyisim,rol,profil_foto,firma_id,ust_lokasyon_id')
        .in('id', userSlice)
        .eq('aktif', true)
      if (projeId) uQ = (uQ as any).eq('proje_id', projeId)
      if (lokSlice) uQ = (uQ as any).in('ust_lokasyon_id', lokSlice)
      const { data, error } = await uQ
      if (error) {
        return NextResponse.json({ ok: true, users: [], since, _error: error.message })
      }
      for (const u of (data ?? [])) collected.set(u.id, u)
    }
  }

  // Filter sonrası en güncel ilk N — orderedUserIds sırasına göre yeniden sırala
  const sorted: any[] = []
  for (const uid of orderedUserIds) {
    const u = collected.get(uid)
    if (u) sorted.push(u)
    if (sorted.length >= limit) break
  }

  return NextResponse.json({ ok: true, users: sorted, since })
}
