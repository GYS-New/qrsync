/**
 * /api/sa/tenant-admin-projeler
 *
 * SA-only. TA'nın görüntüleyebileceği projelerin junction kaydı (mig 098).
 *
 * GET ?user_id=...  → { user_id, firma_id, projeler: [{id, ad, aktif}] }
 *   Hedef TA'nın izinli projelerini liste döndürür (UI checkbox doldurma için).
 *
 * PUT  { user_id, proje_idler: string[] }
 *   Hedef TA'nın izinli proje setini tamamen yeniden yazar (delete + insert).
 *   En az 1 proje zorunlu (TA hiçbir projeyi görmemesi anlamsız).
 *   users.proje_id "default" olarak ilk proje_idler[0]'a eşitlenir
 *   (cookie yoksa hangi projeye düşeceği).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

async function requireSA(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }) }
  const { data: me } = await supabase.from('users').select('id,rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return { err: NextResponse.json({ error: 'SA yetkisi gerekli' }, { status: 403 }) }
  }
  return { me }
}

export async function GET(req: NextRequest) {
  const auth = await requireSA(req)
  if ('err' in auth) return auth.err

  const userId = req.nextUrl.searchParams.get('user_id')
  if (!userId) return NextResponse.json({ error: 'user_id gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const { data: targetUser } = await admin
    .from('users').select('id, rol, firma_id, proje_id')
    .eq('id', userId).maybeSingle()
  if (!targetUser) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 })
  if (targetUser.rol !== 'tenant_admin') {
    return NextResponse.json({ error: 'Sadece TA için proje listesi tutulur' }, { status: 400 })
  }

  // Firmaya ait aktif tüm projeler (seçim kaynağı) + bu TA'nın seçili olanları
  const [{ data: tumProjeler }, { data: seciliRows }] = await Promise.all([
    admin.from('projeler')
      .select('id, ad, aktif')
      .eq('firma_id', targetUser.firma_id)
      .order('ad'),
    admin.from('tenant_admin_projeler')
      .select('proje_id')
      .eq('user_id', userId),
  ])

  const seciliIds = new Set((seciliRows ?? []).map((r: any) => r.proje_id))
  const projeler = (tumProjeler ?? []).map((p: any) => ({
    id: p.id, ad: p.ad, aktif: p.aktif, secili: seciliIds.has(p.id),
  }))

  return NextResponse.json({
    user_id: userId,
    firma_id: targetUser.firma_id,
    default_proje_id: targetUser.proje_id,
    projeler,
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireSA(req)
  if ('err' in auth) return auth.err

  const body = await req.json().catch(() => ({} as any))
  const userId = String(body.user_id ?? '')
  const projeIdler: string[] = Array.isArray(body.proje_idler)
    ? body.proje_idler.filter((x: any) => typeof x === 'string' && x)
    : []

  if (!userId) return NextResponse.json({ error: 'user_id gerekli' }, { status: 400 })
  if (projeIdler.length === 0) {
    return NextResponse.json({ error: 'En az 1 proje seçilmeli' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: targetUser } = await admin
    .from('users').select('id, rol, firma_id').eq('id', userId).maybeSingle()
  if (!targetUser) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 404 })
  if (targetUser.rol !== 'tenant_admin') {
    return NextResponse.json({ error: 'Sadece TA için proje listesi tutulur' }, { status: 400 })
  }

  // Gönderilen tüm projeler bu firmaya ait + aktif mi doğrula
  const { data: kontrol } = await admin
    .from('projeler').select('id, aktif')
    .eq('firma_id', targetUser.firma_id)
    .in('id', projeIdler)
  const kontrolMap = new Map((kontrol ?? []).map((p: any) => [p.id, p.aktif]))
  for (const pid of projeIdler) {
    if (!kontrolMap.has(pid)) {
      return NextResponse.json({ error: `Proje ${pid} bu firmaya ait değil` }, { status: 400 })
    }
    if (kontrolMap.get(pid) === false) {
      return NextResponse.json({ error: 'Pasif proje atanamaz' }, { status: 400 })
    }
  }

  // Replace: önce sil, sonra ekle (transaction olmamasına rağmen UNIQUE PK güvenli)
  const { error: delErr } = await admin
    .from('tenant_admin_projeler').delete().eq('user_id', userId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const rows = projeIdler.map(pid => ({
    user_id: userId,
    proje_id: pid,
    firma_id: targetUser.firma_id,
    created_by: auth.me.id,
  }))
  const { error: insErr } = await admin.from('tenant_admin_projeler').insert(rows)
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // users.proje_id = ilk seçili (default proje — cookie yoksa hangisi olacak)
  await admin.from('users').update({ proje_id: projeIdler[0] }).eq('id', userId)

  await auditLog({
    tip: 'ta_proje_atama', tablo: 'tenant_admin_projeler',
    kullanici_id: auth.me.id, firma_id: targetUser.firma_id,
    detay: { hedef_user_id: userId, atanmis_projeler: projeIdler },
  })

  return NextResponse.json({ ok: true, sayisi: projeIdler.length })
}
