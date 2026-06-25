import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const VARSAYILAN_VARDIYALAR = [
  { no: 1, baslangic: '00:00', bitis: '08:00' },
  { no: 2, baslangic: '08:00', bitis: '16:00' },
  { no: 3, baslangic: '16:00', bitis: '23:59' },
]

/**
 * GET /api/sistem-ayarlari/vardiya?firmaId=X&projeId=Y
 *   Vardiya ayarlarını döner. proje_id verilirse proje override > firma fallback.
 *   Response: { firma: {...}, proje: {...}|null, efektif: {...} }
 *
 * PATCH /api/sistem-ayarlari/vardiya
 *   Body: { firmaId?, projeId?, hedef: 'firma'|'proje',
 *           vardiya_sayisi?, vardiya_saatleri?, tum_vardiya_ayarlari? }
 *   hedef='firma' → firmalar tablosuna yazar (eski davranış)
 *   hedef='proje' → projeler tablosuna yazar (yeni — proje override)
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? (req.nextUrl.searchParams.get('firmaId') ?? me.firma_id) : me.firma_id
  const projeId = req.nextUrl.searchParams.get('projeId') || null
  if (!firmaId) return NextResponse.json({
    firma: { vardiya_sayisi: 3, vardiya_saatleri: VARSAYILAN_VARDIYALAR, tum_vardiya_ayarlari: null },
    proje: null,
    efektif: { vardiya_sayisi: 3, vardiya_saatleri: VARSAYILAN_VARDIYALAR, tum_vardiya_ayarlari: null, kaynak: 'firma' },
  })

  const admin = createAdminClient()
  const [firmaRes, projeRes] = await Promise.all([
    admin.from('firmalar').select('vardiya_sayisi,vardiya_saatleri,tum_vardiya_ayarlari').eq('id', firmaId).maybeSingle(),
    projeId
      ? admin.from('projeler').select('vardiya_sayisi,vardiya_saatleri,tum_vardiya_ayarlari').eq('id', projeId).maybeSingle()
      : Promise.resolve({ data: null as any }),
  ])
  const firma = (firmaRes as any).data
  const proje = (projeRes as any).data

  const projeAktif = proje && (
    proje.vardiya_sayisi != null ||
    proje.vardiya_saatleri != null ||
    proje.tum_vardiya_ayarlari != null
  )
  const efektif = {
    vardiya_sayisi: proje?.vardiya_sayisi ?? firma?.vardiya_sayisi ?? 3,
    vardiya_saatleri: proje?.vardiya_saatleri ?? firma?.vardiya_saatleri ?? VARSAYILAN_VARDIYALAR,
    tum_vardiya_ayarlari: proje?.tum_vardiya_ayarlari ?? firma?.tum_vardiya_ayarlari ?? null,
    kaynak: projeAktif ? 'proje' : 'firma' as 'proje' | 'firma',
  }

  return NextResponse.json({
    firma: {
      vardiya_sayisi: firma?.vardiya_sayisi ?? 3,
      vardiya_saatleri: firma?.vardiya_saatleri ?? VARSAYILAN_VARDIYALAR,
      tum_vardiya_ayarlari: firma?.tum_vardiya_ayarlari ?? null,
    },
    proje: proje
      ? {
          vardiya_sayisi: proje.vardiya_sayisi,
          vardiya_saatleri: proje.vardiya_saatleri,
          tum_vardiya_ayarlari: proje.tum_vardiya_ayarlari,
        }
      : null,
    efektif,
    // Geri uyum (eski client'lar): efektif değerleri root'a da koy
    vardiya_sayisi: efektif.vardiya_sayisi,
    vardiya_saatleri: efektif.vardiya_saatleri,
    tum_vardiya_ayarlari: efektif.tum_vardiya_ayarlari,
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const firmaId = isSA ? (body.firmaId ?? me.firma_id) : me.firma_id
  const projeId = body.projeId ?? null
  const hedef = body.hedef === 'proje' ? 'proje' : 'firma'
  if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })
  if (hedef === 'proje' && !projeId) return NextResponse.json({ error: 'Proje override için projeId gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const update: any = {}
  if (body.vardiya_sayisi != null) {
    update.vardiya_sayisi = body.vardiya_sayisi === '__reset__'
      ? null  // proje override kaldır → firma fallback
      : Math.max(1, Math.min(4, Number(body.vardiya_sayisi)))
  }
  if (body.vardiya_saatleri !== undefined) {
    update.vardiya_saatleri = body.vardiya_saatleri === '__reset__' ? null : body.vardiya_saatleri
  }
  if (body.tum_vardiya_ayarlari !== undefined) {
    update.tum_vardiya_ayarlari = body.tum_vardiya_ayarlari === '__reset__' ? null : body.tum_vardiya_ayarlari
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Güncellenecek alan yok' }, { status: 400 })
  }

  const tablo = hedef === 'proje' ? 'projeler' : 'firmalar'
  const id = hedef === 'proje' ? projeId : firmaId
  const { error } = await admin.from(tablo).update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, hedef })
}
