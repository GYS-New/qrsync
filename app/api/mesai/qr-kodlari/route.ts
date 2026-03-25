import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function yetkiKontrol(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, me: null }
  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return { ok: false, me: null }
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  const isTenantViewer = me.rol === 'musteri' || me.rol === 'tenant_user'
  if (!isSA && !isTA && !isTenantViewer) return { ok: false, me: null }
  return { ok: true, me: { ...me, isSA, isTA, isTenantViewer } }
}

// SA/TA yetkisi gerektiren işlemler için ayrı kontrol
async function yetkiKontrolYonetici(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, me: null }
  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return { ok: false, me: null }
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return { ok: false, me: null }
  return { ok: true, me: { ...me, isSA, isTA } }
}

// GET — firma+proje için mevcut mesai QR tokenlarını listele
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()
  const { ok, me } = await yetkiKontrol(supabase)
  if (!ok || !me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const p       = new URL(req.url).searchParams
  const firmaId = me.isSA ? p.get('firma_id') : me.firma_id
  const projeId = p.get('proje_id') ?? null

  if (!firmaId) return NextResponse.json({ ok: true, data: [] })

  let q = admin.from('mesai_qr_kodlari')
    .select('id,firma_id,proje_id,tip,token,nfc_token,aktif,olusturma_tarihi')
    .eq('firma_id', firmaId)
    .order('tip')

  if (projeId) q = (q as any).eq('proje_id', projeId)
  else q = (q as any).is('proje_id', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, data: data ?? [] })
}

// POST — firma+proje için GIRIS ve CIKIS tokenlarını oluştur (yoksa yarat, varsa yenile)
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()
  const { ok, me } = await yetkiKontrolYonetici(supabase)
  if (!ok || !me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Geçersiz istek' }, { status: 400 })
  }

  const firmaId = me.isSA ? (body.firma_id ?? me.firma_id) : me.firma_id
  const projeId = body.proje_id ?? null
  const yenile  = body.yenile === true // mevcut token'ı sil ve yeniden üret

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })

  const sonuc: any[] = []

  for (const tip of ['GIRIS', 'CIKIS'] as const) {
    // Mevcut token var mı?
    let q = admin.from('mesai_qr_kodlari')
      .select('id,token,nfc_token')
      .eq('firma_id', firmaId)
      .eq('tip', tip)

    if (projeId) q = (q as any).eq('proje_id', projeId)
    else q = (q as any).is('proje_id', null)

    const { data: mevcut } = await q.maybeSingle()

    if (mevcut && !yenile) {
      sonuc.push({ tip, ...mevcut, yeni: false })
      continue
    }

    // Yenile → eskiyi sil
    if (mevcut && yenile) {
      await admin.from('mesai_qr_kodlari').delete().eq('id', mevcut.id)
    }

    // Yeni token oluştur
    const { data: yeni, error } = await admin.from('mesai_qr_kodlari')
      .insert({ firma_id: firmaId, proje_id: projeId, tip })
      .select('id,token,nfc_token')
      .single()

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    sonuc.push({ tip, ...yeni, yeni: true })
  }

  return NextResponse.json({ ok: true, data: sonuc })
}

// DELETE — belirli bir token'ı sil
export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()
  const { ok, me } = await yetkiKontrolYonetici(supabase)
  if (!ok || !me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id gerekli' }, { status: 400 })

  const { data: kayit } = await admin.from('mesai_qr_kodlari').select('firma_id').eq('id', id).single()
  if (!kayit) return NextResponse.json({ ok: false, error: 'Bulunamadı' }, { status: 404 })
  if (me.isTA && kayit.firma_id !== me.firma_id)
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  await admin.from('mesai_qr_kodlari').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
