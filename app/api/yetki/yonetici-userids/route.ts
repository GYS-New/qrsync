import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUstLokasyonYetkiliUserIds } from '@/lib/yetki/getUstLokasyonYetkiliUserIds'

export const dynamic = 'force-dynamic'

/**
 * Üst lokasyona yetkilendirilmiş (yönetici/sorumlu) kullanıcı id'lerini döndürür.
 * Dashboard ve istemci tarafı analizlerde başarı/aktivite filtresi için kullanılır.
 *
 * GET /api/yetki/yonetici-userids?firma_id=...
 *  → { ok: true, ids: ['uuid', ...] }
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? (req.nextUrl.searchParams.get('firma_id') ?? '') : (me.firma_id ?? '')
  if (!firmaId) return NextResponse.json({ ok: true, ids: [] })

  // TA sadece kendi firması
  if (!isSA && firmaId !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz firma' }, { status: 403 })
  }

  const ids = await getUstLokasyonYetkiliUserIds(firmaId)
  return NextResponse.json({ ok: true, ids: [...ids] })
}
