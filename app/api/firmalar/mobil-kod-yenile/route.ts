import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/firmalar/mobil-kod-yenile
 * Body: { firma_id }
 * Firma için yeni mobil giriş kodu üretir. SA tüm firmalara, TA kendi firmasına.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol, firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch { body = {} }
  const firmaId = String(body?.firma_id ?? '')
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })

  // TA sadece kendi firması için yenileyebilir
  if (isTA && me.firma_id !== firmaId) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz firma' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Çakışma olursa 30'a kadar tekrar dene (32^6 alanda pratikte 1 denemede gelir)
  for (let i = 0; i < 30; i++) {
    const { data: newCode, error: rpcErr } = await admin.rpc('generate_mobil_firma_kodu')
    if (rpcErr || !newCode) {
      return NextResponse.json({ ok: false, error: rpcErr?.message ?? 'Kod üretilemedi' }, { status: 500 })
    }
    const { data, error } = await admin
      .from('firmalar')
      .update({ mobil_firma_kodu: newCode })
      .eq('id', firmaId)
      .select('id, mobil_firma_kodu')
      .single()
    if (!error && data) {
      return NextResponse.json({ ok: true, mobil_firma_kodu: data.mobil_firma_kodu })
    }
    // unique violation → tekrar dene
    if (error?.code !== '23505') {
      return NextResponse.json({ ok: false, error: error?.message ?? 'Güncellenemedi' }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: false, error: 'Benzersiz kod üretilemedi, tekrar deneyin' }, { status: 500 })
}
