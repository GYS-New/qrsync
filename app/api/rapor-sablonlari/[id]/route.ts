import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PUT - Rapor şablonunu güncelle
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data: me, error: meError } = await supabase
    .from('users')
    .select('id, rol, firma_id')
    .eq('id', user.id)
    .single()

  if (meError || !me) {
    return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })
  }

  const body = await request.json()
  const { ad, aciklama, icerik, aktif } = body

  if (!ad || !icerik) {
    return NextResponse.json({ ok: false, error: 'ad ve icerik zorunludur' }, { status: 400 })
  }

  // Önce şablonu kontrol et
  const { data: sablon, error: sablonError } = await supabase
    .from('rapor_sablonlari')
    .select('*')
    .eq('id', params.id)
    .single()

  if (sablonError || !sablon) {
    return NextResponse.json({ ok: false, error: 'sablon_not_found' }, { status: 404 })
  }

  // Varsayılan şablon düzenlenemez
  if (sablon.varsayilan) {
    return NextResponse.json({ ok: false, error: 'Genel Rapor Şablonu düzenlenemez!' }, { status: 403 })
  }

  // Yetki kontrolü
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (!isSA && sablon.firma_id !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 })
  }

  const updateData: any = {
    ad,
    aciklama,
    icerik,
    guncelleyen_id: me.id,
  }

  if (aktif !== undefined) {
    updateData.aktif = aktif
  }

  const { data, error } = await supabase
    .from('rapor_sablonlari')
    .update(updateData)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data })
}

// DELETE - Rapor şablonunu sil
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data: me, error: meError } = await supabase
    .from('users')
    .select('id, rol, firma_id')
    .eq('id', user.id)
    .single()

  if (meError || !me) {
    return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })
  }

  // Önce şablonu kontrol et
  const { data: sablon, error: sablonError } = await supabase
    .from('rapor_sablonlari')
    .select('*')
    .eq('id', params.id)
    .single()

  if (sablonError || !sablon) {
    return NextResponse.json({ ok: false, error: 'sablon_not_found' }, { status: 404 })
  }

  // Varsayılan şablon silinemez (veritabanı trigger'ı da kontrol eder)
  if (sablon.varsayilan) {
    return NextResponse.json({ ok: false, error: 'Genel Rapor Şablonu silinemez!' }, { status: 403 })
  }

  // Yetki kontrolü
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (!isSA && sablon.firma_id !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 })
  }

  const { error } = await supabase
    .from('rapor_sablonlari')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Şablon başarıyla silindi' })
}
