import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGenelRaporData } from '@/lib/reports/genel-rapor-data'

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
    if (!isSA && !isTA && !isTenantViewer) return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const firmaId = isSA ? searchParams.get('firmaId') : me.firma_id
    if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli.' }, { status: 400 })
    const projeId = searchParams.get('projeId') || null

    const data = await buildGenelRaporData({
      firmaId,
      projeId,
      ustLokasyonId: searchParams.get('ustLokasyonId'),
      altLokasyonId: searchParams.get('altLokasyonId'),
      raporBaslangic: searchParams.get('raporBaslangic'),
      raporBitis: searchParams.get('raporBitis'),
      raporuAlan: searchParams.get('raporuAlan'),
    })

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Rapor verisi alınamadı.' }, { status: 500 })
  }
}
