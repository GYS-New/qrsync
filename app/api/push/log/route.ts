import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/push/log?firmaId=&projeId=&basarili=&gun=&q=
 *   firmaId: SA zorunlu; TA/U kendi firmasına zorlanır
 *   projeId: opsiyonel filtre
 *   basarili: 'true'|'false'|undefined (tümü)
 *   gun: son X gün (varsayılan 30)
 *   q: gonderen/alici/baslik/icerik'te arama
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const url = new URL(req.url)
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  // SA: firmaId opsiyonel ('tumu' veya boş → tüm firmalar). TA/U: kendi firmasına zorlanır.
  const firmaIdParam = url.searchParams.get('firmaId')
  const firmaId = isSA
    ? (firmaIdParam && firmaIdParam !== 'tumu' ? firmaIdParam : null)
    : me.firma_id
  if (!isSA && !firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  const projeId = url.searchParams.get('projeId')
  const basarili = url.searchParams.get('basarili')
  const gunRaw = url.searchParams.get('gun')
  const gun = gunRaw ? Math.max(1, Math.min(365, Number(gunRaw) || 30)) : 30
  const q = (url.searchParams.get('q') ?? '').trim()
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 200))

  const kesim = new Date(Date.now() - gun * 86400000).toISOString()

  const admin = createAdminClient()
  let query = admin.from('push_bildirim_log')
    .select('*')
    .gte('olusturma_tarihi', kesim)
    .order('olusturma_tarihi', { ascending: false })
    .limit(limit)

  if (firmaId) query = query.eq('firma_id', firmaId)
  if (projeId) query = query.eq('proje_id', projeId)
  if (basarili === 'true') query = query.eq('basarili', true)
  if (basarili === 'false') query = query.eq('basarili', false)
  if (q) query = query.or(`gonderen_isim.ilike.%${q}%,alici_isim.ilike.%${q}%,baslik.ilike.%${q}%,icerik.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? [] })
}

/**
 * DELETE /api/push/log
 * body: { ids: string[] }  (toplu silme) — veya ?id=... (tekli)
 * Sadece SA ve TA silebilir. TA sadece kendi firmasının kayıtlarını.
 */
export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const url = new URL(req.url)
  const tekliId = url.searchParams.get('id')
  let ids: string[] = []
  if (tekliId) {
    ids = [tekliId]
  } else {
    const body = await req.json().catch(() => ({} as any))
    ids = Array.isArray(body.ids) ? body.ids.filter((x: any) => typeof x === 'string') : []
  }
  if (!ids.length) return NextResponse.json({ error: 'Silinecek kayıt yok' }, { status: 400 })

  const admin = createAdminClient()
  let delQ = admin.from('push_bildirim_log').delete().in('id', ids)
  if (me.rol === 'tenant_admin') delQ = delQ.eq('firma_id', me.firma_id)

  const { error, count } = await delQ.select('id', { count: 'exact', head: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, silinen: count ?? ids.length })
}
