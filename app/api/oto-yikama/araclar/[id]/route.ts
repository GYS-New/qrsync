/**
 * PATCH  /api/oto-yikama/araclar/[id] — düzenle (plaka değişikliği audit'lenir)
 * DELETE /api/oto-yikama/araclar/[id] — sil (soft: aktif=false; query=?hard=1 ise hard delete)
 *
 * SA-only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'

async function sa(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 }) }
  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return { err: NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 }) }
  return { me }
}

// TA için firma scope kontrolü
function scopeKontrol(me: any, firmaId: string): NextResponse | null {
  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  if (!isSA && firmaId !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }
  return null
}

async function assertOtoYikamaAktifById(admin: any, aracId: string) {
  const { data: arac } = await admin.from('araclar').select('firma_id').eq('id', aracId).single()
  if (!arac) return { err: NextResponse.json({ ok: false, error: 'Araç bulunamadı' }, { status: 404 }) }
  const aktif = await getFirmaModulDurumu(admin, arac.firma_id, 'oto_yikama_aktif')
  if (!aktif) {
    return { err: NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 }) }
  }
  return { arac }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const auth = await sa(supabase); if ('err' in auth) return auth.err
  const admin = createAdminClient()
  const body = await req.json().catch(() => ({}))

  // Mevcut kaydı al — plaka değişikliği audit için + firma modül flag kontrolü
  const { data: mevcut } = await admin.from('araclar').select('*').eq('id', params.id).single()
  if (!mevcut) return NextResponse.json({ ok: false, error: 'Araç bulunamadı' }, { status: 404 })
  const scopeErr = scopeKontrol(auth.me, mevcut.firma_id); if (scopeErr) return scopeErr
  const modulAktif = await getFirmaModulDurumu(admin, mevcut.firma_id, 'oto_yikama_aktif')
  if (!modulAktif) {
    return NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 })
  }

  const update: any = {}
  if ('plaka' in body) {
    const p = String(body.plaka).trim().toUpperCase()
    if (!p) return NextResponse.json({ ok: false, error: 'Plaka boş olamaz' }, { status: 400 })
    update.plaka = p
  }
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
  if ('yikama_gunleri' in body) {
    update.yikama_gunleri = Array.isArray(body.yikama_gunleri)
      ? [...new Set(body.yikama_gunleri.filter((g: any) => Number.isInteger(g) && g >= 1 && g <= 7))]
      : []
  }
  if ('varsayilan_lokasyon_id' in body) {
    update.varsayilan_lokasyon_id = typeof body.varsayilan_lokasyon_id === 'string' && body.varsayilan_lokasyon_id
      ? body.varsayilan_lokasyon_id : null
  }
  if ('yikama_frekans_tip' in body) {
    const FREKANS_VALID = new Set(['HAFTALIK', 'BIHAFTA', 'AYLIK'])
    update.yikama_frekans_tip = FREKANS_VALID.has(body.yikama_frekans_tip) ? body.yikama_frekans_tip : 'HAFTALIK'
  }
  if ('yikama_frekans_aralik' in body) {
    update.yikama_frekans_aralik = Number.isInteger(body.yikama_frekans_aralik) && body.yikama_frekans_aralik >= 1
      ? body.yikama_frekans_aralik : 1
  }
  if ('yikama_referans_tarih' in body) {
    update.yikama_referans_tarih = typeof body.yikama_referans_tarih === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.yikama_referans_tarih)
      ? body.yikama_referans_tarih : null
  }
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

  const modul = await assertOtoYikamaAktifById(admin, params.id)
  if ('err' in modul) return modul.err
  const scopeErr = scopeKontrol(auth.me, modul.arac.firma_id); if (scopeErr) return scopeErr

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
