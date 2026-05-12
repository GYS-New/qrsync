import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGenelRaporDetay, type DetayTip } from '@/lib/reports/genel-rapor-detay'
import { getLokasyonYetki } from '@/lib/yetki/getLokasyonYetki'

const VALID_TIPLER: DetayTip[] = ['tamamlanan', 'sapma', 'kayip', 'frekans_disi', 'atanan']

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

    const tip = searchParams.get('tip') as DetayTip | null
    if (!tip || !VALID_TIPLER.includes(tip)) {
      return NextResponse.json({ error: `Geçersiz tip: ${tip}` }, { status: 400 })
    }

    const offset = Math.max(0, parseInt(searchParams.get('offset') ?? '0', 10) || 0)
    const limitRaw = parseInt(searchParams.get('limit') ?? '200', 10) || 200
    const limit = Math.min(Math.max(1, limitRaw), 1000)  // 1..1000

    // U/M: yetkili üst lokasyon scope filtresi. SA/TA için null (tüm erişim).
    const yetkiliUstLokIds = isTenantViewer ? await getLokasyonYetki(supabase) : null
    const seciliUstLok = searchParams.get('ustLokasyonId')
    if (yetkiliUstLokIds && seciliUstLok && !yetkiliUstLokIds.includes(seciliUstLok)) {
      return NextResponse.json({ error: 'Bu lokasyona erişim yetkiniz yok.' }, { status: 403 })
    }

    const data = await buildGenelRaporDetay(
      {
        firmaId,
        projeId: searchParams.get('projeId') || null,
        ustLokasyonId:    seciliUstLok,
        altLokasyonId:    searchParams.get('altLokasyonId'),
        altAltLokasyonId: searchParams.get('altAltLokasyonId'),
        raporBaslangic:   searchParams.get('raporBaslangic'),
        raporBitis:       searchParams.get('raporBitis'),
        vardiya:          (searchParams.get('vardiya') as any) || 'all',
        yetkiliUstLokIds,
      },
      tip,
      offset,
      limit,
    )

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Detay verisi alınamadı.' }, { status: 500 })
  }
}
