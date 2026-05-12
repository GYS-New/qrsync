/**
 * PATCH  /api/oto-yikama/araclar/[id] — düzenle (plaka değişikliği audit'lenir)
 * DELETE /api/oto-yikama/araclar/[id] — sil (soft: aktif=false; query=?hard=1 ise hard delete)
 *
 * SA-only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const auth = await sa(supabase); if ('err' in auth) return auth.err
  const admin = createAdminClient()
  const body = await req.json().catch(() => ({}))

  // Mevcut kaydı al — plaka değişikliği audit için
  const { data: mevcut } = await admin.from('araclar').select('*').eq('id', params.id).single()
  if (!mevcut) return NextResponse.json({ ok: false, error: 'Araç bulunamadı' }, { status: 404 })

  const update: any = {}
  if ('plaka' in body) {
    const p = String(body.plaka).trim().toUpperCase()
    if (!p) return NextResponse.json({ ok: false, error: 'Plaka boş olamaz' }, { status: 400 })
    update.plaka = p
  }
  if ('marka' in body) update.marka = body.marka
  if ('model' in body) update.model = body.model
  if ('renk' in body) update.renk = body.renk
  if ('departman' in body) {
    const d = String(body.departman ?? '').trim()
    if (!d) return NextResponse.json({ ok: false, error: 'Departman boş olamaz' }, { status: 400 })
    update.departman = d
  }
  if ('kullanici_adi_soyadi' in body) {
    const k = String(body.kullanici_adi_soyadi ?? '').trim()
    if (!k) return NextResponse.json({ ok: false, error: 'Kullanıcı adı soyadı boş olamaz' }, { status: 400 })
    update.kullanici_adi_soyadi = k
  }
  if ('kullanici_telefon' in body) update.kullanici_telefon = body.kullanici_telefon?.toString().trim() || null
  if ('kullanici_email' in body) update.kullanici_email = body.kullanici_email?.toString().trim() || null
  if ('periyot_gun' in body) update.periyot_gun = body.periyot_gun
  if ('notlar' in body) update.notlar = body.notlar
  if ('aktif' in body) update.aktif = !!body.aktif

  const { data, error } = await admin.from('araclar').update(update).eq('id', params.id).select().single()
  if (error) {
    const msg = error.message.includes('duplicate') ? `${update.plaka} plakası başka bir araçta kayıtlı` : error.message
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }

  // Plaka değişti mi → audit log
  if (update.plaka && update.plaka !== mevcut.plaka) {
    await admin.from('arac_plaka_gecmisi').insert({
      arac_id: params.id,
      eski_plaka: mevcut.plaka,
      yeni_plaka: update.plaka,
      degisturen_id: auth.me!.id,
      sebep: body.plaka_sebep ?? null,
    })
  }

  return NextResponse.json({ ok: true, data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const auth = await sa(supabase); if ('err' in auth) return auth.err
  const admin = createAdminClient()
  const hard = req.nextUrl.searchParams.get('hard') === '1'

  if (hard) {
    const { error } = await admin.from('araclar').delete().eq('id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  } else {
    // Soft delete
    const { error } = await admin.from('araclar').update({ aktif: false }).eq('id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
