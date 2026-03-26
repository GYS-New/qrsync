import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const url = new URL(req.url)
  const firmaId = url.searchParams.get('firma_id') ?? me.firma_id

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('projeler')
    .select('*')
    .eq('firma_id', firmaId)
    .order('kayit_tarihi', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['tenant_admin', 'super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Yetkisiz rol' }, { status: 403 })
  }

  const body = await req.json()
  const { ad, aciklama, renk, firma_id } = body

  if (!ad?.trim()) return NextResponse.json({ error: 'Proje adı zorunlu' }, { status: 400 })

  const targetFirmaId = firma_id ?? me.firma_id
  if (!targetFirmaId) return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('projeler')
    .insert({
      firma_id: targetFirmaId,
      ad: ad.trim(),
      aciklama: aciklama?.trim() || null,
      renk: renk || '#2e8b2e',
      kayit_yapan_id: user.id,
      personel_takibi_aktif: body.personel_takibi_aktif === true,
      birim_fiyat_aktif: body.birim_fiyat_aktif === true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
