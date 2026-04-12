import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * POST /api/gorev-kurallari/duraklat-vardiya
 * Tanım grubu bazlı vardiya duraklatma
 * Body: { firmaId, projeId?, tanim, tarihler: string[], vardiyalar: number[] }
 *
 * DELETE /api/gorev-kurallari/duraklat-vardiya
 * Body: { firmaId, projeId?, tanim, tarih, vardiya_no }
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const body = await req.json()
  const { tanim, tarihler, vardiyalar } = body
  const firmaId = body.firmaId ?? me.firma_id
  const projeId = body.projeId ?? null

  if (!tanim || !tarihler?.length || !vardiyalar?.length) {
    return NextResponse.json({ error: 'tanim, tarihler ve vardiyalar zorunlu' }, { status: 400 })
  }

  const admin = createAdminClient()
  const rows = []
  for (const tarih of tarihler) {
    for (const vNo of vardiyalar) {
      rows.push({
        firma_id: firmaId,
        proje_id: projeId,
        tanim,
        tarih,
        vardiya_no: vNo,
        olusturan_id: me.id,
      })
    }
  }

  const { error } = await admin.from('kural_duraklatmalari').upsert(rows, {
    onConflict: 'firma_id,proje_id,tanim,tarih,vardiya_no',
    ignoreDuplicates: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, eklenen: rows.length })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json()
  const { firmaId, projeId, tanim, tarih, vardiya_no } = body

  const admin = createAdminClient()

  if (tarih && vardiya_no != null) {
    // Tek kayıt sil
    let q = admin.from('kural_duraklatmalari').delete()
      .eq('firma_id', firmaId).eq('tanim', tanim).eq('tarih', tarih).eq('vardiya_no', vardiya_no)
    if (projeId) q = q.eq('proje_id', projeId)
    else q = q.is('proje_id', null)
    await q
  } else if (tanim) {
    // Tanım grubunun tüm duraklatmalarını sil
    let q = admin.from('kural_duraklatmalari').delete()
      .eq('firma_id', firmaId).eq('tanim', tanim)
    if (projeId) q = q.eq('proje_id', projeId)
    else q = q.is('proje_id', null)
    await q
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const firmaId = p.get('firmaId')
  const projeId = p.get('projeId') || null
  const tanim = p.get('tanim')

  if (!firmaId) return NextResponse.json({ data: [] })

  const admin = createAdminClient()
  let q = admin.from('kural_duraklatmalari').select('*').eq('firma_id', firmaId).gte('tarih', new Date().toISOString().slice(0, 10))
  if (projeId) q = q.eq('proje_id', projeId)
  if (tanim) q = q.eq('tanim', tanim)
  q = q.order('tarih').order('vardiya_no')

  const { data } = await q
  return NextResponse.json({ data: data ?? [] })
}
