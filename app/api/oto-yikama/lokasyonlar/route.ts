/**
 * GET /api/oto-yikama/lokasyonlar?firma_id=...
 *   → Firmaya ait aktif lokasyonları döner; istasyon olarak işaretlenecek
 *     lokasyon dropdown'u için kullanılır. Hâlihazırda yıkama istasyonu olan
 *     lokasyonlar `is_istasyon: true` flag'iyle işaretlenir (UI'da disabled veya
 *     vurgulu gösterilebilir).
 *
 * SA-only + oto_yikama_aktif=true.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const firmaId = sp.get('firma_id')
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const modul = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!modul) {
    return NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 })
  }

  const [lokQ, istQ] = await Promise.all([
    admin
      .from('lokasyonlar')
      .select('id, tanim, parent_id, aktif')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .order('tanim'),
    admin
      .from('yikama_istasyonlari')
      .select('lokasyon_id')
      .eq('firma_id', firmaId),
  ])

  if (lokQ.error) return NextResponse.json({ ok: false, error: lokQ.error.message }, { status: 500 })

  const istasyonLokIds = new Set((istQ.data ?? []).map((r: any) => r.lokasyon_id))
  const data = (lokQ.data ?? []).map((l: any) => ({
    ...l,
    is_istasyon: istasyonLokIds.has(l.id),
  }))
  return NextResponse.json({ ok: true, data })
}
