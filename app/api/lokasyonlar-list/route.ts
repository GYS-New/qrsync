import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

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
    const firmaId = isSA ? requestedFirmaId : me.firma_id

    // U/M lokasyon kısıtlaması
    const yetkiliLokIds = isTenantViewer && firmaId
      ? await getYetkiliLokasyonIds(supabase, firmaId, projeId)
      : null

    const admin = createAdminClient()
    let query = admin
      .from('lokasyonlar')
      .select('id,tanim,parent_id,sureli_gorev_aktif')
      .eq('aktif', true)
      .order('tanim', { ascending: true })

    if (firmaId) query = query.eq('firma_id', firmaId)
    if (projeId) query = (query as any).eq('proje_id', projeId)
    if (yetkiliLokIds) query = query.in('id', yetkiliLokIds)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Oto Yıkama modülü şu an SA-only — TA/U/M için bu lokasyonları JS'de filtrele
    let result = data ?? []
    if (!isSA && firmaId) {
      const otoIds = await getOtoYikamaLokasyonIds(admin, firmaId)
      if (otoIds.size > 0) result = result.filter((l: any) => !otoIds.has(l.id))
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Lokasyonlar alınamadı.' }, { status: 500 })
  }
}
