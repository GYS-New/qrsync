import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/tasks/arsiv-listesi
 * gorevler_arsiv tablosundan admin client ile veri çeker (RLS bypass).
 * Params: firmaId, projeId?, durum?, lokasyonId?, atananId?,
 *         olusFrom?, olusTo?, islemFrom?, islemTo?
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ ok: false, error: 'Yetki yetersiz' }, { status: 403 })

  const p           = new URL(req.url).searchParams
  const firmaId     = isSA ? p.get('firmaId') : me.firma_id
  const projeId     = p.get('projeId')     ?? null
  const durum       = p.get('durum')       ?? null
  const lokasyonId  = p.get('lokasyonId')  ?? null
  const atananId    = p.get('atananId')    ?? null
  const olusFrom    = p.get('olusFrom')    ?? null
  const olusTo      = p.get('olusTo')      ?? null
  const islemFrom   = p.get('islemFrom')   ?? null
  const islemTo     = p.get('islemTo')     ?? null

  if (!firmaId) return NextResponse.json({ ok: true, data: [] })

  let q = admin
    .from('gorevler_arsiv')
    .select('*')
    .eq('firma_id', firmaId)
    .order('olusturma_tarihi', { ascending: false })
    .limit(500)

  if (projeId)    q = (q as any).eq('proje_id', projeId)
  if (durum)      q = (q as any).eq('durum', durum)
  if (lokasyonId) q = (q as any).eq('lokasyon_id', lokasyonId)
  if (atananId)   q = (q as any).eq('atanan_kullanici_id', atananId)
  if (olusFrom)   q = (q as any).gte('olusturma_tarihi', olusFrom)
  if (olusTo)     q = (q as any).lte('olusturma_tarihi', olusTo + 'T23:59:59')
  if (islemFrom)  q = (q as any).gte('durum_degisim_tarihi', islemFrom)
  if (islemTo)    q = (q as any).lte('durum_degisim_tarihi', islemTo + 'T23:59:59')

  const { data, error } = await q
  if (error) {
    console.error('[arsiv-listesi]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data: data ?? [] })
}
