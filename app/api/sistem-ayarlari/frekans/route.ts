import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** PATCH — lokasyon(lar)ın günlük frekans sayısını güncelle */
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  // body: { updates: [{ id: string, gunluk_frekans_sayisi?: number, haftalik_frekans_sayisi?: number }], tip?: 'gunluk'|'haftalik' }
  const tip: 'gunluk' | 'haftalik' = body.tip === 'haftalik' ? 'haftalik' : 'gunluk'
  const kolon = tip === 'haftalik' ? 'haftalik_frekans_sayisi' : 'gunluk_frekans_sayisi'
  const maxVal = tip === 'haftalik' ? 20 : 99
  // Hem günlük hem haftalık 0 olabilir; 0 = "bu lokasyonda bu tip görev üretilmesin"
  // (örn. günlük 0 + haftalık 2 → sadece haftalık görev üretilir)
  const minVal = 0

  const updates: { id: string; [k: string]: any }[] = body.updates
  if (!Array.isArray(updates) || updates.length === 0)
    return NextResponse.json({ error: 'Güncellenecek lokasyon yok' }, { status: 400 })

  const admin = createAdminClient()
  let updated = 0

  for (const u of updates) {
    const raw = u[kolon]
    if (raw === null && tip === 'haftalik') {
      const { error } = await admin.from('lokasyonlar').update({ [kolon]: null }).eq('id', u.id)
      if (!error) updated++
      continue
    }
    const val = Number(raw)
    if (isNaN(val) || val < minVal || val > maxVal) continue
    const { error } = await admin.from('lokasyonlar').update({ [kolon]: val }).eq('id', u.id)
    if (!error) updated++
  }

  return NextResponse.json({ ok: true, updated, tip })
}
