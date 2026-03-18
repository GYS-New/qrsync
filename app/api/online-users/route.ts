import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ONLINE_WINDOW_SECONDS = 120

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

  const url = new URL(req.url)
  const limit = Math.max(1, Math.min(20, Number(url.searchParams.get('limit') ?? '6') || 6))
  const firmaParam = url.searchParams.get('firma')
  const projeId = url.searchParams.get('projeId') || null

  const since = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000).toISOString()

  let q = supabase
    .from('users')
    .select('id,isim_soyisim,rol,profil_foto,last_seen_at,firmalar(firma_adi,ticari_unvan)')
    .eq('aktif', true)
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false })
    .limit(limit)

  // Tenant scoped (TA/User): only own firm.
  if (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin') {
    if (me.firma_id) q = q.eq('firma_id', me.firma_id)
  } else {
    // SA: optionally filter by selected firm
    if (firmaParam) q = q.eq('firma_id', firmaParam)
  }

  // Proje filtresi: tenant_user sadece projeye bağlı, tenant_admin her zaman
  if (projeId) {
    q = (q as any).or(`rol.eq.tenant_admin,proje_id.eq.${projeId}`)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, users: data ?? [], since })
}
