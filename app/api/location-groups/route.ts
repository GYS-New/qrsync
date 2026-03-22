import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'

async function resolveScope(req: NextRequest) {
  const supabase = createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 }) }

  const { data: me, error: meErr } = await supabase
    .from('users')
    .select('id,rol,firma_id')
    .eq('id', user.id)
    .single()

  if (meErr || !me) return { error: NextResponse.json({ error: 'Kullanıcı doğrulanamadı' }, { status: 403 }) }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return { error: NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 }) }

  const firmaId = isSA ? req.nextUrl.searchParams.get('firmaId') : (me.firma_id ?? null)
  return { admin, me, isSA, isTA, firmaId }
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

export async function GET(req: NextRequest) {
  const scope = await resolveScope(req)
  if ('error' in scope) return scope.error

  const { admin, firmaId } = scope
  if (!firmaId) {
    return NextResponse.json({ ok: true, groups: [], locations: [] })
  }

  const projeId = req.nextUrl.searchParams.get('projeId') ?? null

  const gruplariQ = admin.from('lokasyon_gruplari')
    .select('id,firma_id,ad,aciklama,aktif,kayit_tarihi,guncelleme_tarihi,kayit_yapan_id,ust_lokasyon_id')
    .eq('firma_id', firmaId).order('ad')
  const lokasyonlarQ = admin.from('lokasyonlar')
    .select('id,firma_id,parent_id,tanim,aktif,kayit_tarihi')
    .eq('firma_id', firmaId).order('kayit_tarihi', { ascending: true })

  const [groupsRes, membersRes, locationsRes] = await Promise.all([
    projeId ? (gruplariQ as any).eq('proje_id', projeId) : gruplariQ,
    admin.from('lokasyon_grup_uyeleri').select('id,grup_id,lokasyon_id').order('kayit_tarihi', { ascending: true }),
    projeId ? (lokasyonlarQ as any).eq('proje_id', projeId) : lokasyonlarQ,
  ])

  if (groupsRes.error) return NextResponse.json({ error: groupsRes.error.message }, { status: 500 })
  if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 500 })
  if (locationsRes.error) return NextResponse.json({ error: locationsRes.error.message }, { status: 500 })

  const groupIds = new Set((groupsRes.data ?? []).map((x: any) => x.id))
  const groups = (groupsRes.data ?? []).map((g: any) => ({
    ...g,
    lokasyonIds: (membersRes.data ?? []).filter((m: any) => m.grup_id === g.id).map((m: any) => m.lokasyon_id),
  }))

  return NextResponse.json({
    ok: true,
    groups,
    locations: locationsRes.data ?? [],
    orphanMemberCount: (membersRes.data ?? []).filter((m: any) => !groupIds.has(m.grup_id)).length,
  })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  const isSA = me?.rol === 'super_admin' || me?.rol === 'alt_super_admin'
  const isTA = me?.rol === 'tenant_admin'
  if (!me || (!isSA && !isTA)) return NextResponse.json({ error: 'Yetkisiz işlem' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const firmaId = isSA ? (body?.firmaId ?? null) : (me.firma_id ?? null)
  const ad = String(body?.ad ?? '').trim()
  const aciklama = String(body?.aciklama ?? '').trim()
  const ustLokasyonId = String(body?.ustLokasyonId ?? '').trim()
  const lokasyonIds: string[] = Array.isArray(body?.lokasyonIds) ? Array.from(new Set<string>(body.lokasyonIds.filter(Boolean))) : []
  const projeId = body?.projeId ?? null

  if (!firmaId) return NextResponse.json({ error: 'Firma seçilmelidir' }, { status: 400 })
  if (!ad) return NextResponse.json({ error: 'Grup adı zorunludur' }, { status: 400 })
  if (!ustLokasyonId) return NextResponse.json({ error: 'En üst lokasyon seçilmelidir' }, { status: 400 })

  const { data: locations, error: locationsErr } = await admin
    .from('lokasyonlar')
    .select('id,parent_id,firma_id')
    .eq('firma_id', firmaId)
  if (locationsErr) return NextResponse.json({ error: locationsErr.message }, { status: 500 })

  const topLocation = (locations ?? []).find((x: any) => x.id === ustLokasyonId)
  if (!topLocation) return NextResponse.json({ error: 'Seçilen en üst lokasyon bulunamadı' }, { status: 400 })
  if (topLocation.parent_id) return NextResponse.json({ error: 'Seçilen lokasyon en üst seviyede olmalıdır' }, { status: 400 })

  const allowedIds = collectDescendantIds(ustLokasyonId, locations ?? [])
  const invalidId = lokasyonIds.find((id: string) => !allowedIds.has(id))
  if (invalidId) return NextResponse.json({ error: 'Gruba sadece seçilen en üst lokasyonun alt lokasyonları eklenebilir' }, { status: 400 })

  const { data: inserted, error: insertErr } = await admin
    .from('lokasyon_gruplari')
    .insert({
      firma_id: firmaId,
      ad,
      aciklama: aciklama || null,
      ust_lokasyon_id: ustLokasyonId,
      aktif: true,
      kayit_yapan_id: me.id,
      guncelleme_tarihi: new Date().toISOString(),
      ...(projeId ? { proje_id: projeId } : {}),
    })
    .select('id,firma_id,ad,aciklama,aktif,kayit_tarihi,guncelleme_tarihi,kayit_yapan_id,ust_lokasyon_id')
    .single()

  if (insertErr || !inserted) {
    const msg = insertErr?.message ?? 'Grup kaydedilemedi'
    const isDuplicate = msg.includes('duplicate key') || msg.includes('unique constraint')
    return NextResponse.json({ 
      error: isDuplicate 
        ? `Bu üst lokasyonda "${ad}" adında bir grup zaten mevcut. Farklı bir ad kullanın.`
        : msg 
    }, { status: 500 })
  }

  if (lokasyonIds.length > 0) {
    const { error: memberErr } = await admin.from('lokasyon_grup_uyeleri').insert(
      lokasyonIds.map((lokasyon_id: string) => ({ grup_id: inserted.id, lokasyon_id }))
    )
    if (memberErr) {
      await admin.from('lokasyon_gruplari').delete().eq('id', inserted.id)
      return NextResponse.json({ error: memberErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true, group: { ...inserted, lokasyonIds } })
}
