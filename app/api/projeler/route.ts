import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const url = new URL(req.url)
  const firmaId = url.searchParams.get('firma_id') ?? me.firma_id
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'

  const admin = createAdminClient()
  let q = admin
    .from('projeler')
    .select('*')
    .eq('firma_id', firmaId)
    .order('kayit_tarihi', { ascending: true })

  // TA çoklu proje filtre (mig 098): TA sadece izinli olduğu projeleri görür.
  // SA tüm projeleri görür, M/U users.proje_id ile zaten tek projeye bağlı.
  if (isTA) {
    const { data: izinliRows } = await admin
      .from('tenant_admin_projeler')
      .select('proje_id')
      .eq('user_id', me.id)
    const izinliIds = (izinliRows ?? []).map((r: any) => r.proje_id)
    if (izinliIds.length === 0) return NextResponse.json([])
    q = q.in('id', izinliIds)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['tenant_admin', 'super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Yetkisiz rol' }, { status: 403 })
  }

  const body = await req.json()
  const { ad, aciklama, renk, firma_id } = body

  if (!ad?.trim()) return NextResponse.json({ error: 'Proje adı zorunlu' }, { status: 400 })

  const targetFirmaId = firma_id ?? me.firma_id
  if (!targetFirmaId) return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('projeler')
    .insert({
      firma_id: targetFirmaId,
      ad: ad.trim(),
      aciklama: aciklama?.trim() || null,
      renk: renk || '#374151',
      kayit_yapan_id: user.id,
      personel_takibi_aktif: body.personel_takibi_aktif === true,
      birim_fiyat_aktif: body.birim_fiyat_aktif === true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
