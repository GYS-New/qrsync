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
    const buildQuery = (slice: string[] | null) => {
      let q = admin
        .from('lokasyonlar')
        .select('id,tanim,parent_id,sureli_gorev_aktif,oto_yikama_lokasyon')
        .eq('aktif', true)
        .order('tanim', { ascending: true })
      if (firmaId) q = q.eq('firma_id', firmaId)
      if (projeId) q = (q as any).eq('proje_id', projeId)
      if (slice) q = q.in('id', slice)
      return q
    }

    // CHUNK-AWARE: musteri rolu tum ust lokasyonlara yetkili olunca
    // yetkiliLokIds binlerce UUID -> URL overflow -> fetch fail. 100'luk slice.
    let data: any[] = []
    if (!yetkiliLokIds || yetkiliLokIds.length === 0) {
      const { data: d, error } = await buildQuery(null)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      data = d ?? []
    } else {
      const seen = new Set<string>()
      for (let i = 0; i < yetkiliLokIds.length; i += 100) {
        const slice = yetkiliLokIds.slice(i, i + 100)
        const { data: d, error } = await buildQuery(slice)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        for (const r of (d ?? [])) {
          if (!seen.has(r.id)) { seen.add(r.id); data.push(r) }
        }
      }
      data.sort((a: any, b: any) => (a.tanim ?? '').localeCompare(b.tanim ?? '', 'tr'))
    }

    // Modül izolasyonu: Oto Yıkama lokasyonları GYS UI'da hiçbir rol için
    // gösterilmez (üst lokasyon dropdown'u dahil). İstisna: kullanıcı yetkilendirme
    // sayfaları (Firma Kullanıcıları, Lokasyon Yetkileri Paneli) — buradan "Oto
    // Yıkama" üst lokasyonuna atama yapılabilmesi gerekir. Bu sayfalar
    // ?includeOtoYikama=1 query param ile çağırır.
    const includeOtoYikama = searchParams.get('includeOtoYikama') === '1'
    let result = data ?? []
    if (firmaId && !includeOtoYikama) {
      const otoIds = await getOtoYikamaLokasyonIds(admin, firmaId)
      if (otoIds.size > 0) result = result.filter((l: any) => !otoIds.has(l.id))
    }

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Lokasyonlar alınamadı.' }, { status: 500 })
  }
}
