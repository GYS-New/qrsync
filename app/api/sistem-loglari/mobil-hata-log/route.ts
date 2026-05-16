/**
 * GET /api/sistem-loglari/mobil-hata-log
 *
 * Mobil cihazlardan gelen runtime log/hata kayıtlarını listeler.
 * SA tüm firmaları görebilir; TA sadece kendi firmasını.
 *
 * Query params:
 *   gun         son N gün (1/7/30/90/365, default 30)
 *   seviye      bilgi|uyari|hata|kritik (opsiyonel, virgülle çoklu)
 *   firmaId     SA için firma filtresi
 *   cihazModeli distinct cihaz modeli filtresi
 *   q           free-text arama (mesaj / konum / cihaz_id ILIKE)
 *   limit       default 200 (max 1000)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ ok: false, error: 'Yetki yetersiz' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const gun = Math.min(365, Math.max(1, Number(sp.get('gun') ?? 30)))
  const seviyeRaw = sp.get('seviye') ?? ''
  const seviyeler = seviyeRaw ? seviyeRaw.split(',').map(s => s.trim()).filter(Boolean) : []
  const firmaIdReq = sp.get('firmaId') || null
  const cihazModeli = sp.get('cihazModeli') || null
  const q = (sp.get('q') ?? '').trim()
  const limit = Math.min(1000, Math.max(1, Number(sp.get('limit') ?? 200)))

  // TA için zorla kendi firma
  const firmaIdEfektif = isTA ? (me.firma_id ?? null) : firmaIdReq

  const admin = createAdminClient()
  const sinir = new Date(Date.now() - gun * 24 * 60 * 60 * 1000).toISOString()

  let query = admin
    .from('mobil_hata_log')
    .select('id, olusturuldu, seviye, mesaj, cihaz_id, cihaz_modeli, platform, uygulama_versiyonu, konum, stack, detay, firma_id')
    .gte('olusturuldu', sinir)
    .order('olusturuldu', { ascending: false })
    .limit(limit)

  if (seviyeler.length > 0) query = query.in('seviye', seviyeler)
  if (firmaIdEfektif) query = query.eq('firma_id', firmaIdEfektif)
  if (cihazModeli) query = query.eq('cihaz_modeli', cihazModeli)
  if (q) {
    const safe = q.replace(/[%,]/g, '')
    query = query.or(`mesaj.ilike.%${safe}%,konum.ilike.%${safe}%,cihaz_id.ilike.%${safe}%`)
  }

  const { data: rows, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // device_tokens + firmalar JOIN — bellekte yap (cihaz_id distinct setine göre)
  const cihazIds = [...new Set((rows ?? []).map(r => r.cihaz_id).filter(Boolean))] as string[]
  const firmaIds = [...new Set((rows ?? []).map(r => r.firma_id).filter(Boolean))] as string[]

  const [dtRes, fRes] = await Promise.all([
    cihazIds.length > 0
      ? admin.from('device_tokens').select('device_token, user_id, firma_id').in('device_token', cihazIds)
      : Promise.resolve({ data: [] as any[] }),
    firmaIds.length > 0
      ? admin.from('firmalar').select('id, firma_adi, ticari_unvan').in('id', firmaIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const userIdsFromDt = [...new Set((dtRes.data ?? []).map((d: any) => d.user_id).filter(Boolean))] as string[]
  const userFirmaIds = [...new Set((dtRes.data ?? []).map((d: any) => d.firma_id).filter(Boolean))] as string[]

  const [uRes, f2Res] = await Promise.all([
    userIdsFromDt.length > 0
      ? admin.from('users').select('id, isim_soyisim').in('id', userIdsFromDt)
      : Promise.resolve({ data: [] as any[] }),
    userFirmaIds.length > 0
      ? admin.from('firmalar').select('id, firma_adi, ticari_unvan').in('id', userFirmaIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const dtMap = new Map<string, { user_id: string | null; firma_id: string | null }>(
    (dtRes.data ?? []).map((d: any) => [d.device_token, { user_id: d.user_id ?? null, firma_id: d.firma_id ?? null }]),
  )
  const userMap = new Map<string, string>(
    (uRes.data ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '—']),
  )
  const firmaMap = new Map<string, string>(
    [...(fRes.data ?? []), ...(f2Res.data ?? [])].map((f: any) => [f.id, f.firma_adi ?? f.ticari_unvan ?? '—']),
  )

  const data = (rows ?? []).map((r: any) => {
    const dt = r.cihaz_id ? dtMap.get(r.cihaz_id) : null
    const personelId = dt?.user_id ?? null
    const personel = personelId ? (userMap.get(personelId) ?? null) : null
    const firmaId = r.firma_id ?? dt?.firma_id ?? null
    const firma = firmaId ? (firmaMap.get(firmaId) ?? null) : null
    return {
      ...r,
      personel,
      personel_id: personelId,
      firma,
      firma_id: firmaId,
    }
  })

  // TA için: device_tokens üzerinden farklı firma olabilir → zorla filtre
  const filtered = isTA && me.firma_id
    ? data.filter(d => d.firma_id === me.firma_id)
    : data

  // Cihaz modeli distinct (filtre dropdown için son 90 gün)
  const { data: distinctRaw } = await admin
    .from('mobil_hata_log')
    .select('cihaz_modeli')
    .gte('olusturuldu', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .not('cihaz_modeli', 'is', null)
    .limit(5000)
  const cihazModelleri = [...new Set((distinctRaw ?? []).map((r: any) => r.cihaz_modeli as string).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'tr'))

  return NextResponse.json({ ok: true, data: filtered, cihaz_modelleri: cihazModelleri })
}
