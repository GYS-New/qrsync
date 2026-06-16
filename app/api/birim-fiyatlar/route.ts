import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

// GET /api/birim-fiyatlar?proje_id=xxx
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const projeId = req.nextUrl.searchParams.get('proje_id')
  if (!projeId) return NextResponse.json({ error: 'proje_id zorunlu' }, { status: 400 })

  const admin = createAdminClient()
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  // Proje sahipliği kontrolü
  const { data: proje } = await admin.from('projeler').select('id,firma_id,birim_fiyat_aktif').eq('id', projeId).single()
  if (!proje) return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 })
  if (!isSA && proje.firma_id !== me.firma_id) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  // Modül izolasyonu: Oto Yıkama lokasyonları/grupları GYS UI'da gizli (tüm roller)
  const gizliOtoIds = await getOtoYikamaLokasyonIds(admin as any, proje.firma_id)
  const gizliFilterArg = gizliOtoIds.size > 0 ? `(${[...gizliOtoIds].join(',')})` : null

  let gruplarQ = admin.from('lokasyon_gruplari')
    .select('id,ad,ust_lokasyon_id,aktif')
    .eq('proje_id', projeId)
    .eq('firma_id', proje.firma_id)
    .order('ad')
  if (gizliFilterArg) gruplarQ = (gruplarQ as any).not('ust_lokasyon_id', 'in', gizliFilterArg)

  let lokQ = admin.from('lokasyonlar')
    .select('id,tanim,parent_id,aktif')
    .eq('proje_id', projeId)
    .eq('firma_id', proje.firma_id)
    .order('tanim')
  if (gizliFilterArg) lokQ = (lokQ as any).not('id', 'in', gizliFilterArg)

  const [gruplarRes, lokasyonlarRes, grupUyeleriRes, fiyatlarRes] = await Promise.all([
    gruplarQ,
    lokQ,
    admin.from('lokasyon_grup_uyeleri')
      .select('grup_id,lokasyon_id'),
    admin.from('birim_fiyatlar')
      .select('id,grup_id,lokasyon_id,fiyat,para_birimi')
      .eq('proje_id', projeId),
  ])

  return NextResponse.json({
    ok: true,
    birim_fiyat_aktif: proje.birim_fiyat_aktif,
    gruplar:     gruplarRes.data     ?? [],
    lokasyonlar: lokasyonlarRes.data ?? [],
    grup_uyeleri: grupUyeleriRes.data ?? [],
    fiyatlar:    fiyatlarRes.data    ?? [],
  })
}

// POST /api/birim-fiyatlar — fiyat upsert
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['tenant_admin', 'super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Yetkisiz rol' }, { status: 403 })
  }

  const body = await req.json()
  const { proje_id, grup_id, lokasyon_id, fiyat, para_birimi } = body

  if (!proje_id) return NextResponse.json({ error: 'proje_id zorunlu' }, { status: 400 })
  if (!grup_id && !lokasyon_id) return NextResponse.json({ error: 'grup_id veya lokasyon_id gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  const { data: proje } = await admin.from('projeler').select('firma_id').eq('id', proje_id).single()
  if (!proje) return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 })
  if (!isSA && proje.firma_id !== me.firma_id) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const parsedFiyat = parseFloat(fiyat ?? '0')
  if (isNaN(parsedFiyat) || parsedFiyat < 0) return NextResponse.json({ error: 'Geçersiz fiyat' }, { status: 400 })

  const payload: any = {
    firma_id: proje.firma_id,
    proje_id,
    fiyat: parsedFiyat,
    para_birimi: para_birimi ?? 'TRY',
    olusturan_id: user.id,
    updated_at: new Date().toISOString(),
  }

  if (grup_id) {
    payload.grup_id = grup_id
    payload.lokasyon_id = null
  } else {
    payload.lokasyon_id = lokasyon_id
    payload.grup_id = null
  }

  // Fiyat 0 ise kaydı sil
  if (parsedFiyat === 0) {
    const delQ = grup_id
      ? admin.from('birim_fiyatlar').delete().eq('proje_id', proje_id).eq('grup_id', grup_id)
      : admin.from('birim_fiyatlar').delete().eq('proje_id', proje_id).eq('lokasyon_id', lokasyon_id)
    const { error } = await delQ
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true })
  }

  // Kayıt var mı kontrol et → varsa update, yoksa insert
  const existsQ = grup_id
    ? admin.from('birim_fiyatlar').select('id').eq('proje_id', proje_id).eq('grup_id', grup_id).maybeSingle()
    : admin.from('birim_fiyatlar').select('id').eq('proje_id', proje_id).eq('lokasyon_id', lokasyon_id).maybeSingle()
  const { data: existing } = await existsQ

  let data: any, error: any
  if (existing?.id) {
    ;({ data, error } = await admin.from('birim_fiyatlar').update(payload).eq('id', existing.id).select().single())
  } else {
    ;({ data, error } = await admin.from('birim_fiyatlar').insert(payload).select().single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}
