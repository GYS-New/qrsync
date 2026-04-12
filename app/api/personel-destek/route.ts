import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * GET  /api/personel-destek?firma_id=...&proje_id=...
 * POST /api/personel-destek  { firma_id, proje_id, ust_lokasyon_id, hedef_oran }
 * PATCH /api/personel-destek { id, hedef_oran?, aktif? }
 * DELETE /api/personel-destek { id }
 */

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const firmaId = p.get('firma_id')
  const projeId = p.get('proje_id')

  if (!firmaId) return NextResponse.json({ data: [] })

  const admin = createAdminClient()
  let q = admin.from('personel_gorev_destegi').select('*').eq('firma_id', firmaId)
  if (projeId) q = q.eq('proje_id', projeId)
  q = q.order('olusturma_tarihi', { ascending: false })

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json()
  const { firma_id, proje_id, ust_lokasyon_id, hedef_oran } = body

  if (!firma_id || !ust_lokasyon_id) {
    return NextResponse.json({ error: 'firma_id ve ust_lokasyon_id zorunlu' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('personel_gorev_destegi').upsert({
    firma_id,
    proje_id: proje_id || null,
    ust_lokasyon_id,
    hedef_oran: hedef_oran ?? 80,
    aktif: false,
    olusturan_id: user.id,
  }, { onConflict: 'firma_id,proje_id,ust_lokasyon_id' }).select('*').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })

  const allowed: any = {}
  if (updates.hedef_oran != null) allowed.hedef_oran = updates.hedef_oran
  if (updates.aktif != null) allowed.aktif = updates.aktif
  allowed.guncelleme_tarihi = new Date().toISOString()

  const admin = createAdminClient()
  const { error } = await admin.from('personel_gorev_destegi').update(allowed).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json()
  const { id } = body
  if (!id) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('personel_gorev_destegi').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
