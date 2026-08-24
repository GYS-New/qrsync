/**
 * PATCH /api/users/[id]/bildirim-sustur
 * Body: { susturulmus: boolean }
 *
 * SA veya TA tarafindan cagirilir. Hedef kullanicinin rolu 'tenant_admin'
 * olmalidir — sadece TA icin anlamli (U ve musteri icin ayri yetki modeli var).
 *
 * TRUE: sendFCMToUser FCM'yi atlar (log'a "susturuldu" yazar), KritikUyariModal
 * popup'i acmaz, bildirimler tablosuna kayit yine yazilir (kullanici listede
 * gorur).
 *
 * FALSE: normal davranis.
 *
 * Yetki: SA/alt_SA her firmadaki TA'yi ayarlayabilir; TA sadece kendi firmasindaki
 * TA'lari (kendisi dahil).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanici bulunamadi' }, { status: 401 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Gecersiz JSON' }, { status: 400 })
  }
  const susturulmus = body?.susturulmus === true
  const hedefId = params.id
  if (!hedefId) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })

  const admin = createAdminClient()

  // Hedef kullanicinin bilgilerini oku
  const { data: hedef } = await admin
    .from('users').select('id,rol,firma_id,isim_soyisim').eq('id', hedefId).maybeSingle()
  if (!hedef) return NextResponse.json({ error: 'Hedef kullanici bulunamadi' }, { status: 404 })

  // Sadece TA rolu icin anlamli
  if (hedef.rol !== 'tenant_admin') {
    return NextResponse.json({
      error: 'Bildirim susturma sadece tenant_admin rolu icin kullanilabilir',
      code: 'ROL_UYGUN_DEGIL',
    }, { status: 400 })
  }

  // TA yalnizca kendi firmasindaki TA'lari ayarlayabilir (kendisi dahil)
  if (isTA && !isSA && hedef.firma_id !== me.firma_id) {
    return NextResponse.json({ error: 'Yetkisiz firma' }, { status: 403 })
  }

  const { error } = await admin
    .from('users').update({ bildirim_susturulmus: susturulmus }).eq('id', hedefId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: hedefId, susturulmus })
}
