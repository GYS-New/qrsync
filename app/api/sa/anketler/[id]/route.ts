/**
 * GET   /api/sa/anketler/[id]   — Anket detay + cevaplar + dağılım + network kırılımı
 * PATCH /api/sa/anketler/[id]   — Anket güncelle (durum, son_gecerli)
 * DELETE/api/sa/anketler/[id]   — Anket sil (CASCADE ile cevaplar da gider)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function isSAUser(supabase: ReturnType<typeof createClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, res: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }) }
  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  const isSA = me?.rol === 'super_admin' || me?.rol === 'alt_super_admin'
  if (!isSA) return { ok: false as const, res: NextResponse.json({ error: 'Sadece SA' }, { status: 403 }) }
  return { ok: true as const, userId: user.id }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const auth = await isSAUser(supabase)
  if (!auth.ok) return auth.res
  const id = params.id
  const admin = createAdminClient()

  const { data: anket, error } = await admin
    .from('mobil_anket')
    .select('id,olusturuldu,olusturan_id,baslik,soru,tip,secenekler,hedef_user_ids,hedef_firma_ids,son_gecerli,aciklama_iste,durum')
    .eq('id', id).single()
  if (error || !anket) return NextResponse.json({ error: 'Anket bulunamadı' }, { status: 404 })

  // Hedef user_id seti — direkt user_ids + firma altındaki aktif user'lar
  const userSet = new Set<string>([...((anket as any).hedef_user_ids ?? [])])
  const firmaIds = (anket as any).hedef_firma_ids ?? []
  if (firmaIds.length > 0) {
    const { data: firmaUsers } = await admin.from('users').select('id').in('firma_id', firmaIds).eq('aktif', true)
    for (const u of firmaUsers ?? []) userSet.add((u as any).id)
  }
  const hedefSayisi = userSet.size

  // Cevaplar
  const { data: cevaplar } = await admin
    .from('mobil_anket_cevap')
    .select('id,cevaplandi,user_id,cevap,aciklama,cihaz_id,network_type')
    .eq('anket_id', id)
    .order('cevaplandi', { ascending: false })

  // Cevaplayan user'ların isim/firma'sı + cihaz_id ile device_tokens.son_user_agent
  const userIds = Array.from(new Set((cevaplar ?? []).map((c: any) => c.user_id).filter(Boolean))) as string[]
  const cihazIds = Array.from(new Set((cevaplar ?? []).map((c: any) => c.cihaz_id).filter(Boolean))) as string[]
  const usersMap = new Map<string, { isim: string; firma_adi: string }>()
  const cihazMap = new Map<string, string>()  // device_token → son_user_agent
  if (userIds.length > 0) {
    const { data: us } = await admin
      .from('users')
      .select('id,isim_soyisim,firma_id,firmalar(firma_adi)')
      .in('id', userIds)
    for (const u of us ?? []) {
      usersMap.set((u as any).id, {
        isim: (u as any).isim_soyisim ?? '—',
        firma_adi: (u as any).firmalar?.firma_adi ?? '—',
      })
    }
  }
  if (cihazIds.length > 0) {
    const { data: dts } = await admin
      .from('device_tokens')
      .select('device_token,son_user_agent')
      .in('device_token', cihazIds)
    for (const dt of dts ?? []) cihazMap.set((dt as any).device_token, (dt as any).son_user_agent ?? '')
  }

  const cevaplarFull = (cevaplar ?? []).map((c: any) => {
    const u = usersMap.get(c.user_id)
    return {
      id: c.id,
      cevaplandi: c.cevaplandi,
      user_id: c.user_id,
      isim: u?.isim ?? '—',
      firma_adi: u?.firma_adi ?? '—',
      cevap: c.cevap,
      aciklama: c.aciklama,
      cihaz_id: c.cihaz_id,
      cihaz_modeli: cihazMap.get(c.cihaz_id) ?? '',
      network_type: c.network_type ?? null,
    }
  })

  // Cevap dağılımı
  const cevapDagilim: Record<string, number> = {}
  for (const c of cevaplarFull) {
    cevapDagilim[c.cevap] = (cevapDagilim[c.cevap] ?? 0) + 1
  }

  // Network kırılımı: { network_type: { cevap: adet } }
  const networkKirilimi: Record<string, Record<string, number>> = {}
  for (const c of cevaplarFull) {
    const nt = c.network_type ?? 'bilinmiyor'
    if (!networkKirilimi[nt]) networkKirilimi[nt] = {}
    networkKirilimi[nt][c.cevap] = (networkKirilimi[nt][c.cevap] ?? 0) + 1
  }

  // Cevaplamayanlar (hedef set − cevaplayan set)
  const cevapVerenSet = new Set(cevaplarFull.map(c => c.user_id))
  const eksikIds = [...userSet].filter(uid => !cevapVerenSet.has(uid))
  const eksikUsers: { id: string; isim: string; firma_adi: string }[] = []
  if (eksikIds.length > 0) {
    const { data: us } = await admin
      .from('users')
      .select('id,isim_soyisim,firma_id,firmalar(firma_adi)')
      .in('id', eksikIds)
    for (const u of us ?? []) {
      eksikUsers.push({
        id: (u as any).id,
        isim: (u as any).isim_soyisim ?? '—',
        firma_adi: (u as any).firmalar?.firma_adi ?? '—',
      })
    }
  }

  return NextResponse.json({
    ok: true,
    anket,
    hedef_sayisi: hedefSayisi,
    cevap_sayisi: cevaplarFull.length,
    cevaplar: cevaplarFull,
    cevap_dagilim: cevapDagilim,
    network_kirilimi: networkKirilimi,
    eksik_users: eksikUsers,
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const auth = await isSAUser(supabase)
  if (!auth.ok) return auth.res

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 }) }

  const patch: any = {}
  if (body.durum && ['aktif', 'kapali', 'taslak'].includes(body.durum)) patch.durum = body.durum
  if (body.son_gecerli !== undefined) {
    patch.son_gecerli = body.son_gecerli ? new Date(body.son_gecerli).toISOString() : null
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('mobil_anket').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const auth = await isSAUser(supabase)
  if (!auth.ok) return auth.res
  const admin = createAdminClient()
  const { error } = await admin.from('mobil_anket').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
