import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const SEL = 'gorev_suresi_hedef_orani,arsiv_mesai_saat,arsiv_musteri_saat,arsiv_spesifik_saat,arsiv_frekansiyel_saat,spesifik_ceklist_aktif,spesifik_personel_atama_aktif,frekansiyel_personel_atama_aktif,ardisik_baslatma_suresi_dk,personel_takip_bildirim_dk'

const DEFAULTS: Record<string, number | boolean> = {
  gorev_suresi_hedef_orani: 10,
  arsiv_mesai_saat: 24, arsiv_musteri_saat: 24, arsiv_spesifik_saat: 48, arsiv_frekansiyel_saat: 24,
  spesifik_ceklist_aktif: true, spesifik_personel_atama_aktif: true, frekansiyel_personel_atama_aktif: true,
  ardisik_baslatma_suresi_dk: 0,
  personel_takip_bildirim_dk: 0,
}

const NUM_FIELDS: [string, number, number][] = [
  ['gorev_suresi_hedef_orani', 0, 100],
  ['arsiv_mesai_saat', 1, 720], ['arsiv_musteri_saat', 1, 720],
  ['arsiv_spesifik_saat', 1, 720], ['arsiv_frekansiyel_saat', 1, 720],
  ['ardisik_baslatma_suresi_dk', 0, 1440],
  ['personel_takip_bildirim_dk', 0, 1440],
]
const BOOL_FIELDS = ['spesifik_ceklist_aktif', 'spesifik_personel_atama_aktif', 'frekansiyel_personel_atama_aktif']

function buildAyar(row: any): Record<string, number | boolean> {
  const r: Record<string, number | boolean> = {}
  for (const [k, def] of Object.entries(DEFAULTS)) r[k] = row?.[k] ?? def
  return r
}

function buildProjeOverrides(row: any): Record<string, number | boolean | null> {
  const r: Record<string, number | boolean | null> = {}
  for (const k of Object.keys(DEFAULTS)) r[k] = row?.[k] ?? null
  return r
}

/** GET */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? (req.nextUrl.searchParams.get('firmaId') ?? me.firma_id) : me.firma_id
  const projeId = req.nextUrl.searchParams.get('projeId') ?? null
  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const { data: firmaRow } = await admin.from('firmalar').select(SEL).eq('id', firmaId).single()
  const firmaAyar = buildAyar(firmaRow)

  let projeAyar: Record<string, number | boolean | null> | null = null
  if (projeId) {
    const { data: projeRow } = await admin.from('projeler').select(SEL).eq('id', projeId).single()
    if (projeRow) projeAyar = buildProjeOverrides(projeRow)
  }

  // Efektif: proje override > firma
  const efektif = { ...firmaAyar }
  if (projeAyar) {
    for (const k of Object.keys(efektif)) {
      if (projeAyar[k] != null) efektif[k] = projeAyar[k] as number | boolean
    }
  }

  return NextResponse.json({ firma: firmaAyar, proje: projeAyar, efektif })
}

/** PATCH */
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? (body.firmaId ?? me.firma_id) : me.firma_id
  const projeId = body.projeId ?? null
  const hedef   = body.hedef ?? 'firma'
  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })
  if (hedef === 'proje' && !projeId) return NextResponse.json({ error: 'Proje ID gerekli' }, { status: 400 })

  const update: Record<string, any> = {}

  // Sayısal alanlar
  for (const [key, min, max] of NUM_FIELDS) {
    if (body[key] !== undefined) {
      if (hedef === 'proje' && body[key] === null) { update[key] = null; continue }
      const v = Number(body[key])
      if (isNaN(v) || v < min || v > max) return NextResponse.json({ error: `${key}: ${min}-${max} arasında olmalıdır` }, { status: 400 })
      update[key] = v
    }
  }

  // Boolean alanlar
  for (const key of BOOL_FIELDS) {
    if (body[key] !== undefined) {
      if (hedef === 'proje' && body[key] === null) { update[key] = null; continue }
      update[key] = !!body[key]
    }
  }

  if (!Object.keys(update).length) return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 })

  const admin = createAdminClient()
  const table = hedef === 'proje' ? 'projeler' : 'firmalar'
  const id    = hedef === 'proje' ? projeId : firmaId
  const { error } = await admin.from(table).update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, hedef, ...update })
}
