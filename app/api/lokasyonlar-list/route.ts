import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı.' }, { status: 401 })

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const isTA = me.rol === 'tenant_admin'
    const isTenantViewer = me.rol === 'musteri' || me.rol === 'tenant_user'

    if (!isSA && !isTA && !isTenantViewer) return NextResponse.json([], { status: 200 })

    const { searchParams } = new URL(request.url)
    const requestedFirmaId = searchParams.get('firmaId')
    const projeId = searchParams.get('projeId') || null
    // SA: query param'dan firma; TA/M/U: kendi firma_id'si
    const firmaId = isSA ? requestedFirmaId : me.firma_id

    const admin = createAdminClient()
    let query = admin
      .from('lokasyonlar')
      .select('id,tanim,parent_id,sureli_gorev_aktif')
      .eq('aktif', true)
      .order('tanim', { ascending: true })

    if (firmaId) query = query.eq('firma_id', firmaId)
    if (projeId) query = (query as any).eq('proje_id', projeId)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(data ?? [])
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Lokasyonlar alınamadı.' }, { status: 500 })
  }
}
