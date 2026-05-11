import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildGenelRaporData } from '@/lib/reports/genel-rapor-data'
import { getLokasyonYetki } from '@/lib/yetki/getLokasyonYetki'

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

    // U/M: yetkili üst lokasyon scope filtresi. SA/TA için null (tüm erişim).
    const yetkiliUstLokIds = isTenantViewer ? await getLokasyonYetki(supabase) : null

    // Seçili üst lokasyon yetkili listesinde değilse → boş veri yerine 403
    const seciliUstLok = searchParams.get('ustLokasyonId')
    if (yetkiliUstLokIds && seciliUstLok && !yetkiliUstLokIds.includes(seciliUstLok)) {
      return NextResponse.json({ error: 'Bu lokasyona erişim yetkiniz yok.' }, { status: 403 })
    }

    const data = await buildGenelRaporData({
      firmaId,
      projeId,
      ustLokasyonId:    seciliUstLok,
      altLokasyonId:    searchParams.get('altLokasyonId'),
      altAltLokasyonId: searchParams.get('altAltLokasyonId'),
      raporBaslangic: searchParams.get('raporBaslangic'),
      raporBitis: searchParams.get('raporBitis'),
      raporuAlan: searchParams.get('raporuAlan'),
      yetkiliUstLokIds,
      // Detay tablolar (Tamamlanan / Sapma / Kayıp / Frekans Dışı / Atanan)
      // /api/reports/genel-rapor-detay üzerinden lazy + paginated alınır.
      // Burada sadece özet sayılar + grup metrikleri + grafik verisi döner.
      includeDetails: false,
    })

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Rapor verisi alınamadı.' }, { status: 500 })
  }
}
