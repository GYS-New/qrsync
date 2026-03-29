/**
 * DELETE /api/raporlar/ceklist/{id}
 *
 * Çeklist sonuç kaydını siler.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const admin = await createAdminClient()

  try {
    // Yetki kontrolü
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Oturum açın' }, { status: 401 })
    }

    const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 403 })
    }

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const isTA = me.rol === 'tenant_admin'

    if (!isSA && !isTA) {
      return NextResponse.json({ ok: false, error: 'Silme izni yok' }, { status: 403 })
    }

    // Kaydı bul ve sil (ceklist_sonuclar tablosundan)
    const { data: kayit, error: findErr } = await admin
      .from('ceklist_sonuclar')
      .select('id,firma_id')
      .eq('id', params.id)
      .single()

    if (findErr || !kayit) {
      return NextResponse.json({ ok: false, error: 'Kayıt bulunamadı' }, { status: 404 })
    }

    // Firma kontrolü (SA herkesi silebilir, TA sadece kendi firmayı)
    if (isTA && kayit.firma_id !== me.firma_id) {
      return NextResponse.json({ ok: false, error: 'Farklı firmaya ait kayıt silemezsiniz' }, { status: 403 })
    }

    // Sil
    const { error: delErr } = await admin
      .from('ceklist_sonuclar')
      .delete()
      .eq('id', params.id)

    if (delErr) {
      return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: 'Kayıt silindi' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
