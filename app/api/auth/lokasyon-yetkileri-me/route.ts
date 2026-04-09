/**
 * GET /api/auth/lokasyon-yetkileri-me
 * Mevcut oturumdaki kullanıcının yetkili üst lokasyon listesini döner.
 * SA/TA: boş dizi (tüm erişim)
 * U/M: kullanici_lokasyon_yetkileri tablosundan
 * Kayıt yoksa: boş dizi (tüm erişim — geriye dönük uyumluluk)
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 403 })

  // SA/TA tüm lokasyonlara erişebilir
  if (['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: true, yetkili_lokasyonlar: [] })
  }

  // U/M — yetki tablosundan çek
  const admin = createAdminClient()
  const { data } = await admin
    .from('kullanici_lokasyon_yetkileri')
    .select('ust_lokasyon_id')
    .eq('user_id', user.id)

  // Kayıt yoksa = tüm erişim (geriye dönük uyumluluk)
  return NextResponse.json({
    ok: true,
    yetkili_lokasyonlar: (data ?? []).map((r: any) => r.ust_lokasyon_id),
  })
}
