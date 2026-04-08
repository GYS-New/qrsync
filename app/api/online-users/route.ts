import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const ONLINE_WINDOW_SECONDS = 120 // 2 dakika

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

  const since = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000).toISOString()
  const admin = createAdminClient()

  // device_tokens'tan son 2dk içinde aktif olan user_id'leri bul
  let dtQ = admin.from('device_tokens').select('user_id, son_kullanim, isim_soyisim, firma_id')
    .eq('aktif', true)
    .gte('son_kullanim', since)
    .order('son_kullanim', { ascending: false })
    .limit(limit * 2) // birden fazla cihaz olabilir

  if (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin') {
    if (me.firma_id) dtQ = (dtQ as any).eq('firma_id', me.firma_id)
  } else {
    if (firmaParam) dtQ = (dtQ as any).eq('firma_id', firmaParam)
  }

  const { data: dtRows, error: dtErr } = await dtQ
  if (dtErr) {
    return NextResponse.json({ ok: true, users: [], since, _error: dtErr.message })
  }

  // Unique user_id'ler
  const seenIds = new Set<string>()
  const uniqueUserIds: string[] = []
  for (const dt of (dtRows ?? [])) {
    if (!seenIds.has(dt.user_id)) {
      seenIds.add(dt.user_id)
      uniqueUserIds.push(dt.user_id)
    }
  }

  if (uniqueUserIds.length === 0) {
    return NextResponse.json({ ok: true, users: [], since })
  }

  // Kullanıcı detaylarını çek
  let uQ = admin.from('users').select('id,isim_soyisim,rol,profil_foto,firma_id,firmalar(firma_adi,ticari_unvan)')
    .in('id', uniqueUserIds.slice(0, limit))
    .eq('aktif', true)

  if (projeId) {
    uQ = (uQ as any).or(`rol.eq.tenant_admin,proje_id.eq.${projeId}`)
  }

  const { data: users, error: uErr } = await uQ
  if (uErr) {
    return NextResponse.json({ ok: true, users: [], since, _error: uErr.message })
  }

  return NextResponse.json({ ok: true, users: users ?? [], since })
}
