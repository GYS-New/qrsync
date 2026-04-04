import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const AYAR_COLS = 'gorev_suresi_hedef_orani,arsiv_mesai_saat,arsiv_musteri_saat,arsiv_spesifik_saat'

/** GET — firma genel ayarlarını oku */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? (req.nextUrl.searchParams.get('firmaId') ?? me.firma_id) : me.firma_id
  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('firmalar').select(AYAR_COLS).eq('id', firmaId).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    gorev_suresi_hedef_orani: data?.gorev_suresi_hedef_orani ?? 10,
    arsiv_mesai_saat:    data?.arsiv_mesai_saat    ?? 24,
    arsiv_musteri_saat:  data?.arsiv_musteri_saat  ?? 24,
    arsiv_spesifik_saat: data?.arsiv_spesifik_saat ?? 48,
  })
}

/** PATCH — firma genel ayarlarını güncelle */
export async function PATCH(req: NextRequest) {
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

  // Güncellenecek alanları topla
  const update: Record<string, any> = {}

  if (body.gorev_suresi_hedef_orani !== undefined) {
    const v = Number(body.gorev_suresi_hedef_orani)
    if (isNaN(v) || v < 0 || v > 100) return NextResponse.json({ error: 'Hedef oranı 0-100 arasında olmalıdır' }, { status: 400 })
    update.gorev_suresi_hedef_orani = v
  }
  if (body.arsiv_mesai_saat !== undefined) {
    const v = Number(body.arsiv_mesai_saat)
    if (isNaN(v) || v < 1 || v > 720) return NextResponse.json({ error: 'Mesai arşiv süresi 1-720 saat arasında olmalıdır' }, { status: 400 })
    update.arsiv_mesai_saat = v
  }
  if (body.arsiv_musteri_saat !== undefined) {
    const v = Number(body.arsiv_musteri_saat)
    if (isNaN(v) || v < 1 || v > 720) return NextResponse.json({ error: 'Müşteri arşiv süresi 1-720 saat arasında olmalıdır' }, { status: 400 })
    update.arsiv_musteri_saat = v
  }
  if (body.arsiv_spesifik_saat !== undefined) {
    const v = Number(body.arsiv_spesifik_saat)
    if (isNaN(v) || v < 1 || v > 720) return NextResponse.json({ error: 'Spesifik arşiv süresi 1-720 saat arasında olmalıdır' }, { status: 400 })
    update.arsiv_spesifik_saat = v
  }

  if (!Object.keys(update).length) return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('firmalar').update(update).eq('id', firmaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, ...update })
}
