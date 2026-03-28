import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * DELETE /api/checklist/sablon?id=...
 *
 * Çeklist şablonunu tüm bağımlılıklarıyla birlikte siler (admin client).
 * FK cascade sırası:
 *   1. lokasyonlar.checklist_sablon_id → null
 *   2. checklist_sonuc_maddeleri (sonuc_id FK)
 *   3. checklist_sonuc_basliklari (sablon_id FK)
 *   4. checklist_madde_secenekleri (madde_id FK)
 *   5. checklist_sablon_maddeleri (sablon_id FK)
 *   6. checklist_sablonlari
 */
export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ ok: false, error: 'Yetki yetersiz' }, { status: 403 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id gerekli' }, { status: 400 })

  // Şablonun bu kullanıcının firmasına ait olduğunu doğrula
  const { data: sablon } = await admin.from('checklist_sablonlari').select('firma_id').eq('id', id).single()
  if (!sablon) return NextResponse.json({ ok: false, error: 'Şablon bulunamadı' }, { status: 404 })
  if (!isSA && sablon.firma_id !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Yetki yetersiz' }, { status: 403 })
  }

  // 1. Lokasyonları temizle
  await admin.from('lokasyonlar').update({ checklist_sablon_id: null }).eq('checklist_sablon_id', id)

  // 2. Sonuç kayıtlarını temizle (FK cascade)
  const { data: basliklar } = await admin.from('checklist_sonuc_basliklari').select('id').eq('sablon_id', id)
  const baslikIds = (basliklar ?? []).map((r: any) => r.id)
  if (baslikIds.length) {
    await admin.from('checklist_sonuc_maddeleri').delete().in('sonuc_id', baslikIds)
    await admin.from('checklist_sonuc_basliklari').delete().in('id', baslikIds)
  }

  // 3. Şablon maddelerini temizle
  const { data: maddeler } = await admin.from('checklist_sablon_maddeleri').select('id').eq('sablon_id', id)
  const maddeIds = (maddeler ?? []).map((r: any) => r.id)
  if (maddeIds.length) {
    await admin.from('checklist_madde_secenekleri').delete().in('madde_id', maddeIds)
    await admin.from('checklist_sablon_maddeleri').delete().in('id', maddeIds)
  }

  // 4. Şablonu sil
  const { error } = await admin.from('checklist_sablonlari').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
