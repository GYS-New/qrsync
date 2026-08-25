import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET — üst lokasyon bazlı bildirim alıcılarını listele */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const firmaId = p.get('firmaId')
  const projeId = p.get('projeId') ?? null
  if (!firmaId) return NextResponse.json({ error: 'firmaId gerekli' }, { status: 400 })

  const admin = createAdminClient()
  let q = admin.from('personel_takip_alicilar').select('*').eq('firma_id', firmaId)
  if (projeId) q = (q as any).eq('proje_id', projeId)
  const { data } = await q

  return NextResponse.json(data ?? [])
}

/** POST — alıcı ekle/güncelle (üst lokasyon bazlı VEYA proje geneli)
 *
 * ust_lokasyon_id NULL → proje geneli: bu proje'nin tum personeli icin uygulanir.
 * Personelleri sabit ust_lokasyon'a atanmayan projeler (ornek: Canakkale) icin
 * kullanilir. Uygulama: cron 3. bildirimde ust_lokasyon-based + proje-geneli
 * alicilari birlestirir. */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const { firmaId, projeId, ust_lokasyon_id, alici_user_ids } = body
  if (!firmaId) return NextResponse.json({ error: 'firmaId gerekli' }, { status: 400 })

  const ustLokId = ust_lokasyon_id ?? null  // NULL = proje geneli
  const admin = createAdminClient()

  // Mevcut eslestirmeleri sil (ust_lokasyon_id NULL veya belli olsun)
  let delQ = admin.from('personel_takip_alicilar').delete().eq('firma_id', firmaId)
  delQ = ustLokId ? (delQ as any).eq('ust_lokasyon_id', ustLokId) : (delQ as any).is('ust_lokasyon_id', null)
  if (projeId) delQ = (delQ as any).eq('proje_id', projeId)
  else delQ = (delQ as any).is('proje_id', null)
  await delQ

  // Yenilerini ekle
  const ids = Array.isArray(alici_user_ids) ? alici_user_ids.filter(Boolean) : []
  if (ids.length > 0) {
    const rows = ids.map((uid: string) => ({
      firma_id: firmaId,
      proje_id: projeId ?? null,
      ust_lokasyon_id: ustLokId,
      alici_user_id: uid,
    }))
    const { error } = await admin.from('personel_takip_alicilar').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: ids.length })
}
