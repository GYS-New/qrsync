/**
 * GET    /api/oto-yikama/araclar — liste (firma + opsiyonel proje filtreli)
 * POST   /api/oto-yikama/araclar — yeni araç ekle
 *
 * SA-only. Diğer roller 403.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'

async function sa(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 }) }
  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return { err: NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 }) }
  }
  return { me }
}

async function assertOtoYikamaAktif(admin: any, firmaId: string) {
  const aktif = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!aktif) {
    return NextResponse.json(
      { ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil. Firma detay sayfasından açın.' },
      { status: 403 },
    )
  }
  return null
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const auth = await sa(supabase); if ('err' in auth) return auth.err
  const admin = createAdminClient()
  const sp = req.nextUrl.searchParams
  const firmaId = sp.get('firma_id')
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  const modulErr = await assertOtoYikamaAktif(admin, firmaId); if (modulErr) return modulErr
  const projeId = sp.get('proje_id')
  const aktif = sp.get('aktif')

  let q = admin.from('araclar').select('*').eq('firma_id', firmaId).order('plaka')
  if (projeId) q = q.eq('proje_id', projeId)
  if (aktif === 'true') q = q.eq('aktif', true)
  if (aktif === 'false') q = q.eq('aktif', false)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const auth = await sa(supabase); if ('err' in auth) return auth.err
  const admin = createAdminClient()
  const body = await req.json().catch(() => ({}))

  const plaka = String(body.plaka ?? '').trim().toUpperCase()
  const kullaniciAd = String(body.kullanici_adi_soyadi ?? '').trim()
  const departman = String(body.departman ?? '').trim()
  if (!plaka) return NextResponse.json({ ok: false, error: 'Plaka gerekli' }, { status: 400 })
  if (!kullaniciAd) return NextResponse.json({ ok: false, error: 'Kullanıcı adı soyadı gerekli' }, { status: 400 })
  if (!departman) return NextResponse.json({ ok: false, error: 'Departman gerekli' }, { status: 400 })
  if (!body.firma_id) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  const modulErr = await assertOtoYikamaAktif(admin, body.firma_id); if (modulErr) return modulErr

  const payload = {
    firma_id: body.firma_id,
    proje_id: body.proje_id ?? null,
    plaka,
    marka: body.marka ?? null,
    model: body.model ?? null,
    renk: body.renk ?? null,
    departman,
    periyot_gun: body.periyot_gun ?? 7,
    kullanici_adi_soyadi: kullaniciAd,
    kullanici_telefon: body.kullanici_telefon?.toString().trim() || null,
    kullanici_email: body.kullanici_email?.toString().trim() || null,
    notlar: body.notlar ?? null,
    aktif: body.aktif !== false,
    olusturan_id: auth.me!.id,
  }
  const { data, error } = await admin.from('araclar').insert(payload).select().single()
  if (error) {
    const msg = error.message.includes('duplicate') ? `${plaka} plakası zaten kayıtlı` : error.message
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
  return NextResponse.json({ ok: true, data })
}
