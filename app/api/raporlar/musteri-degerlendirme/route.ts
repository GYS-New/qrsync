import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ ok: false, error: 'Yetki yetersiz' }, { status: 403 })

  const p         = new URL(req.url).searchParams
  const firmaId   = isSA ? p.get('firma_id') : me.firma_id
  const projeId   = p.get('proje_id')
  const baslangic = p.get('baslangic')
  const bitis     = p.get('bitis')

  if (!firmaId) return NextResponse.json({ ok: true, data: [] })
  if (isTA && p.get('firma_id') && p.get('firma_id') !== me.firma_id)
    return NextResponse.json({ ok: false, error: 'Yetkisiz firma' }, { status: 403 })

  let q = admin
    .from('musteri_degerlendirmeleri')
    .select(`
      id, lokasyon_id, kanal, yildiz, yorum, ad_soyad, gorsel_url,
      olusturma_tarihi,
      lokasyonlar ( tanim )
    `)
    .eq('firma_id', firmaId)
    .order('olusturma_tarihi', { ascending: false })

  if (projeId)   q = (q as any).eq('proje_id', projeId)
  if (baslangic) q = (q as any).gte('olusturma_tarihi', baslangic)
  if (bitis)     q = (q as any).lte('olusturma_tarihi', bitis + 'T23:59:59')

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const kayitlar = (data ?? []).map((r: any) => ({
    id:                r.id,
    lokasyon_id:       r.lokasyon_id,
    lokasyon_tanim:    r.lokasyonlar?.tanim ?? '—',
    kanal:             r.kanal,
    yildiz:            r.yildiz,
    yorum:             r.yorum,
    ad_soyad:          r.ad_soyad,
    gorsel_url:        r.gorsel_url,
    olusturma_tarihi:  r.olusturma_tarihi,
  }))

  return NextResponse.json({ ok: true, data: kayitlar })
}
