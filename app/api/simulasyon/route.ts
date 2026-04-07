import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function yetkiKontrol(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return null
  if (!['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) return null
  return me
}

// ── GET: firma/proje için simülasyon ayarlarını getir ────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const me = await yetkiKontrol(supabase)
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const p = new URL(req.url).searchParams
  const firmaId = ['super_admin', 'alt_super_admin'].includes(me.rol) ? p.get('firma_id') : me.firma_id
  const projeId = p.get('proje_id')

  if (!firmaId) return NextResponse.json({ ok: true, data: [] })

  const admin = createAdminClient()
  let q = admin.from('simulasyon_ayarlari').select('*').eq('firma_id', firmaId)
  if (projeId) q = (q as any).eq('proje_id', projeId)

  const { data, error } = await q.order('olusturma_tarihi', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, data: data ?? [] })
}

// ── POST: yeni simülasyon ayarı oluştur ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const me = await yetkiKontrol(supabase)
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const { data: { user } } = await supabase.auth.getUser()
  const body = await req.json()
  const { firma_id, proje_id, ust_lokasyon_id, hedef_oran, gorev_suresi_dk } = body

  const firmaId = ['super_admin', 'alt_super_admin'].includes(me.rol) ? (firma_id ?? me.firma_id) : me.firma_id
  if (!firmaId || !ust_lokasyon_id) {
    return NextResponse.json({ ok: false, error: 'firma_id ve ust_lokasyon_id zorunlu' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('simulasyon_ayarlari').insert({
    firma_id: firmaId,
    proje_id: proje_id || null,
    ust_lokasyon_id,
    hedef_oran: hedef_oran ?? 100,
    gorev_suresi_dk: gorev_suresi_dk ?? 10,
    aktif: false,
    olusturan_id: user?.id,
  }).select().single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data })
}

// ── PATCH: simülasyon ayarını güncelle ────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const me = await yetkiKontrol(supabase)
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ ok: false, error: 'id zorunlu' }, { status: 400 })

  const allowed: Record<string, any> = {}
  if (updates.aktif !== undefined) allowed.aktif = updates.aktif
  if (updates.hedef_oran !== undefined) allowed.hedef_oran = updates.hedef_oran
  if (updates.gorev_suresi_dk !== undefined) allowed.gorev_suresi_dk = updates.gorev_suresi_dk
  if (updates.ust_lokasyon_id !== undefined) allowed.ust_lokasyon_id = updates.ust_lokasyon_id
  allowed.guncelleme_tarihi = new Date().toISOString()

  const admin = createAdminClient()
  const { data, error } = await admin.from('simulasyon_ayarlari').update(allowed).eq('id', id).select().single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, data })
}

// ── DELETE: simülasyon ayarını sil ───────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const me = await yetkiKontrol(supabase)
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const p = new URL(req.url).searchParams
  const id = p.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id zorunlu' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('simulasyon_ayarlari').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
