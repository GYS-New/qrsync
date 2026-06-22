import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { normalizeTelefonForSave } from '@/lib/format/telefon'

// /api/u/users/[id]
// tenant_user (U) ve musteri (M) rollerinin kullanıcı yönetimi.
// Yetki: sayfaYetkileri('kullanicilar') ile dinamik (firma admini ayarlar).
// Kapsam: aynı firma + caller'ın yetkili olduğu üst lokasyon ağacı içinde.
// Hedef rol kısıtı: super_admin / alt_super_admin / tenant_admin yönetilemez.

function isUorM(rol?: string | null) {
  return rol === 'tenant_user' || rol === 'musteri'
}

const ADMIN_ROLLERI = new Set(['super_admin', 'alt_super_admin', 'tenant_admin'])

async function authAndContext(req: Request) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || !isUorM(me.rol)) {
    return { error: NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 }) }
  }
  if (!me.firma_id) {
    return { error: NextResponse.json({ error: 'Firma bulunamadı' }, { status: 400 }) }
  }
  return { supabase, me }
}

async function targetIcindeMi(supabase: any, meFirmaId: string, meProjeId: string | null, hedef: { id: string; firma_id: string | null; ust_lokasyon_id: string | null; rol: string }) {
  // Aynı firma
  if (hedef.firma_id !== meFirmaId) return false
  // Hedef admin/SA olamaz
  if (ADMIN_ROLLERI.has(hedef.rol)) return false
  // Lokasyon scope (U/M kısıtlıysa)
  const yetkiliLokIds = await getYetkiliLokasyonIds(supabase, meFirmaId, meProjeId)
  if (yetkiliLokIds === null) return true // tüm erişim
  if (!hedef.ust_lokasyon_id) return false
  return yetkiliLokIds.includes(hedef.ust_lokasyon_id)
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  const ctxRes = await authAndContext(req)
  if ('error' in ctxRes) return ctxRes.error
  const { supabase, me } = ctxRes

  // Yetki: kullanıcılar sayfası — düzenleyebilir mi?
  const yetki = await sayfaYetkileri(me.rol, 'kullanicilar', me.firma_id)
  if (!yetki.duzenleyebilir) {
    return NextResponse.json({ error: 'Düzenleme yetkiniz yok' }, { status: 403 })
  }

  const userId = String(ctx.params.id)
  const body = await req.json().catch(() => ({} as any))

  const isim_soyisim = body.isim_soyisim !== undefined ? String(body.isim_soyisim).trim() : undefined
  // telefon alanı gönderildiyse standart formata çevir; boş gelirse default'a düşer
  const telefon      = body.telefon !== undefined ? normalizeTelefonForSave(body.telefon) : undefined
  const aktif        = body.aktif !== undefined ? Boolean(body.aktif) : undefined
  const email        = body.email !== undefined ? String(body.email).trim().toLowerCase() : undefined
  const cinsiyet     = body.cinsiyet !== undefined ? (body.cinsiyet === 'E' || body.cinsiyet === 'K' ? body.cinsiyet : null) : undefined
  const ust_lokasyon_id = body.ust_lokasyon_id === undefined ? undefined
    : (body.ust_lokasyon_id === null || body.ust_lokasyon_id === '' ? null : String(body.ust_lokasyon_id))
  const varsayilan_yikama_istasyon_id = body.varsayilan_yikama_istasyon_id === undefined ? undefined
    : (body.varsayilan_yikama_istasyon_id === null || body.varsayilan_yikama_istasyon_id === '' ? null : String(body.varsayilan_yikama_istasyon_id))

  const admin = createAdminClient()

  const { data: target } = await admin.from('users').select('id,rol,firma_id,ust_lokasyon_id').eq('id', userId).single()
  if (!target) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 })
  const icinde = await targetIcindeMi(supabase, me.firma_id, me.proje_id ?? null, target as any)
  if (!icinde) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })

  // Email değişikliği için Auth tarafında da güncelle
  if (email) {
    const { error: authErr } = await admin.auth.admin.updateUserById(userId, { email })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })
  }

  const updatePayload: any = {}
  if (isim_soyisim !== undefined) updatePayload.isim_soyisim = isim_soyisim
  if (telefon !== undefined)      updatePayload.telefon = telefon
  if (aktif !== undefined)        updatePayload.aktif = aktif
  if (email !== undefined)        updatePayload.email = email
  if (cinsiyet !== undefined)     updatePayload.cinsiyet = cinsiyet
  if (ust_lokasyon_id !== undefined) updatePayload.ust_lokasyon_id = ust_lokasyon_id
  if (varsayilan_yikama_istasyon_id !== undefined) {
    if (varsayilan_yikama_istasyon_id) {
      const { data: targetUser } = await admin.from('users').select('firma_id, ust_lokasyon_id').eq('id', userId).single()
      const finalUst = ust_lokasyon_id !== undefined ? ust_lokasyon_id : targetUser?.ust_lokasyon_id
      const { data: alt } = await admin.from('lokasyonlar')
        .select('id, parent_id, firma_id, aktif')
        .eq('id', varsayilan_yikama_istasyon_id)
        .maybeSingle()
      if (!alt || alt.firma_id !== targetUser?.firma_id || alt.aktif === false || (finalUst && alt.parent_id !== finalUst)) {
        return NextResponse.json({ error: 'Geçersiz yıkama istasyonu (alt lokasyon)' }, { status: 400 })
      }
    }
    updatePayload.varsayilan_yikama_istasyon_id = varsayilan_yikama_istasyon_id
  }

  if (Object.keys(updatePayload).length) {
    const { error: upErr } = await admin.from('users').update(updatePayload).eq('id', userId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
  }

  const tip = aktif !== undefined ? 'kullanici_aktif_pasif' : 'kullanici_guncelle'
  await auditLog({
    tip, tablo: 'users', kullanici_id: me.id, firma_id: me.firma_id,
    detay: { hedef_user_id: userId, degisen_alanlar: Object.keys(updatePayload), yeni_degerler: updatePayload },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: { params: { id: string } }) {
  const ctxRes = await authAndContext(_req)
  if ('error' in ctxRes) return ctxRes.error
  const { supabase, me } = ctxRes

  const yetki = await sayfaYetkileri(me.rol, 'kullanicilar', me.firma_id)
  if (!yetki.silebilir) {
    return NextResponse.json({ error: 'Silme yetkiniz yok' }, { status: 403 })
  }

  const userId = String(ctx.params.id)
  const admin = createAdminClient()

  const { data: target } = await admin.from('users').select('id,rol,firma_id,ust_lokasyon_id,isim_soyisim,email').eq('id', userId).single()
  if (!target) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 })
  const icinde = await targetIcindeMi(supabase, me.firma_id, me.proje_id ?? null, target as any)
  if (!icinde) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })

  // public.users
  const { error: pubErr } = await admin.from('users').delete().eq('id', userId)
  if (pubErr) {
    await auditLog({
      tip: 'kullanici_sil', tablo: 'users', basarili: false,
      hata_mesaji: 'public.users: ' + pubErr.message, kullanici_id: me.id, firma_id: me.firma_id,
      detay: { hedef_user_id: userId, hedef_isim: (target as any).isim_soyisim, asama: 'public_users_delete' },
    })
    return NextResponse.json({ error: 'Kullanıcı silinemedi: ' + pubErr.message }, { status: 400 })
  }

  // auth.users
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) {
    await auditLog({
      tip: 'kullanici_sil', tablo: 'users', basarili: false,
      hata_mesaji: 'auth.users: ' + delErr.message, kullanici_id: me.id, firma_id: me.firma_id,
      detay: { hedef_user_id: userId, hedef_isim: (target as any).isim_soyisim, asama: 'auth_delete' },
    })
    return NextResponse.json({ error: 'Auth kullanıcısı silinemedi: ' + delErr.message }, { status: 400 })
  }

  await auditLog({
    tip: 'kullanici_sil', tablo: 'users',
    kullanici_id: me.id, firma_id: me.firma_id,
    detay: {
      hedef_user_id: userId,
      hedef_isim: (target as any).isim_soyisim,
      hedef_email: (target as any).email,
      hedef_rol: (target as any).rol,
    },
  })

  return NextResponse.json({ ok: true })
}
