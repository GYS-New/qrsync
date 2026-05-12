/**
 * PATCH  /api/oto-yikama/istasyonlar/[id]  → ad / notlar / aktif düzenle
 * DELETE /api/oto-yikama/istasyonlar/[id]  → soft (aktif=false) ya da ?hard=1 ile gerçek silme
 *
 * SA-only + firma için oto_yikama_aktif=true zorunlu.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'

async function sa(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 }) }
  const { data: me } = await supabase.from('users').select('id,rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return { err: NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 }) }
  }
  return { me }
}

async function loadAndGuard(admin: any, id: string) {
  const { data: ist } = await admin.from('yikama_istasyonlari').select('*').eq('id', id).single()
  if (!ist) return { err: NextResponse.json({ ok: false, error: 'İstasyon bulunamadı' }, { status: 404 }) }
  const aktif = await getFirmaModulDurumu(admin, ist.firma_id, 'oto_yikama_aktif')
  if (!aktif) return { err: NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 }) }
  return { ist }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const auth = await sa(supabase); if ('err' in auth) return auth.err
  const admin = createAdminClient()

  const guard = await loadAndGuard(admin, params.id)
  if ('err' in guard) return guard.err

  const body = await req.json().catch(() => ({}))
  const update: any = {}
  if ('ad' in body) {
    const a = String(body.ad ?? '').trim()
    if (!a) return NextResponse.json({ ok: false, error: 'ad boş olamaz' }, { status: 400 })
    update.ad = a
  }
  if ('notlar' in body) update.notlar = body.notlar?.toString().trim() || null
  if ('aktif' in body) update.aktif = !!body.aktif

  const { data, error } = await admin.from('yikama_istasyonlari').update(update).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const auth = await sa(supabase); if ('err' in auth) return auth.err
  const admin = createAdminClient()

  const guard = await loadAndGuard(admin, params.id)
  if ('err' in guard) return guard.err

  const hard = req.nextUrl.searchParams.get('hard') === '1'

  if (hard) {
    const { error } = await admin.from('yikama_istasyonlari').delete().eq('id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  } else {
    const { error } = await admin.from('yikama_istasyonlari').update({ aktif: false }).eq('id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
