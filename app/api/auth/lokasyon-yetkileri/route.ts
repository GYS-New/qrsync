/**
 * GET  /api/auth/lokasyon-yetkileri?user_id=...&firma_id=...
 *   → { ok, yetkili_lokasyonlar: string[] }
 *   Boş dizi = hiç kayıt yok = TÜM lokasyonlara erişebilir
 *
 * POST /api/auth/lokasyon-yetkileri
 *   Body: { user_id, firma_id, ust_lokasyon_idler: string[] }
 *   → Mevcut kayıtları siler, yenilerini yazar (replace all)
 *
 * GET  /api/auth/lokasyon-yetkileri?firma_id=...  (user_id yok)
 *   → Firmadaki TÜM kullanıcı-lokasyon yetki eşleşmelerini döner
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const p = new URL(req.url).searchParams
  const admin = createAdminClient()

  const userId = p.get('user_id')
  const firmaId = ['super_admin', 'alt_super_admin'].includes(me.rol)
    ? (p.get('firma_id') ?? me.firma_id)
    : me.firma_id

  // Tek kullanıcı sorgusu
  if (userId) {
    const { data } = await admin
      .from('kullanici_lokasyon_yetkileri')
      .select('ust_lokasyon_id')
      .eq('user_id', userId)
    return NextResponse.json({
      ok: true,
      yetkili_lokasyonlar: (data ?? []).map((r: any) => r.ust_lokasyon_id),
    })
  }

  // Firma geneli: tüm eşleşmeler
  if (firmaId) {
    const { data } = await admin
      .from('kullanici_lokasyon_yetkileri')
      .select('user_id, ust_lokasyon_id')
      .eq('firma_id', firmaId)
    return NextResponse.json({ ok: true, data: data ?? [] })
  }

  return NextResponse.json({ ok: true, data: [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
  }

  const body = await req.json()
  const { user_id, firma_id, ust_lokasyon_idler } = body

  if (!user_id || !firma_id || !Array.isArray(ust_lokasyon_idler)) {
    return NextResponse.json({ ok: false, error: 'user_id, firma_id ve ust_lokasyon_idler gerekli' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Mevcut kayıtları sil
  await admin.from('kullanici_lokasyon_yetkileri').delete().eq('user_id', user_id)

  // Yeni kayıtları yaz (boş dizi = tüm erişim)
  if (ust_lokasyon_idler.length > 0) {
    const rows = ust_lokasyon_idler.map((lokId: string) => ({
      user_id,
      firma_id,
      ust_lokasyon_id: lokId,
    }))
    const { error } = await admin.from('kullanici_lokasyon_yetkileri').insert(rows)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: ust_lokasyon_idler.length })
}
