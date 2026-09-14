/**
 * /api/pdks-terminalleri/[id]
 * PATCH { aktif?, ad? } → duzenle / pasiflestir
 * POST  { islem: 'key-yenile' | 'token-iptal' } → terminal_key yenile / terminal_token iptal
 * DELETE → sil
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { terminalKeyUret } from '@/lib/pdks/token'

export const dynamic = 'force-dynamic'

async function yetkiKontrol(supabase: any, admin: any, terminalId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { hata: 'Yetkisiz', status: 401 }
  const { data: me } = await supabase.from('users').select('rol, firma_id').eq('id', user.id).single()
  if (!me) return { hata: 'Kullanici bulunamadi', status: 401 }
  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return { hata: 'Yetki yok', status: 403 }

  const { data: terminal } = await admin.from('pdks_terminalleri').select('id, firma_id').eq('id', terminalId).maybeSingle()
  if (!terminal) return { hata: 'Terminal bulunamadi', status: 404 }
  if (isTA && terminal.firma_id !== me.firma_id) return { hata: 'Bu terminale erisim yok', status: 403 }
  return { terminal }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const admin = createAdminClient()
  const yetki = await yetkiKontrol(supabase, admin, params.id)
  if ('hata' in yetki) return NextResponse.json({ ok: false, error: yetki.hata }, { status: yetki.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Gecersiz JSON' }, { status: 400 }) }

  const guncelle: any = { guncelleme_tarihi: new Date().toISOString() }
  if (typeof body?.aktif === 'boolean') guncelle.aktif = body.aktif
  if (typeof body?.ad === 'string' && body.ad.trim()) guncelle.ad = body.ad.trim()
  // Pasiflestirmede token da iptal edilsin
  if (guncelle.aktif === false) guncelle.terminal_token = null

  const { error } = await admin.from('pdks_terminalleri').update(guncelle).eq('id', params.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const admin = createAdminClient()
  const yetki = await yetkiKontrol(supabase, admin, params.id)
  if ('hata' in yetki) return NextResponse.json({ ok: false, error: yetki.hata }, { status: yetki.status })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Gecersiz JSON' }, { status: 400 }) }

  if (body?.islem === 'key-yenile') {
    let yeniKey = ''
    for (let i = 0; i < 3; i++) {
      const kandidat = terminalKeyUret()
      const { data: mevcut } = await admin.from('pdks_terminalleri').select('id').eq('terminal_key', kandidat).maybeSingle()
      if (!mevcut) { yeniKey = kandidat; break }
    }
    if (!yeniKey) return NextResponse.json({ ok: false, error: 'yeni terminal_key uretilemedi' }, { status: 500 })

    const { error } = await admin.from('pdks_terminalleri').update({
      terminal_key: yeniKey,
      terminal_token: null,  // eski token da iptal
      cihaz_id: null,        // yeniden bind icin
      guncelleme_tarihi: new Date().toISOString(),
    }).eq('id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, terminal_key: yeniKey })
  }

  if (body?.islem === 'token-iptal') {
    const { error } = await admin.from('pdks_terminalleri').update({
      terminal_token: null,
      guncelleme_tarihi: new Date().toISOString(),
    }).eq('id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: false, error: 'Bilinmeyen islem' }, { status: 400 })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const admin = createAdminClient()
  const yetki = await yetkiKontrol(supabase, admin, params.id)
  if ('hata' in yetki) return NextResponse.json({ ok: false, error: yetki.hata }, { status: yetki.status })

  const { error } = await admin.from('pdks_terminalleri').delete().eq('id', params.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
