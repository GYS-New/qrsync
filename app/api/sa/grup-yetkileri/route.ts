import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || me.rol !== 'super_admin') return NextResponse.json({ error: 'Sadece SA yapabilir' }, { status: 403 })

  const { yetkileri } = await req.json()
  if (!Array.isArray(yetkileri)) return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 })

  const admin = createAdminClient()
  const rows = yetkileri.map((y: any) => ({
    firma_id: null,
    rol: y.rol,
    sayfa_kodu: y.sayfa_kodu,
    gorebilir: y.gorebilir ?? false,
    ekleyebilir: y.ekleyebilir ?? false,
    duzenleyebilir: y.duzenleyebilir ?? false,
    silebilir: y.silebilir ?? false,
  }))

  const { error } = await admin
    .from('kullanici_grubu_yetkileri')
    .upsert(rows, { onConflict: 'firma_id,rol,sayfa_kodu', ignoreDuplicates: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
