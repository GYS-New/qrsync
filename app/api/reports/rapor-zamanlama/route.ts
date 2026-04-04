import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET — firma/proje için zamanlanmış raporları listele */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const p = req.nextUrl.searchParams
  const firmaId = isSA ? (p.get('firmaId') ?? me.firma_id) : me.firma_id
  const projeId = p.get('projeId') ?? null
  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  const admin = createAdminClient()
  let q = admin.from('rapor_zamanlama').select('*').eq('firma_id', firmaId).order('olusturma_tarihi', { ascending: false })
  if (projeId) q = (q as any).eq('proje_id', projeId)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

/** POST — yeni zamanlama oluştur */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? (body.firmaId ?? me.firma_id) : me.firma_id
  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  const emails = (body.alici_emails ?? []).filter((e: string) => e && e.includes('@'))
  if (!emails.length) return NextResponse.json({ error: 'En az bir alıcı e-posta gerekli' }, { status: 400 })

  const tekrarTipi = body.tekrar_tipi ?? 'tek_sefer'
  if (!['tek_sefer', 'gunluk', 'haftalik', 'aylik'].includes(tekrarTipi))
    return NextResponse.json({ error: 'Geçersiz tekrar tipi' }, { status: 400 })

  // Sonraki gönderim tarihini hesapla
  const saat = body.saat ?? '08:00'
  let sonrakiGonderim: string | null = null
  if (tekrarTipi === 'tek_sefer') {
    const tarih = body.gonderim_tarihi ?? new Date().toISOString().slice(0, 10)
    sonrakiGonderim = `${tarih}T${saat}:00`
  } else {
    // Bugünden itibaren ilk gönderim
    const bugun = new Date()
    bugun.setHours(parseInt(saat.split(':')[0]), parseInt(saat.split(':')[1]), 0, 0)
    if (bugun.getTime() < Date.now()) bugun.setDate(bugun.getDate() + 1)
    sonrakiGonderim = bugun.toISOString()
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('rapor_zamanlama').insert({
    firma_id: firmaId,
    proje_id: body.projeId ?? null,
    olusturan_id: user.id,
    ust_lokasyon_id: body.ust_lokasyon_id ?? null,
    alici_emails: emails,
    tekrar_tipi: tekrarTipi,
    gun_secimi: body.gun_secimi ?? null,
    saat,
    rapor_baslangic: body.rapor_baslangic ?? null,
    rapor_bitis: body.rapor_bitis ?? null,
    rapor_gun_sayisi: body.rapor_gun_sayisi ?? 30,
    aciklama: body.aciklama ?? '',
    aktif: true,
    sonraki_gonderim_tarihi: sonrakiGonderim,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

/** DELETE — zamanlama sil */
export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json()
  const id = body.id
  if (!id) return NextResponse.json({ error: 'ID gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('rapor_zamanlama').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
