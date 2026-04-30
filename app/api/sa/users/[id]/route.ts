import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { normalizeTelefonForSave } from '@/lib/format/telefon'

function isSA(role?: string | null) {
  return role === 'super_admin' || role === 'alt_super_admin'
}

// SUPER_ADMIN / ALT_SUPER_ADMIN: update or delete any user.

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || !isSA(me.rol)) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })

  const userId = String(ctx.params.id)
  const body = await req.json().catch(() => ({} as any))

  // Alt SA, SA kullanıcısını düzenleyemez (hiyerarşik kısıt)
  if (me.rol === 'alt_super_admin') {
    const admin0 = createAdminClient()
    const { data: target } = await admin0.from('users').select('rol').eq('id', userId).single()
    if (target?.rol === 'super_admin') {
      return NextResponse.json({ error: 'Alt yönetici, ana yöneticiyi düzenleyemez' }, { status: 403 })
    }
    // Bir kullanıcının rolünü super_admin'e çıkarmak da yasak
    if (body.rol === 'super_admin') {
      return NextResponse.json({ error: 'Alt yönetici, super_admin rolü atayamaz' }, { status: 403 })
    }
  }

  const isim_soyisim = body.isim_soyisim !== undefined ? String(body.isim_soyisim).trim() : undefined
  // telefon alanı gönderildiyse standart formata çevir; boş gelirse default'a düşer
  const telefon = body.telefon !== undefined ? normalizeTelefonForSave(body.telefon) : undefined
  const aktif = body.aktif !== undefined ? Boolean(body.aktif) : undefined
  const rol = body.rol !== undefined ? String(body.rol) : undefined
  const email = body.email !== undefined ? String(body.email).trim().toLowerCase() : undefined
  const cinsiyet = body.cinsiyet !== undefined ? (body.cinsiyet === 'E' || body.cinsiyet === 'K' ? body.cinsiyet : null) : undefined

  const admin = createAdminClient()

  // Update Auth email if changed
  if (email) {
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, { email })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })
  }

  const updatePayload: any = {}
  if (isim_soyisim !== undefined) updatePayload.isim_soyisim = isim_soyisim
  if (telefon !== undefined) updatePayload.telefon = telefon
  if (aktif !== undefined) updatePayload.aktif = aktif
  if (rol !== undefined) updatePayload.rol = rol
  if (email !== undefined) updatePayload.email = email
  if (cinsiyet !== undefined) updatePayload.cinsiyet = cinsiyet

  if (Object.keys(updatePayload).length) {
    const { error: upErr } = await admin.from('users').update(updatePayload).eq('id', userId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
  }

  const aktifPasifTip = aktif === true ? 'kullanici_aktif_pasif' : aktif === false ? 'kullanici_aktif_pasif' : 'kullanici_guncelle'
  await auditLog({
    tip: aktifPasifTip as any,
    tablo: 'users',
    kullanici_id: me.id,
    detay: { hedef_user_id: userId, degisen_alanlar: Object.keys(updatePayload), yeni_degerler: updatePayload },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || !isSA(me.rol)) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })

  const userId = String(ctx.params.id)
  const admin = createAdminClient()

  // Silinen kullanıcının bilgilerini al (audit için)
  const { data: silinecek } = await admin.from('users').select('isim_soyisim,email,rol,firma_id').eq('id', userId).single()

  // Alt SA, SA kullanıcısını silemez (hiyerarşik kısıt)
  if (me.rol === 'alt_super_admin' && silinecek?.rol === 'super_admin') {
    return NextResponse.json({ error: 'Alt yönetici, ana yöneticiyi silemez' }, { status: 403 })
  }

  // public.users'tan silmeyi dene — hata yakalanır
  const { error: pubErr } = await admin.from('users').delete().eq('id', userId)
  if (pubErr) {
    await auditLog({
      tip: 'kullanici_sil', tablo: 'users', basarili: false,
      hata_mesaji: 'public.users: ' + pubErr.message, kullanici_id: me.id,
      firma_id: silinecek?.firma_id ?? null,
      detay: { hedef_user_id: userId, hedef_isim: silinecek?.isim_soyisim, asama: 'public_users_delete' },
    })
    return NextResponse.json({ error: 'Kullanıcı silinemedi: ' + pubErr.message }, { status: 400 })
  }

  // Auth tarafından da sil
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) {
    await auditLog({
      tip: 'kullanici_sil', tablo: 'users', basarili: false,
      hata_mesaji: 'auth.users: ' + delErr.message, kullanici_id: me.id,
      firma_id: silinecek?.firma_id ?? null,
      detay: { hedef_user_id: userId, hedef_isim: silinecek?.isim_soyisim, asama: 'auth_delete' },
    })
    return NextResponse.json({ error: 'Auth kullanıcısı silinemedi: ' + delErr.message }, { status: 400 })
  }

  await auditLog({
    tip: 'kullanici_sil', tablo: 'users',
    kullanici_id: me.id, firma_id: silinecek?.firma_id ?? null,
    detay: {
      hedef_user_id: userId,
      hedef_isim: silinecek?.isim_soyisim,
      hedef_email: silinecek?.email,
      hedef_rol: silinecek?.rol,
    },
  })

  return NextResponse.json({ ok: true })
}
