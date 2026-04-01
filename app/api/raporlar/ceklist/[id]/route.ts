/**
 * DELETE /api/raporlar/ceklist/{id}
 *
 * Çeklist sonuç kaydını siler.
 * Kullanıcı Grupları Yetkilerine bağlıdır.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'

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

    // Kullanıcı Grupları Yetkilerine bağla
    const yetkiler = await sayfaYetkileri(me.rol, 'ceklist-raporlari', me.firma_id ?? undefined)
    
    if (!yetkiler.silebilir) {
      return NextResponse.json({ ok: false, error: 'Silme izni yok' }, { status: 403 })
    }

    // Kaydı bul
    const { data: kayit, error: findErr } = await admin
      .from('checklist_sonuc_basliklari')
      .select('id,firma_id')
      .eq('id', params.id)
      .single()

    if (findErr || !kayit) {
      return NextResponse.json({ ok: false, error: 'Kayıt bulunamadı' }, { status: 404 })
    }

    // Firma kontrolü (SA herkesi silebilir, diğerleri sadece kendi firmayı)
    if (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin' && kayit.firma_id !== me.firma_id) {
      return NextResponse.json({ ok: false, error: 'Farklı firmaya ait kayıt silemezsiniz' }, { status: 403 })
    }

    // Önce maddeleri sil, sonra başlığı sil
    await admin.from('checklist_sonuc_maddeleri').delete().eq('sonuc_id', params.id)

    const { error: delErr } = await admin
      .from('checklist_sonuc_basliklari')
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
