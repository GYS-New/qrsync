/**
 * GET  /api/oto-yikama/istasyonlar?firma_id=...&aktif=true|false|all
 *      → Firmanın yıkama istasyonlarını lokasyon bilgisiyle birlikte döner.
 *
 * POST /api/oto-yikama/istasyonlar
 *      → Yeni istasyon kaydı. Mevcut bir lokasyonu "istasyon" olarak işaretler.
 *      Body: { firma_id, lokasyon_id, ad, notlar? }
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

async function modulAktifMi(admin: any, firmaId: string) {
  const aktif = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!aktif) {
    return NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 })
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
  const modulErr = await modulAktifMi(admin, firmaId); if (modulErr) return modulErr
  const aktifFilter = sp.get('aktif') ?? 'true'

  let q = admin
    .from('yikama_istasyonlari')
    .select('id, firma_id, lokasyon_id, ad, aktif, notlar, olusturma_tarihi, guncelleme_tarihi, lokasyon:lokasyonlar(id, tanim, parent_id)')
    .eq('firma_id', firmaId)
    .order('ad')
  if (aktifFilter === 'true') q = q.eq('aktif', true)
  else if (aktifFilter === 'false') q = q.eq('aktif', false)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const auth = await sa(supabase); if ('err' in auth) return auth.err
  const admin = createAdminClient()
  const body = await req.json().catch(() => ({}))

  const firmaId = body.firma_id
  const lokasyonId = body.lokasyon_id
  const ad = String(body.ad ?? '').trim()

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!lokasyonId) return NextResponse.json({ ok: false, error: 'lokasyon_id gerekli' }, { status: 400 })
  if (!ad) return NextResponse.json({ ok: false, error: 'ad gerekli' }, { status: 400 })

  const modulErr = await modulAktifMi(admin, firmaId); if (modulErr) return modulErr

  // Lokasyon gerçekten firmaya ait mi?
  const { data: lok } = await admin
    .from('lokasyonlar')
    .select('id, firma_id, tanim')
    .eq('id', lokasyonId)
    .single()
  if (!lok || lok.firma_id !== firmaId) {
    return NextResponse.json({ ok: false, error: 'Lokasyon bu firmaya ait değil' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('yikama_istasyonlari')
    .insert({
      firma_id: firmaId,
      lokasyon_id: lokasyonId,
      ad,
      notlar: body.notlar?.toString().trim() || null,
      aktif: body.aktif !== false,
      olusturan_id: auth.me!.id,
    })
    .select()
    .single()

  if (error) {
    const msg = error.message.includes('duplicate') || error.code === '23505'
      ? `"${lok.tanim}" lokasyonu zaten bir istasyon olarak kayıtlı`
      : error.message
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
  return NextResponse.json({ ok: true, data })
}
