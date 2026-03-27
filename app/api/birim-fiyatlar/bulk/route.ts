import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// POST /api/birim-fiyatlar/bulk
// Body: { proje_id, items: [{ grup_id?, lokasyon_id?, fiyat, para_birimi }] }
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['tenant_admin', 'super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Yetkisiz rol' }, { status: 403 })
  }

  const body = await req.json()
  const { proje_id, items } = body
  if (!proje_id || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'proje_id ve items zorunlu' }, { status: 400 })
  }

  const admin = createAdminClient()
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  const { data: proje } = await admin.from('projeler').select('firma_id').eq('id', proje_id).single()
  if (!proje) return NextResponse.json({ error: 'Proje bulunamadı' }, { status: 404 })
  if (!isSA && proje.firma_id !== me.firma_id) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const results = await Promise.all(items.map(async (item: any) => {
    const { grup_id, lokasyon_id, fiyat, para_birimi } = item
    if (!grup_id && !lokasyon_id) return { error: 'grup_id veya lokasyon_id gerekli' }

    const parsedFiyat = parseFloat(fiyat ?? '0')
    if (isNaN(parsedFiyat) || parsedFiyat < 0) return { error: 'Geçersiz fiyat' }

    // Fiyat 0 ise sil
    if (parsedFiyat === 0) {
      const delQ = grup_id
        ? admin.from('birim_fiyatlar').delete().eq('proje_id', proje_id).eq('grup_id', grup_id)
        : admin.from('birim_fiyatlar').delete().eq('proje_id', proje_id).eq('lokasyon_id', lokasyon_id)
      const { error } = await delQ
      if (error) return { error: error.message }
      return { deleted: true, grup_id: grup_id ?? null, lokasyon_id: lokasyon_id ?? null }
    }

    const payload: any = {
      firma_id: proje.firma_id,
      proje_id,
      fiyat: parsedFiyat,
      para_birimi: para_birimi ?? 'TRY',
      olusturan_id: user.id,
      updated_at: new Date().toISOString(),
      grup_id: grup_id ?? null,
      lokasyon_id: lokasyon_id ?? null,
    }

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

    if (error) return { error: error.message }
    return { ok: true, data }
  }))

  return NextResponse.json({ ok: true, results })
}
