import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const VARSAYILAN_VARDIYALAR = [
  { no: 1, baslangic: '00:00', bitis: '08:00' },
  { no: 2, baslangic: '08:00', bitis: '16:00' },
  { no: 3, baslangic: '16:00', bitis: '23:59' },
]

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? (req.nextUrl.searchParams.get('firmaId') ?? me.firma_id) : me.firma_id
  if (!firmaId) return NextResponse.json({ vardiya_sayisi: 3, vardiya_saatleri: VARSAYILAN_VARDIYALAR })

  const admin = createAdminClient()
  const { data: firma } = await admin.from('firmalar').select('vardiya_sayisi,vardiya_saatleri,tum_vardiya_ayarlari').eq('id', firmaId).single()

  return NextResponse.json({
    vardiya_sayisi: firma?.vardiya_sayisi ?? 3,
    vardiya_saatleri: firma?.vardiya_saatleri ?? VARSAYILAN_VARDIYALAR,
    tum_vardiya_ayarlari: (firma as any)?.tum_vardiya_ayarlari ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const firmaId = isSA ? (body.firmaId ?? me.firma_id) : me.firma_id
  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const update: any = {}
  if (body.vardiya_sayisi != null) update.vardiya_sayisi = Math.max(1, Math.min(4, Number(body.vardiya_sayisi)))
  if (body.vardiya_saatleri != null) update.vardiya_saatleri = body.vardiya_saatleri
  if (body.tum_vardiya_ayarlari != null) update.tum_vardiya_ayarlari = body.tum_vardiya_ayarlari

  const { error } = await admin.from('firmalar').update(update).eq('id', firmaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
