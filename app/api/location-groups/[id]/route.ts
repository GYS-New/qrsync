import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

async function resolve(req: NextRequest, id: string) {
  const supabase = createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 }) }

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  const isSA = me?.rol === 'super_admin' || me?.rol === 'alt_super_admin'
  const isTA = me?.rol === 'tenant_admin'
  if (!me || (!isSA && !isTA)) return { error: NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 }) }

  const { data: group, error: groupErr } = await admin.from('lokasyon_gruplari').select('id,firma_id').eq('id', id).single()
  if (groupErr || !group) return { error: NextResponse.json({ error: 'Grup bulunamadı' }, { status: 404 }) }
  if (isTA && group.firma_id !== me.firma_id) return { error: NextResponse.json({ error: 'Bu gruba erişim yok' }, { status: 403 }) }

  return { admin, me, group, isSA, isTA }
}

function collectDescendantIds(rootId: string, locations: any[]) {
  const childrenMap = new Map<string, string[]>()
  for (const loc of locations ?? []) {
    if (!loc?.parent_id) continue
    const arr = childrenMap.get(loc.parent_id) ?? []
    arr.push(loc.id)
    childrenMap.set(loc.parent_id, arr)
  }
  const result = new Set<string>()
  const stack = [...(childrenMap.get(rootId) ?? [])]
  while (stack.length) {
    const id = stack.pop() as string
    if (result.has(id)) continue
    result.add(id)
    for (const child of childrenMap.get(id) ?? []) stack.push(child)
  }
  return result
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const scope = await resolve(req, params.id)
  if ('error' in scope) return scope.error

  const body = await req.json().catch(() => null)
  const ad = String(body?.ad ?? '').trim()
  const aciklama = String(body?.aciklama ?? '').trim()
  const ustLokasyonId = String(body?.ustLokasyonId ?? '').trim()
  const lokasyonIds: string[] = Array.isArray(body?.lokasyonIds) ? Array.from(new Set<string>(body.lokasyonIds.filter(Boolean))) : []
  if (!ad) return NextResponse.json({ error: 'Grup adı zorunludur' }, { status: 400 })
  if (!ustLokasyonId) return NextResponse.json({ error: 'En üst lokasyon seçilmelidir' }, { status: 400 })

  const { admin, group } = scope
  const { data: locations, error: locationsErr } = await admin.from('lokasyonlar').select('id,parent_id,firma_id').eq('firma_id', group.firma_id)
  if (locationsErr) return NextResponse.json({ error: locationsErr.message }, { status: 500 })

  const topLocation = (locations ?? []).find((x: any) => x.id === ustLokasyonId)
  if (!topLocation) return NextResponse.json({ error: 'Seçilen en üst lokasyon bulunamadı' }, { status: 400 })
  if (topLocation.parent_id) return NextResponse.json({ error: 'Seçilen lokasyon en üst seviyede olmalıdır' }, { status: 400 })

  const allowedIds = collectDescendantIds(ustLokasyonId, locations ?? [])
  const invalidId = lokasyonIds.find((id: string) => !allowedIds.has(id))
  if (invalidId) return NextResponse.json({ error: 'Gruba sadece seçilen en üst lokasyonun alt lokasyonları eklenebilir' }, { status: 400 })

  const { error: upErr } = await admin
    .from('lokasyon_gruplari')
    .update({ ad, aciklama: aciklama || null, ust_lokasyon_id: ustLokasyonId, guncelleme_tarihi: new Date().toISOString() })
    .eq('id', group.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { error: delErr } = await admin.from('lokasyon_grup_uyeleri').delete().eq('grup_id', group.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (lokasyonIds.length > 0) {
    const { error: insErr } = await admin.from('lokasyon_grup_uyeleri').insert(
      lokasyonIds.map((lokasyon_id: string) => ({ grup_id: group.id, lokasyon_id }))
    )
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const scope = await resolve(req, params.id)
  if ('error' in scope) return scope.error

  const { admin, group } = scope
  const { error: delMemberErr } = await admin.from('lokasyon_grup_uyeleri').delete().eq('grup_id', group.id)
  if (delMemberErr) return NextResponse.json({ error: delMemberErr.message }, { status: 500 })

  const { error: delErr } = await admin.from('lokasyon_gruplari').delete().eq('id', group.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
