/**
 * GET/POST/PATCH/DELETE /api/oto-yikama/rapor-zamanlama
 *
 * Oto Yıkama otomatik rapor mail gönderim zamanlamalarının CRUD'u.
 * pg_cron her 15dk bir tetikler (Migration 088 + /api/cron/oto-yikama-rapor-gonder).
 *
 * Yetki: SA + alt_super_admin + TA (kendi firmasında).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sonrakiGonderimZamani, type TekrarTipi } from '@/lib/oto-yikama/raporZamanlama'

export const dynamic = 'force-dynamic'

async function yetki(): Promise<{ user: any; me: any } | NextResponse> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })
  const { data: me } = await supabase.from('users').select('id, rol, firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })
  if (!['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
  }
  return { user, me }
}

export async function GET(req: NextRequest) {
  const y = await yetki(); if (y instanceof NextResponse) return y
  const { me } = y
  const admin = createAdminClient()
  const firmaId = req.nextUrl.searchParams.get('firma_id') ?? me.firma_id
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  // TA sadece kendi firması
  if (me.rol === 'tenant_admin' && firmaId !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }
  const { data, error } = await admin
    .from('oto_yikama_rapor_zamanlama')
    .select('*')
    .eq('firma_id', firmaId)
    .order('olusturma_tarihi', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function POST(req: NextRequest) {
  const y = await yetki(); if (y instanceof NextResponse) return y
  const { me } = y
  const admin = createAdminClient()

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 }) }

  const firmaId = body?.firma_id ?? me.firma_id
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (me.rol === 'tenant_admin' && firmaId !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }

  const aliciEmails: string[] = Array.isArray(body?.alici_emails)
    ? body.alici_emails.map((e: any) => String(e).trim()).filter(Boolean)
    : []
  if (aliciEmails.length === 0) {
    return NextResponse.json({ ok: false, error: 'En az bir alıcı e-posta gerekli' }, { status: 400 })
  }
  for (const e of aliciEmails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return NextResponse.json({ ok: false, error: `Geçersiz e-posta: ${e}` }, { status: 400 })
    }
  }

  const tekrar = body?.tekrar_tipi as TekrarTipi
  if (!['gunluk', 'haftalik', 'aylik'].includes(tekrar)) {
    return NextResponse.json({ ok: false, error: 'Geçersiz tekrar_tipi' }, { status: 400 })
  }
  const saat = typeof body?.saat === 'string' && /^\d{2}:\d{2}$/.test(body.saat) ? body.saat : '08:00'
  const gunSecimi: number[] | null = Array.isArray(body?.gun_secimi)
    ? body.gun_secimi.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n))
    : null
  if (tekrar === 'haftalik' && (!gunSecimi || gunSecimi.length === 0)) {
    return NextResponse.json({ ok: false, error: 'Haftalık için gün seçimi gerekli (1=Pzt..7=Paz)' }, { status: 400 })
  }
  if (tekrar === 'aylik' && (!gunSecimi || gunSecimi.length === 0)) {
    return NextResponse.json({ ok: false, error: 'Aylık için ayın günü seçimi gerekli (1..28)' }, { status: 400 })
  }

  const konu = typeof body?.konu === 'string' && body.konu.trim() ? body.konu.trim() : null
  const aciklama = typeof body?.aciklama === 'string' ? body.aciklama.trim() || null : null

  const sonraki = sonrakiGonderimZamani(tekrar, gunSecimi, saat)

  const { data, error } = await admin
    .from('oto_yikama_rapor_zamanlama')
    .insert({
      firma_id: firmaId,
      olusturan_id: me.id,
      alici_emails: aliciEmails,
      konu,
      tekrar_tipi: tekrar,
      gun_secimi: gunSecimi,
      saat,
      aciklama,
      aktif: true,
      sonraki_gonderim_tarihi: sonraki.toISOString(),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function PATCH(req: NextRequest) {
  const y = await yetki(); if (y instanceof NextResponse) return y
  const { me } = y
  const admin = createAdminClient()

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 }) }
  const id = body?.id as string | undefined
  if (!id) return NextResponse.json({ ok: false, error: 'id gerekli' }, { status: 400 })

  // Yetki: TA sadece kendi firmasındaki kayıtlar
  const { data: mevcut } = await admin
    .from('oto_yikama_rapor_zamanlama').select('firma_id, tekrar_tipi, gun_secimi, saat')
    .eq('id', id).maybeSingle()
  if (!mevcut) return NextResponse.json({ ok: false, error: 'Kayıt bulunamadı' }, { status: 404 })
  if (me.rol === 'tenant_admin' && mevcut.firma_id !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const guncel: any = {}
  // Aç/kapat
  if (typeof body?.aktif === 'boolean') {
    guncel.aktif = body.aktif
    // Yeniden aktive edilirse sonraki gönderim yenilenmeli
    if (body.aktif === true) {
      guncel.sonraki_gonderim_tarihi = sonrakiGonderimZamani(
        mevcut.tekrar_tipi as TekrarTipi, mevcut.gun_secimi as any, mevcut.saat as any,
      ).toISOString()
    }
  }
  // Diğer alanlar düzenleme
  if (Array.isArray(body?.alici_emails)) guncel.alici_emails = body.alici_emails.map((e: any) => String(e).trim()).filter(Boolean)
  if (typeof body?.konu === 'string') guncel.konu = body.konu.trim() || null
  if (typeof body?.aciklama === 'string') guncel.aciklama = body.aciklama.trim() || null

  if (Object.keys(guncel).length === 0) {
    return NextResponse.json({ ok: false, error: 'Güncellenecek alan yok' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('oto_yikama_rapor_zamanlama')
    .update(guncel).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function DELETE(req: NextRequest) {
  const y = await yetki(); if (y instanceof NextResponse) return y
  const { me } = y
  const admin = createAdminClient()
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id gerekli' }, { status: 400 })

  const { data: mevcut } = await admin
    .from('oto_yikama_rapor_zamanlama').select('firma_id').eq('id', id).maybeSingle()
  if (!mevcut) return NextResponse.json({ ok: false, error: 'Kayıt bulunamadı' }, { status: 404 })
  if (me.rol === 'tenant_admin' && mevcut.firma_id !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const { error } = await admin.from('oto_yikama_rapor_zamanlama').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
