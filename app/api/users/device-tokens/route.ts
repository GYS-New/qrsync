import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// GET /api/users/device-tokens?firma_id=xxx
// Firma bazlı tüm aktif device_token kayıtlarını döner
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaParam = req.nextUrl.searchParams.get('firma_id')
  const firmaId = isSA ? firmaParam : me.firma_id

  if (!firmaId) return NextResponse.json({ ok: true, data: [] })

  // Sadece SA kendi dışındaki firmaları görebilir
  if (!isSA && firmaParam && firmaParam !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('device_tokens')
    .select('user_id, device_token, device_id, aktif, son_kullanim, bildirim_izni, bildirim_izni_son_kontrol')
    .eq('firma_id', firmaId)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // user_id → device_token map
  const map: Record<string, { device_token: string; device_id: string; son_kullanim: string | null; bildirim_izni: boolean | null; bildirim_izni_son_kontrol: string | null }> = {}
  for (const row of data ?? []) {
    if (row.user_id) {
      map[row.user_id] = {
        device_token: row.device_token,
        device_id:    row.device_id,
        son_kullanim: row.son_kullanim,
        bildirim_izni: (row as any).bildirim_izni ?? null,
        bildirim_izni_son_kontrol: (row as any).bildirim_izni_son_kontrol ?? null,
      }
    }
  }

  return NextResponse.json({ ok: true, data: map })
}
