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

  // Sonraki gönderim tarihini hesapla — TR saatine göre (+03:00)
  // Eski akış server timezone'u (UTC) kullanıyordu, kullanıcının saati 3 saat
  // sonraya kayıyordu (örn 14:33 TR → 14:33 UTC = 17:33 TR). Fix: explicit offset.
  const saat = body.saat ?? '08:00'
  let sonrakiGonderim: string | null = null
  const gunSecimi = body.gun_secimi ?? null

  // TR tarihi (YYYY-MM-DD) — sv-SE locale ISO 8601 format döner
  const trDateStr = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
  // TR saatindeki "tarih saat" → UTC ISO string
  const trToUtcIso = (tarihStr: string, saatStr: string) =>
    new Date(`${tarihStr}T${saatStr}:00+03:00`).toISOString()

  const now = new Date()
  const trBugun = trDateStr(now)

  if (tekrarTipi === 'tek_sefer') {
    const tarih = body.gonderim_tarihi ?? trBugun
    sonrakiGonderim = trToUtcIso(tarih, saat)
  } else if (tekrarTipi === 'gunluk') {
    let iso = trToUtcIso(trBugun, saat)
    if (new Date(iso).getTime() <= now.getTime()) {
      const yarin = trDateStr(new Date(now.getTime() + 86400000))
      iso = trToUtcIso(yarin, saat)
    }
    sonrakiGonderim = iso
  } else if (tekrarTipi === 'haftalik' && gunSecimi?.[0] != null) {
    // Sonraki seçilen haftanın gününü bul (TR günü bazlı)
    const hedefGun = gunSecimi[0] // 0=Pazar...6=Cumartesi
    // TR günü
    const trNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }))
    const bugunGun = trNow.getDay()
    let fark = hedefGun - bugunGun
    const bugunIso = trToUtcIso(trBugun, saat)
    if (fark < 0 || (fark === 0 && new Date(bugunIso).getTime() <= now.getTime())) fark += 7
    const hedefDate = new Date(now.getTime() + fark * 86400000)
    sonrakiGonderim = trToUtcIso(trDateStr(hedefDate), saat)
  } else if (tekrarTipi === 'aylik' && gunSecimi?.[0] != null) {
    const hedefGun = gunSecimi[0]
    const trNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }))
    let yil = trNow.getFullYear()
    let ay  = trNow.getMonth()
    const bugunGun = trNow.getDate()
    const bugunHedefIso = trToUtcIso(`${yil}-${String(ay + 1).padStart(2, '0')}-${String(hedefGun).padStart(2, '0')}`, saat)
    if (bugunGun > hedefGun || (bugunGun === hedefGun && new Date(bugunHedefIso).getTime() <= now.getTime())) {
      ay += 1
      if (ay > 11) { ay = 0; yil += 1 }
    }
    const sonGun = new Date(yil, ay + 1, 0).getDate()
    const gunClamped = Math.min(hedefGun, sonGun)
    const tarihStr = `${yil}-${String(ay + 1).padStart(2, '0')}-${String(gunClamped).padStart(2, '0')}`
    sonrakiGonderim = trToUtcIso(tarihStr, saat)
  } else {
    let iso = trToUtcIso(trBugun, saat)
    if (new Date(iso).getTime() <= now.getTime()) {
      const yarin = trDateStr(new Date(now.getTime() + 86400000))
      iso = trToUtcIso(yarin, saat)
    }
    sonrakiGonderim = iso
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
