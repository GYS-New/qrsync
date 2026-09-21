/**
 * GET /api/lokasyonlar/yetkili?firma_id=...&proje_id=...
 *
 * Kullanicinin yetkili lokasyonlarini doner (yetki filtresi + oto-yikama izolasyonu
 * uygulanmis). Dropdown/filtre bilesenleri icin.
 *
 * - SA/TA: firma+proje bazli tum aktif lokasyonlar
 * - U/M: kullanici_lokasyon_yetkileri tablosuna gore filtreli (ust_lokasyonlar +
 *        onlarin tum alt lokasyonlari)
 * - Oto Yikama lokasyonlari cikarilir (modul izolasyonu)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol, firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanici bulunamadi' }, { status: 401 })

  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  const isTA = me.rol === 'tenant_admin'
  const sp = req.nextUrl.searchParams
  const firmaId = isSA ? sp.get('firma_id') : me.firma_id
  const projeId = sp.get('proje_id') || null

  if (!firmaId) return NextResponse.json({ ok: true, data: [] })

  const admin = createAdminClient()

  // Yetki filtresi (U/M icin) — null ise tum erisim
  const yetkiliIds = !isSA && !isTA ? await getYetkiliLokasyonIds(supabase, firmaId, projeId) : null

  let q = admin
    .from('lokasyonlar')
    .select('id, tanim, parent_id, oto_yikama_lokasyon')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
  if (projeId) q = (q as any).eq('proje_id', projeId)
  if (yetkiliIds) q = q.in('id', yetkiliIds)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Modul izolasyonu: Oto Yikama lokasyonlarini cikar
  const otoIds = await getOtoYikamaLokasyonIds(admin, firmaId)
  const filtreli = (data ?? []).filter((l: any) => !otoIds.has(l.id))

  return NextResponse.json({ ok: true, data: filtreli })
}
