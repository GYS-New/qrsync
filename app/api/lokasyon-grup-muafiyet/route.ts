/**
 * /api/lokasyon-grup-muafiyet
 *
 * DETAY matrisinde bir grup adinin bir ust lokasyonda "kasten olmadigi"
 * (muaf) isaretlenmesi. SA/TA yetkili. GRUPLAR sekmesindeki normal ekleme/
 * silme icin degil — sadece muaflik iceriyor.
 *
 * GET  ?firma_id=&proje_id?  → { data: [{id, ust_lokasyon_id, grup_adi}...] }
 * POST body: { firma_id, proje_id?, ust_lokasyon_id, grup_adi }
 *   Duplicate ise 200 no-op (idempotent).
 * DELETE body: { firma_id, proje_id?, ust_lokasyon_id, grup_adi }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function auth(): Promise<{ user: { id: string }; me: { rol: string; firma_id: string | null } } | { error: string; status: number }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Yetkisiz', status: 401 }
  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return { error: 'Kullanici bulunamadi', status: 401 }
  if (!['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
    return { error: 'Bu islem icin yetkiniz yok', status: 403 }
  }
  return { user: { id: user.id }, me: me as any }
}

function normGrup(s: string): string {
  return String(s ?? '').trim().toLocaleUpperCase('tr')
}

export async function GET(req: NextRequest) {
  const a = await auth()
  if ('error' in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status })

  const url = new URL(req.url)
  const firmaId = url.searchParams.get('firma_id') || undefined
  const projeId = url.searchParams.get('proje_id') || undefined
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })

  const isSA = ['super_admin', 'alt_super_admin'].includes(a.me.rol)
  if (!isSA && firmaId !== a.me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erisim yok' }, { status: 403 })
  }

  const admin = createAdminClient()
  let q = admin.from('lokasyon_grup_muafiyetleri')
    .select('id, ust_lokasyon_id, grup_adi, proje_id')
    .eq('firma_id', firmaId)
  q = projeId ? q.eq('proje_id', projeId) : q.is('proje_id', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const a = await auth()
  if ('error' in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status })

  const body = await req.json().catch(() => ({}))
  const firmaId = String(body.firma_id ?? '')
  const projeId = body.proje_id ? String(body.proje_id) : null
  const ustLokId = String(body.ust_lokasyon_id ?? '')
  const grupAdi = normGrup(body.grup_adi)

  if (!firmaId || !ustLokId || !grupAdi) {
    return NextResponse.json({ ok: false, error: 'firma_id, ust_lokasyon_id, grup_adi gerekli' }, { status: 400 })
  }

  const isSA = ['super_admin', 'alt_super_admin'].includes(a.me.rol)
  if (!isSA && firmaId !== a.me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erisim yok' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('lokasyon_grup_muafiyetleri')
    .insert({
      firma_id: firmaId,
      proje_id: projeId,
      ust_lokasyon_id: ustLokId,
      grup_adi: grupAdi,
      olusturan_id: a.user.id,
    })
    .select('id')
    .maybeSingle()

  // Idempotent: kayit zaten varsa (unique_violation 23505) OK don.
  // Not: onConflict/upsert kullanilamiyor cunku UNIQUE INDEX expression'li
  // (COALESCE(proje_id, ...)) ve PostgreSQL ON CONFLICT sadece gercek
  // UNIQUE CONSTRAINT ile calisir.
  if (error) {
    if ((error as any).code === '23505') return NextResponse.json({ ok: true, id: null, mesaj: 'zaten muaf' })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: (data as any)?.id ?? null })
}

export async function DELETE(req: NextRequest) {
  const a = await auth()
  if ('error' in a) return NextResponse.json({ ok: false, error: a.error }, { status: a.status })

  const body = await req.json().catch(() => ({}))
  const firmaId = String(body.firma_id ?? '')
  const projeId = body.proje_id ? String(body.proje_id) : null
  const ustLokId = String(body.ust_lokasyon_id ?? '')
  const grupAdi = normGrup(body.grup_adi)

  if (!firmaId || !ustLokId || !grupAdi) {
    return NextResponse.json({ ok: false, error: 'firma_id, ust_lokasyon_id, grup_adi gerekli' }, { status: 400 })
  }

  const isSA = ['super_admin', 'alt_super_admin'].includes(a.me.rol)
  if (!isSA && firmaId !== a.me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erisim yok' }, { status: 403 })
  }

  const admin = createAdminClient()
  let q = admin.from('lokasyon_grup_muafiyetleri').delete()
    .eq('firma_id', firmaId)
    .eq('ust_lokasyon_id', ustLokId)
    .eq('grup_adi', grupAdi)
  q = projeId ? q.eq('proje_id', projeId) : q.is('proje_id', null)

  const { error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
