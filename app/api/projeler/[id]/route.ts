import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['tenant_admin', 'super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const body = await req.json()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('projeler')
    .update({
      ...(body.ad !== undefined && { ad: body.ad.trim() }),
      ...(body.aciklama !== undefined && { aciklama: body.aciklama?.trim() || null }),
      ...(body.renk !== undefined && { renk: body.renk }),
      ...(body.aktif !== undefined && { aktif: body.aktif }),
      ...(body.personel_takibi_aktif !== undefined && { personel_takibi_aktif: body.personel_takibi_aktif }),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['tenant_admin', 'super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Projeye bağlı kayıtları NULL'a çek (silme, veri kaybı olmasın)
  await Promise.all([
    admin.from('lokasyonlar').update({ proje_id: null }).eq('proje_id', params.id),
    admin.from('gorevler').update({ proje_id: null }).eq('proje_id', params.id),
    admin.from('canli_gorevler').update({ proje_id: null }).eq('proje_id', params.id),
    admin.from('gorev_kurallari').update({ proje_id: null }).eq('proje_id', params.id),
    admin.from('users').update({ proje_id: null }).eq('proje_id', params.id),
  ])

  const { error } = await admin.from('projeler').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
