/**
 * POST /api/mesai/manuel-kapat
 * Body: { mesai_id: string }
 *
 * TA/SA acik mesai kaydini manuel kapatir. cikis_saati = simdi,
 * cikis_tipi = 'MANUEL_DUZELTME'. Personel Mesai Takibi sayfasindaki
 * "Kapat" aksiyonu bunu cagirir.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol, firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanici bulunamadi' }, { status: 401 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Gecersiz JSON' }, { status: 400 })
  }

  const mesaiId = body?.mesai_id
  if (!mesaiId) return NextResponse.json({ ok: false, error: 'mesai_id gerekli' }, { status: 400 })

  const admin = createAdminClient()

  const { data: mesai } = await admin
    .from('personel_mesai_kayitlari')
    .select('id, firma_id, cikis_saati')
    .eq('id', mesaiId)
    .maybeSingle()

  if (!mesai) return NextResponse.json({ ok: false, error: 'Kayit bulunamadi' }, { status: 404 })
  if (mesai.cikis_saati) return NextResponse.json({ ok: false, error: 'Kayit zaten kapali' }, { status: 409 })
  if (isTA && mesai.firma_id !== me.firma_id) return NextResponse.json({ ok: false, error: 'Yetkisiz firma' }, { status: 403 })

  const { error } = await admin
    .from('personel_mesai_kayitlari')
    .update({
      cikis_saati: new Date().toISOString(),
      cikis_tipi: 'MANUEL_DUZELTME',
      cikis_onay_token: null,
    })
    .eq('id', mesaiId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
