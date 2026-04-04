import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const FIRMA_COLS = 'gorev_suresi_hedef_orani,arsiv_mesai_saat,arsiv_musteri_saat,arsiv_spesifik_saat,arsiv_frekansiyel_saat'
const PROJE_COLS = 'gorev_suresi_hedef_orani,arsiv_mesai_saat,arsiv_musteri_saat,arsiv_spesifik_saat,arsiv_frekansiyel_saat'

const DEFAULTS = {
  gorev_suresi_hedef_orani: 10,
  arsiv_mesai_saat: 24,
  arsiv_musteri_saat: 24,
  arsiv_spesifik_saat: 48,
  arsiv_frekansiyel_saat: 24,
}

/** GET — firma + proje genel ayarlarını oku */
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
  const { data: firma } = await admin.from('firmalar').select(FIRMA_COLS).eq('id', firmaId).single()

  // Firma default'ları
  const firmaAyar = {
    gorev_suresi_hedef_orani: firma?.gorev_suresi_hedef_orani ?? DEFAULTS.gorev_suresi_hedef_orani,
    arsiv_mesai_saat:         firma?.arsiv_mesai_saat         ?? DEFAULTS.arsiv_mesai_saat,
    arsiv_musteri_saat:       firma?.arsiv_musteri_saat       ?? DEFAULTS.arsiv_musteri_saat,
    arsiv_spesifik_saat:      firma?.arsiv_spesifik_saat      ?? DEFAULTS.arsiv_spesifik_saat,
    arsiv_frekansiyel_saat:   firma?.arsiv_frekansiyel_saat   ?? DEFAULTS.arsiv_frekansiyel_saat,
  }

  // Proje override (null = firma default kullan)
  let projeAyar: Record<string, number | null> | null = null
  if (projeId) {
    const { data: proje } = await admin.from('projeler').select(PROJE_COLS).eq('id', projeId).single()
    if (proje) {
      projeAyar = {
        gorev_suresi_hedef_orani: proje.gorev_suresi_hedef_orani,
        arsiv_mesai_saat:         proje.arsiv_mesai_saat,
        arsiv_musteri_saat:       proje.arsiv_musteri_saat,
        arsiv_spesifik_saat:      proje.arsiv_spesifik_saat,
        arsiv_frekansiyel_saat:   proje.arsiv_frekansiyel_saat,
      }
    }
  }

  // Efektif değerler: proje override > firma default
  const efektif = { ...firmaAyar }
  if (projeAyar) {
    for (const k of Object.keys(efektif) as (keyof typeof efektif)[]) {
      if (projeAyar[k] != null) efektif[k] = projeAyar[k] as number
    }
  }

  return NextResponse.json({ firma: firmaAyar, proje: projeAyar, efektif })
}

/** PATCH — firma veya proje ayarlarını güncelle */
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
  const hedef   = body.hedef ?? 'firma' // 'firma' veya 'proje'
  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })
  if (hedef === 'proje' && !projeId) return NextResponse.json({ error: 'Proje ID gerekli' }, { status: 400 })

  const update: Record<string, any> = {}
  const fields: [string, number, number][] = [
    ['gorev_suresi_hedef_orani', 0, 100],
    ['arsiv_mesai_saat', 1, 720],
    ['arsiv_musteri_saat', 1, 720],
    ['arsiv_spesifik_saat', 1, 720],
    ['arsiv_frekansiyel_saat', 1, 720],
  ]

  for (const [key, min, max] of fields) {
    if (body[key] !== undefined) {
      // proje ayarında null = firma default'a dön
      if (hedef === 'proje' && body[key] === null) {
        update[key] = null
        continue
      }
      const v = Number(body[key])
      if (isNaN(v) || v < min || v > max) return NextResponse.json({ error: `${key}: ${min}-${max} arasında olmalıdır` }, { status: 400 })
      update[key] = v
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
