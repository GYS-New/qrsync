import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/audit-log?tip=&firmaId=&kullaniciId=&gun=30&basarili=&q=&limit=200
 * SA ve TA görebilir. TA sadece kendi firmasını.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const url = new URL(req.url)
  const tip = url.searchParams.get('tip') ?? ''
  const firmaIdParam = url.searchParams.get('firmaId')
  const kullaniciId = url.searchParams.get('kullaniciId') ?? ''
  const basarili = url.searchParams.get('basarili')
  const q = (url.searchParams.get('q') ?? '').trim()
  const gun = Math.max(1, Math.min(365, Number(url.searchParams.get('gun')) || 30))
  const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 200))

  const firmaId = isSA
    ? (firmaIdParam && firmaIdParam !== 'tumu' ? firmaIdParam : null)
    : me.firma_id

  const kesim = new Date(Date.now() - gun * 86400000).toISOString()
  const admin = createAdminClient()

  let query = admin.from('audit_log')
    .select('*')
    .gte('tarih', kesim)
    .order('tarih', { ascending: false })
    .limit(limit)

  if (firmaId) query = query.eq('firma_id', firmaId)
  if (tip) query = query.eq('tip', tip)
  if (kullaniciId) query = query.eq('kullanici_id', kullaniciId)
  if (basarili === 'true') query = query.eq('basarili', true)
  if (basarili === 'false') query = query.eq('basarili', false)
  if (q) query = query.or(`tip.ilike.%${q}%,tablo.ilike.%${q}%,hata_mesaji.ilike.%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Kullanıcı isimlerini map et
  const userIds = Array.from(new Set((data ?? []).map(r => r.kullanici_id).filter(Boolean)))
  const userMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: users } = await admin.from('users').select('id,isim_soyisim,email').in('id', userIds as string[])
    for (const u of users ?? []) userMap[u.id] = u.isim_soyisim ?? u.email ?? u.id.slice(0, 8)
  }

  return NextResponse.json({
    ok: true,
    data: (data ?? []).map(r => ({
      ...r,
      kullanici_isim: r.kullanici_id ? (userMap[r.kullanici_id] ?? r.kullanici_id.slice(0, 8)) : null,
    })),
  })
}
