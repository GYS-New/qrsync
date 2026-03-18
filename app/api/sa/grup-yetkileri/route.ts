import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || me.rol !== 'super_admin') return NextResponse.json({ error: 'Sadece SA yapabilir' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('kullanici_grubu_yetkileri')
    .select('*')
    .is('firma_id', null)
    .order('rol')
    .order('sayfa_kodu')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, yetkileri: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || me.rol !== 'super_admin') return NextResponse.json({ error: 'Sadece SA yapabilir' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.yetkileri)) {
    return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 })
  }

  const GECERLI_ROLLER = ['alt_super_admin', 'tenant_admin', 'musteri', 'tenant_user']
  const rows = (body.yetkileri as any[])
    .filter(y => GECERLI_ROLLER.includes(y.rol) && typeof y.sayfa_kodu === 'string' && y.sayfa_kodu.length > 0)
    .map(y => ({
      firma_id: null as null,
      rol: String(y.rol),
      sayfa_kodu: String(y.sayfa_kodu),
      gorebilir: y.gorebilir === true,
      ekleyebilir: y.ekleyebilir === true,
      duzenleyebilir: y.duzenleyebilir === true,
      silebilir: y.silebilir === true,
    }))

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Kaydedilecek satır yok' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error: delErr } = await admin
    .from('kullanici_grubu_yetkileri')
    .delete()
    .is('firma_id', null)
    .in('rol', GECERLI_ROLLER)

  if (delErr) return NextResponse.json({ error: `Silme hatası: ${delErr.message}` }, { status: 500 })

  const { error: insErr } = await admin
    .from('kullanici_grubu_yetkileri')
    .insert(rows)

  if (insErr) return NextResponse.json({ error: `Ekleme hatası: ${insErr.message}` }, { status: 500 })

  // POST response'unda kaydedilen veriyi döndür — ayrıca GET yapmaya gerek yok
  const { data: guncellenmis } = await admin
    .from('kullanici_grubu_yetkileri')
    .select('*')
    .is('firma_id', null)
    .order('rol')
    .order('sayfa_kodu')

  return NextResponse.json({ ok: true, count: rows.length, yetkileri: guncellenmis ?? [] })
}
