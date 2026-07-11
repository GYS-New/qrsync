/**
 * GET  /api/sistem-loglari/geri-bildirim
 * PATCH /api/sistem-loglari/geri-bildirim
 *
 * Mobil "Sorun Bildir" kayıtlarını (mobil_geri_bildirim) listeler / durumunu günceller.
 * SA tüm firmaları görebilir; TA sadece kendi firmasını.
 * Mobil tabloya doğrudan anon insert eder — burada yalnızca okuma + durum/cevap güncelleme var.
 *
 * GET query params:
 *   gun       son N gün (1/7/30/90/365, default 30)
 *   durum     yeni|inceleniyor|cozuldu (çoklu, virgülle)
 *   firmaId   SA için firma filtresi
 *   q         free-text arama (mesaj / isim ILIKE)
 *   limit     default 200 (max 1000)
 *
 * PATCH body: { id: uuid, durum?: 'yeni'|'inceleniyor'|'cozuldu', cevap?: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const SELECT_COLS = 'id, olusturuldu, mesaj, kategori, cihaz_id, cihaz_modeli, platform, uygulama_versiyonu, isim, firma_id, ekran, son_hata, network_type, gorsel_url, durum, cevap, detay'

const DURUMLAR = ['yeni', 'inceleniyor', 'cozuldu'] as const

async function yetkiKontrol() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 }) }

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return { error: NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 }) }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return { error: NextResponse.json({ ok: false, error: 'Yetki yetersiz' }, { status: 403 }) }

  return { me, isSA, isTA }
}

export async function GET(req: NextRequest) {
  const yetki = await yetkiKontrol()
  if ('error' in yetki) return yetki.error
  const { me, isSA, isTA } = yetki

  const sp = req.nextUrl.searchParams
  const gun = Math.min(365, Math.max(1, Number(sp.get('gun') ?? 30)))
  const durumRaw = sp.get('durum') ?? ''
  const durumlar = durumRaw ? durumRaw.split(',').map((s: string) => s.trim()).filter((d: string) => (DURUMLAR as readonly string[]).includes(d)) : []
  const firmaIdReq = sp.get('firmaId') || null
  const q = (sp.get('q') ?? '').trim()
  const limit = Math.min(1000, Math.max(1, Number(sp.get('limit') ?? 200)))

  // TA için zorla kendi firma
  const firmaIdEfektif = isTA ? (me.firma_id ?? null) : firmaIdReq

  const admin = createAdminClient()
  const sinir = new Date(Date.now() - gun * 24 * 60 * 60 * 1000).toISOString()

  let query = admin
    .from('mobil_geri_bildirim')
    .select(SELECT_COLS, { count: 'exact' })
    .gte('olusturuldu', sinir)
    .order('olusturuldu', { ascending: false })
    .limit(limit)

  if (durumlar.length > 0) query = query.in('durum', durumlar)
  if (firmaIdEfektif) query = query.eq('firma_id', firmaIdEfektif)
  if (q) {
    const safe = q.replace(/[%,]/g, '')
    query = query.or(`mesaj.ilike.%${safe}%,isim.ilike.%${safe}%`)
  }

  const { data: rows, error, count } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // firmalar JOIN — bellekte
  const firmaIds = [...new Set((rows ?? []).map((r: any) => r.firma_id).filter(Boolean))] as string[]
  const { data: firmalar } = firmaIds.length > 0
    ? await admin.from('firmalar').select('id, firma_adi, ticari_unvan').in('id', firmaIds)
    : { data: [] as any[] }
  const firmaMap = new Map<string, string>(
    (firmalar ?? []).map((f: any) => [f.id, f.firma_adi ?? f.ticari_unvan ?? '—']),
  )

  const data = (rows ?? []).map((r: any) => ({
    ...r,
    firma: r.firma_id ? (firmaMap.get(r.firma_id) ?? null) : null,
  }))

  // Durum bazlı sayılar (rozet için — tarih/durum filtresinden bağımsız, firma scope'lu)
  const sayilar = { yeni: 0, inceleniyor: 0, cozuldu: 0 }
  {
    let sz = admin.from('mobil_geri_bildirim').select('durum').limit(5000)
    if (firmaIdEfektif) sz = sz.eq('firma_id', firmaIdEfektif)
    const { data: szRows } = await sz
    for (const r of szRows ?? []) {
      const d = (r as any).durum as string
      if (d in sayilar) (sayilar as any)[d]++
    }
  }

  return NextResponse.json({ ok: true, data, toplam: count ?? data.length, sayilar })
}

export async function PATCH(req: NextRequest) {
  const yetki = await yetkiKontrol()
  if ('error' in yetki) return yetki.error
  const { me, isTA } = yetki

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 }) }

  const id = typeof body?.id === 'string' ? body.id : null
  const durum = typeof body?.durum === 'string' ? body.durum : null
  const cevap = typeof body?.cevap === 'string' ? body.cevap.trim() : null
  if (!id) return NextResponse.json({ ok: false, error: 'id gerekli' }, { status: 400 })
  if (!durum && cevap === null) return NextResponse.json({ ok: false, error: 'durum veya cevap gerekli' }, { status: 400 })
  if (durum && !(DURUMLAR as readonly string[]).includes(durum)) {
    return NextResponse.json({ ok: false, error: 'Geçersiz durum' }, { status: 400 })
  }

  const admin = createAdminClient()

  // TA sadece kendi firmasının kaydını güncelleyebilir
  if (isTA) {
    const { data: kayit } = await admin.from('mobil_geri_bildirim').select('firma_id').eq('id', id).single()
    if (!kayit || kayit.firma_id !== me.firma_id) {
      return NextResponse.json({ ok: false, error: 'Kayıt bulunamadı' }, { status: 404 })
    }
  }

  const patch: Record<string, any> = {}
  if (durum) patch.durum = durum
  if (cevap !== null) patch.cevap = cevap || null

  const { data: updated, error } = await admin
    .from('mobil_geri_bildirim')
    .update(patch)
    .eq('id', id)
    .select(SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: updated })
}
