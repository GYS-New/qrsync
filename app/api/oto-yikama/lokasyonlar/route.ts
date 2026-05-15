/**
 * GET /api/oto-yikama/lokasyonlar?firma_id=...
 *   → Firmaya ait aktif lokasyonları döner; görev oluşturma ekranında lokasyon
 *     dropdown'u için kullanılır. Parent (üst lokasyon) tanımı da gelir ki
 *     UI "OTO YIKAMA > İSTASYON-1" formatında gösterebilsin.
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

  const { data, error } = await admin
    .from('lokasyonlar')
    .select('id, tanim, parent_id, aktif, oto_yikama_lokasyon, ust:parent_id(id, tanim)')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('tanim')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Sadece "oto_yikama_lokasyon=true" işaretli üst lokasyonlar + tüm alt soyları
  const tum = data ?? []
  const yetkili = new Set<string>(
    tum.filter(l => l.parent_id == null && l.oto_yikama_lokasyon).map(l => l.id)
  )
  const queue = [...yetkili]
  while (queue.length) {
    const cur = queue.shift()!
    for (const l of tum) {
      if (l.parent_id === cur && !yetkili.has(l.id)) {
        yetkili.add(l.id)
        queue.push(l.id)
      }
    }
  }

  const filtered = tum.filter(l => yetkili.has(l.id))
  return NextResponse.json({ ok: true, data: filtered })
}
