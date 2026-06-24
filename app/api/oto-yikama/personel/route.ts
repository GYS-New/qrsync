/**
 * GET /api/oto-yikama/personel?firma_id=X
 *
 * Bir firmanın Oto Yıkama saha personelleri (birincil ataması ARAÇ YIKAMA
 * üst lokasyonu olan kullanıcılar). Görev Kayıtları > Düzenle modalında
 * "İşlemi Yapan" dropdown'unda kullanılır.
 *
 * Sadece birincil saha personeli (ek yetkili TA'lar/cross-functional U'lar
 * burada listelenmez — yıkama operasyon listesi temiz kalsın).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getYikamaSahaPersoneliUserIds } from '@/lib/oto-yikama/yetkililer'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

  const firmaId = req.nextUrl.searchParams.get('firma_id') ?? me.firma_id
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })

  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  if (!isSA && firmaId !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }

  const admin = createAdminClient()
  const userIds = await getYikamaSahaPersoneliUserIds(admin as any, firmaId)
  if (userIds.length === 0) return NextResponse.json({ ok: true, data: [] })

  const { data, error } = await admin
    .from('users')
    .select('id, isim_soyisim, aktif')
    .in('id', userIds)
    .eq('aktif', true)
    .order('isim_soyisim')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, data: data ?? [] })
}
