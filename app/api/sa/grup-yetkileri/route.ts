import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const GECERLI_ROLLER = ['alt_super_admin', 'tenant_admin', 'musteri', 'tenant_user']

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  const isSA = me?.rol === 'super_admin' || me?.rol === 'alt_super_admin'
  if (!isSA) return NextResponse.json({ error: 'Sadece SA yapabilir' }, { status: 403 })

  const firmaId = req.nextUrl.searchParams.get('firma_id') || null
  const admin = createAdminClient()
  let q = admin.from('kullanici_grubu_yetkileri').select('*').order('rol').order('sayfa_kodu')
  q = firmaId ? q.eq('firma_id', firmaId) : q.is('firma_id', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, yetkileri: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  const isSA = me?.rol === 'super_admin' || me?.rol === 'alt_super_admin'
  if (!isSA) return NextResponse.json({ error: 'Sadece SA yapabilir' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.yetkileri)) {
    return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 })
  }

  const firmaId: string | null = body.firma_id ?? null

  const rows = (body.yetkileri as any[])
    .filter(y => GECERLI_ROLLER.includes(y.rol) && typeof y.sayfa_kodu === 'string' && y.sayfa_kodu.length > 0)
    .map(y => ({
      firma_id: firmaId,
      rol: String(y.rol),
      sayfa_kodu: String(y.sayfa_kodu),
      gorebilir: y.gorebilir === true,
      ekleyebilir: y.ekleyebilir === true,
      duzenleyebilir: y.duzenleyebilir === true,
      silebilir: y.silebilir === true,
    }))

  if (rows.length === 0) return NextResponse.json({ error: 'Kaydedilecek satır yok' }, { status: 400 })

  const admin = createAdminClient()
  let delQ = admin.from('kullanici_grubu_yetkileri').delete().in('rol', GECERLI_ROLLER)
  delQ = firmaId ? delQ.eq('firma_id', firmaId) : delQ.is('firma_id', null)

  const { error: delErr } = await delQ
  if (delErr) return NextResponse.json({ error: `Silme: ${delErr.message}` }, { status: 500 })

  const { error: insErr } = await admin.from('kullanici_grubu_yetkileri').insert(rows)
  if (insErr) return NextResponse.json({ error: `Ekleme: ${insErr.message}` }, { status: 500 })

  let q2 = admin.from('kullanici_grubu_yetkileri').select('*').order('rol').order('sayfa_kodu')
  q2 = firmaId ? q2.eq('firma_id', firmaId) : q2.is('firma_id', null)

  const { data: guncellenmis } = await q2
  return NextResponse.json({ ok: true, count: rows.length, yetkileri: guncellenmis ?? [] })
}
