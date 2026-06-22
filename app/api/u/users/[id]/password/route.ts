import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { auditLog } from '@/lib/audit/log'

// /api/u/users/[id]/password
// U/M kullanıcısı kendi yetki kapsamındaki kullanıcıların şifresini değiştirebilir.

const ADMIN_ROLLERI = new Set(['super_admin', 'alt_super_admin', 'tenant_admin'])

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) {
    return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
  }
  if (!me.firma_id) return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 400 })

  // Yetki: kullanıcılar düzenleyebilir mi?
  const yetki = await sayfaYetkileri(me.rol, 'kullanicilar', me.firma_id)
  if (!yetki.duzenleyebilir) {
    return NextResponse.json({ error: 'Düzenleme yetkiniz yok' }, { status: 403 })
  }

  const userId = String(ctx.params.id)
  const body = await req.json().catch(() => ({} as any))
  const password = String(body.password ?? '')
  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Şifre en az 6 karakter olmalı' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: target } = await admin.from('users').select('id,rol,firma_id,ust_lokasyon_id,isim_soyisim,email').eq('id', userId).single()
  if (!target) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 })
  if (ADMIN_ROLLERI.has((target as any).rol)) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
  if ((target as any).firma_id !== me.firma_id) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })

  // Lokasyon scope
  const yetkiliLokIds = await getYetkiliLokasyonIds(supabase, me.firma_id, me.proje_id ?? null)
  if (yetkiliLokIds !== null) {
    const ust = (target as any).ust_lokasyon_id
    if (!ust || !yetkiliLokIds.includes(ust)) {
      return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
    }
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await auditLog({
    tip: 'kullanici_sifre_degis',
    tablo: 'users',
    kullanici_id: me.id,
    firma_id: me.firma_id,
    detay: {
      hedef_user_id: userId,
      hedef_isim: (target as any).isim_soyisim ?? null,
      hedef_eposta: (target as any).email ?? null,
      hedef_rol: (target as any).rol,
      yapan_rol: me.rol,
    },
  })

  return NextResponse.json({ ok: true })
}
