import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

// Creates a new Supabase Auth user + inserts into public.users
// Allowed:
// - super_admin / alt_super_admin: can create tenant_admin or tenant_user for any firma
// - tenant_admin: can create tenant_user only for own firma

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('id,rol,firma_id')
    .eq('id', authUser.id)
    .single()
  if (meErr || !me) return NextResponse.json({ error: 'User not found' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))

  const email         = String(body.email ?? '').trim().toLowerCase()
  const password      = String(body.password ?? '')
  const isim_soyisim  = String(body.isim_soyisim ?? '').trim()
  const telefon       = body.telefon ? String(body.telefon).trim() : null
  const rol           = String(body.rol ?? 'tenant_user')
  const firma_id      = body.firma_id ? String(body.firma_id) : null
  const body_proje_id = body.proje_id ? String(body.proje_id) : null
  const ust_lokasyon_id = body.ust_lokasyon_id ? String(body.ust_lokasyon_id) : null
  const cinsiyet = body.cinsiyet === 'E' || body.cinsiyet === 'K' ? body.cinsiyet : null

  if (!email || !password || !isim_soyisim) {
    return NextResponse.json({ error: 'Eksik alan: email, password, isim_soyisim' }, { status: 400 })
  }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'

  const isU = me.rol === 'tenant_user'
  const isM = me.rol === 'musteri'
  if (!isSA && !isTA && !isU && !isM) {
    return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })
  }
  if (isTA && !['tenant_user', 'musteri'].includes(rol)) {
    return NextResponse.json({ error: 'Firma admini sadece kullanıcı ve müşteri oluşturabilir' }, { status: 403 })
  }
  if ((isU || isM) && rol !== 'tenant_user') {
    return NextResponse.json({ error: 'Sadece kullanıcı oluşturabilirsiniz' }, { status: 403 })
  }

  const isAltSACreation = isSA && rol === 'alt_super_admin'

  const finalFirmaId = isAltSACreation ? null : (isSA ? firma_id : me.firma_id)
  // U rolü: kendi firma_id'si kullanılır
  if (!isAltSACreation && !finalFirmaId) {
    return NextResponse.json({ error: 'firma_id gerekli' }, { status: 400 })
  }

  const allowedRols = ['tenant_user', 'tenant_admin', 'musteri', ...(isSA ? ['alt_super_admin'] : [])]
  if (!allowedRols.includes(rol)) {
    return NextResponse.json({ error: 'Geçersiz rol' }, { status: 400 })
  }

  const admin = createAdminClient()

  // ── proje_id belirleme ────────────────────────────────────────────────────
  // TA: client'tan gelen değeri kullan; yoksa cookie'den (getAktifProje) fallback
  // SA: client'tan gelen değeri kullan; yoksa proje_id null (SA kendi seçer)
  let finalProjeId: string | null = body_proje_id

  if (isTA && !finalProjeId && finalFirmaId) {
    // TA kendi aktif projesini cookie'den oku
    const { getAktifProje } = await import('@/lib/projeler/getAktifProje')
    const aktifProje = await getAktifProje(finalFirmaId)
    finalProjeId = aktifProje?.id ?? null
  }

  if (!isAltSACreation && !finalProjeId) {
    return NextResponse.json({ error: 'Proje seçilmedi. Lütfen aktif proje seçin.' }, { status: 400 })
  }

  // ── Auth kullanıcısı oluştur ──────────────────────────────────────────────
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message ?? 'Auth user oluşturulamadı' }, { status: 400 })
  }

  const userId = created.user.id

  const { error: insertErr } = await admin
    .from('users')
    .insert({
      id: userId,
      isim_soyisim,
      email,
      telefon,
      rol,
      ...(finalFirmaId ? { firma_id: finalFirmaId } : {}),
      kayit_yapan_id: me.id,
      aktif: true,
      ...(!isAltSACreation && finalProjeId ? { proje_id: finalProjeId } : {}),
      ...(ust_lokasyon_id ? { ust_lokasyon_id } : {}),
      ...(cinsiyet ? { cinsiyet } : {}),
      ...(isSA && body.is_tester === true ? { is_tester: true } : {}),
    })

  if (insertErr) {
    await admin.auth.admin.deleteUser(userId)
    await auditLog({
      tip: 'kullanici_ekle', tablo: 'users', basarili: false, hata_mesaji: insertErr.message,
      kullanici_id: me.id, firma_id: firma_id ?? me.firma_id ?? null,
      detay: { email, isim_soyisim, rol, hedef_firma: firma_id, hedef_proje: body_proje_id },
    })
    return NextResponse.json({ error: insertErr.message }, { status: 400 })
  }

  await auditLog({
    tip: 'kullanici_ekle', tablo: 'users',
    kullanici_id: me.id, firma_id: firma_id ?? me.firma_id ?? null,
    proje_id: body_proje_id,
    detay: { eklenen_id: userId, email, isim_soyisim, rol },
  })

  return NextResponse.json({ ok: true, id: userId })
}
