/**
 * /api/pdks-terminalleri
 * PDKS Terminal Yonetimi (SA/TA) — panel CRUD.
 *
 * GET  ?firma_id=&proje_id=  → listeler
 * POST { firma_id, proje_id, ad } → yeni terminal (terminal_key otomatik uretilir)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { terminalKeyUret } from '@/lib/pdks/token'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol, firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanici bulunamadi' }, { status: 401 })

  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ ok: false, error: 'Yetki yok' }, { status: 403 })

  const p = new URL(req.url).searchParams
  const firmaId = isSA ? (p.get('firma_id') || '') : me.firma_id
  const projeId = p.get('proje_id')
  if (!firmaId) return NextResponse.json({ ok: true, data: [] })

  const admin = createAdminClient()
  let q = admin.from('pdks_terminalleri')
    .select('id, terminal_key, ad, tip, firma_id, proje_id, aktif, cihaz_id, son_gorulme, olusturma_tarihi')
    .eq('firma_id', firmaId)
    .order('olusturma_tarihi', { ascending: false })
  if (projeId) q = q.eq('proje_id', projeId)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Proje adlarini ekle
  const projeIds = [...new Set((data ?? []).map(t => t.proje_id).filter(Boolean))] as string[]
  const { data: projeler } = projeIds.length > 0
    ? await admin.from('projeler').select('id, ad').in('id', projeIds)
    : { data: [] as any[] }
  const projeMap = new Map((projeler ?? []).map((p: any) => [p.id, p.ad]))

  return NextResponse.json({
    ok: true,
    data: (data ?? []).map(t => ({ ...t, proje_adi: projeMap.get(t.proje_id) ?? '' })),
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol, firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanici bulunamadi' }, { status: 401 })

  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ ok: false, error: 'Yetki yok' }, { status: 403 })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Gecersiz JSON' }, { status: 400 })
  }

  const firmaId = isSA ? body?.firma_id : me.firma_id
  const projeId = body?.proje_id
  const ad = typeof body?.ad === 'string' ? body.ad.trim() : ''
  const tip = ['GIRIS', 'CIKIS', 'TOGGLE'].includes(body?.tip) ? body.tip : 'TOGGLE'
  if (!firmaId || !projeId || !ad) {
    return NextResponse.json({ ok: false, error: 'firma_id, proje_id, ad gerekli' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Terminal key uret — collision durumunda 3 kez dene
  let terminalKey = ''
  for (let i = 0; i < 3; i++) {
    const kandidat = terminalKeyUret()
    const { data: mevcut } = await admin.from('pdks_terminalleri').select('id').eq('terminal_key', kandidat).maybeSingle()
    if (!mevcut) { terminalKey = kandidat; break }
  }
  if (!terminalKey) return NextResponse.json({ ok: false, error: 'terminal_key uretilemedi' }, { status: 500 })

  const { data, error } = await admin.from('pdks_terminalleri').insert({
    terminal_key: terminalKey,
    ad, tip, firma_id: firmaId, proje_id: projeId, aktif: true,
  }).select('id, terminal_key, ad, tip').single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, data })
}
