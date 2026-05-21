/**
 * GET  /api/sa/anketler        — Anket listesi (özet metrikler dahil)
 * POST /api/sa/anketler        — Yeni anket oluştur + opsiyonel push
 *
 * SA-only. Mobil anket sistemi için panel tarafı.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function isSAUser(supabase: ReturnType<typeof createClient>): Promise<{ ok: true; userId: string } | { ok: false; res: NextResponse }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }) }
  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  const isSA = me?.rol === 'super_admin' || me?.rol === 'alt_super_admin'
  if (!isSA) return { ok: false, res: NextResponse.json({ error: 'Sadece SA' }, { status: 403 }) }
  return { ok: true, userId: user.id }
}

// ── GET: liste + özet metrikler ─────────────────────────────────────────────
export async function GET(_req: NextRequest) {
  const supabase = createClient()
  const auth = await isSAUser(supabase)
  if (!auth.ok) return auth.res

  const admin = createAdminClient()

  const { data: anketler, error } = await admin
    .from('mobil_anket')
    .select('id,olusturuldu,baslik,soru,tip,secenekler,hedef_user_ids,hedef_firma_ids,son_gecerli,aciklama_iste,durum')
    .order('olusturuldu', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const anketIds = (anketler ?? []).map((a: any) => a.id)
  // Tek bir sorguda anket başına cevap sayısı
  const cevapSayiMap = new Map<string, number>()
  if (anketIds.length > 0) {
    const { data: cevaplar } = await admin
      .from('mobil_anket_cevap')
      .select('anket_id')
      .in('anket_id', anketIds)
    for (const c of cevaplar ?? []) {
      const k = (c as any).anket_id
      cevapSayiMap.set(k, (cevapSayiMap.get(k) ?? 0) + 1)
    }
  }

  // Hedef sayısını hesapla (hedef_user_ids + hedef_firma_ids için firma personeli)
  // distinct user_id set'i; firma id'leri için tek sorguda topluca çek
  const tumFirmaIds = Array.from(new Set((anketler ?? []).flatMap((a: any) => a.hedef_firma_ids ?? [])))
  const firmaUserMap = new Map<string, Set<string>>()  // firma_id → user_id set
  if (tumFirmaIds.length > 0) {
    const { data: firmaUsers } = await admin
      .from('users')
      .select('id,firma_id')
      .in('firma_id', tumFirmaIds)
      .eq('aktif', true)
    for (const u of firmaUsers ?? []) {
      const fid = (u as any).firma_id as string
      if (!firmaUserMap.has(fid)) firmaUserMap.set(fid, new Set())
      firmaUserMap.get(fid)!.add((u as any).id)
    }
  }

  const items = (anketler ?? []).map((a: any) => {
    const userSet = new Set<string>([...(a.hedef_user_ids ?? [])])
    for (const fid of a.hedef_firma_ids ?? []) {
      const fset = firmaUserMap.get(fid)
      if (fset) for (const uid of fset) userSet.add(uid)
    }
    return {
      ...a,
      hedef_sayisi: userSet.size,
      cevap_sayisi: cevapSayiMap.get(a.id) ?? 0,
    }
  })

  return NextResponse.json({ ok: true, items })
}

// ── POST: oluştur + push ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const auth = await isSAUser(supabase)
  if (!auth.ok) return auth.res

  let body: any
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Geçersiz JSON' }, { status: 400 }) }

  const baslik = String(body.baslik ?? '').trim()
  const soru = String(body.soru ?? '').trim()
  const tip = String(body.tip ?? '')
  const secenekler = Array.isArray(body.secenekler) ? body.secenekler.map((s: any) => String(s).trim()).filter(Boolean) : null
  const aciklama_iste = body.aciklama_iste !== false  // default true
  const son_gecerli = body.son_gecerli ? new Date(body.son_gecerli).toISOString() : null
  const hedef_user_ids = Array.isArray(body.hedef_user_ids) ? body.hedef_user_ids.filter((x: any) => typeof x === 'string') : []
  const hedef_firma_ids = Array.isArray(body.hedef_firma_ids) ? body.hedef_firma_ids.filter((x: any) => typeof x === 'string') : []
  const push_gonder = body.push_gonder !== false  // default true
  const durum = ['aktif', 'taslak'].includes(body.durum) ? body.durum : 'aktif'

  if (!baslik) return NextResponse.json({ error: 'Başlık gerekli' }, { status: 400 })
  if (!soru) return NextResponse.json({ error: 'Soru gerekli' }, { status: 400 })
  if (!['evet_hayir', 'coktan_secmeli', 'kisa_metin'].includes(tip)) {
    return NextResponse.json({ error: 'Geçersiz tip' }, { status: 400 })
  }
  if (tip === 'coktan_secmeli' && (!secenekler || secenekler.length < 2)) {
    return NextResponse.json({ error: 'Çoktan seçmeli için en az 2 seçenek' }, { status: 400 })
  }
  if (hedef_user_ids.length === 0 && hedef_firma_ids.length === 0) {
    return NextResponse.json({ error: 'En az bir hedef seç' }, { status: 400 })
  }

  const admin = createAdminClient()
  const insertObj: any = {
    olusturan_id: auth.userId,
    baslik, soru, tip,
    secenekler: tip === 'coktan_secmeli' ? secenekler : null,
    aciklama_iste, son_gecerli,
    hedef_user_ids, hedef_firma_ids,
    durum,
  }
  const { data: yeni, error } = await admin
    .from('mobil_anket')
    .insert(insertObj)
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Push gönder — sadece durum=aktif ve push_gonder=true ise
  let pushAdet = 0
  if (push_gonder && durum === 'aktif') {
    const aliciSet = new Set<string>(hedef_user_ids)
    if (hedef_firma_ids.length > 0) {
      const { data: firmaUsers } = await admin
        .from('users')
        .select('id')
        .in('firma_id', hedef_firma_ids)
        .eq('aktif', true)
      for (const u of firmaUsers ?? []) aliciSet.add((u as any).id)
    }
    // Fire-and-forget — hata olursa sessizce geç (anket oluşturma başarılı kalmalı)
    const data = { tip: 'anket', anket_id: String((yeni as any).id) }
    Promise.all(
      Array.from(aliciSet).map(uid =>
        sendFCMToUser(uid, 'Yeni Anketiniz Var', baslik, 'default', data).catch(() => {})
      )
    ).catch(() => {})
    pushAdet = aliciSet.size
  }

  return NextResponse.json({ ok: true, anket_id: (yeni as any).id, push_adet: pushAdet })
}
