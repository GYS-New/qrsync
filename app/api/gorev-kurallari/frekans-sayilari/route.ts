/**
 * GET /api/gorev-kurallari/frekans-sayilari?firma_id=...&proje_id=...
 *
 * Tüm aktif görev kurallarını lokasyon × vardiya × tanım gruplamasıyla döner.
 * U/M rolünde getYetkiliLokasyonIds ile filtre uygulanır; SA/TA tümünü görür.
 *
 * Response:
 *   {
 *     ok: true,
 *     vardiya_sayisi: int,
 *     kurallar: [{
 *       id, tanim, lokasyon_id, lokasyon_tanim, ust_lokasyon_id, ust_lokasyon_tanim,
 *       aktif_olma_saati, vardiya_no, frekans_tipi, gunluk_frekans_sayisi,
 *       haftalik_frekans_sayisi, aktif_gunler, sayi
 *     }]
 *   }
 *
 * sayi: gunluk için gunluk_frekans_sayisi, haftalik için haftalik_frekans_sayisi.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

type VardiyaItem = { no: number; baslangic: string; bitis: string }

function parseHHMM(s: string | null | undefined): number | null {
  if (typeof s !== 'string' || !s) return null
  const [hh, mm] = s.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return hh * 60 + mm
}

function vardiyaNoBul(saat: string, ayarlar: VardiyaItem[]): number | null {
  const dk = parseHHMM(saat)
  if (dk == null) return null
  for (const v of ayarlar) {
    const bas = parseHHMM(v.baslangic)
    const bit0 = parseHHMM(v.bitis)
    if (bas == null || bit0 == null) continue
    let bit = bit0
    if (bit === 0 && bas !== 0) bit = 24 * 60
    if (bit <= bas && bit !== 24 * 60) {
      if (dk >= bas || dk < bit0) return v.no
    } else {
      if (dk >= bas && dk < bit) return v.no
    }
  }
  return null
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  const sp = req.nextUrl.searchParams
  const firmaIdReq = sp.get('firma_id')
  const firmaId = isSA ? firmaIdReq : me.firma_id
  if (!firmaId) return NextResponse.json({ ok: true, kurallar: [], vardiya_sayisi: 0 })
  const projeId = sp.get('proje_id') || null

  const admin = createAdminClient()

  // Vardiya ayarları
  const { data: firma } = await admin
    .from('firmalar')
    .select('vardiya_sayisi, tum_vardiya_ayarlari')
    .eq('id', firmaId)
    .single()
  const vs = (firma as any)?.vardiya_sayisi as number | null
  const ayarlar: VardiyaItem[] = vs
    ? ((firma as any)?.tum_vardiya_ayarlari ?? {})?.[String(vs)] ?? []
    : []

  // Yetki filtresi (U/M için)
  const yetkiliLokIds = !isSA && !isTA ? await getYetkiliLokasyonIds(supabase, firmaId, projeId) : null

  // Kuralları çek
  let q = admin
    .from('gorev_kurallari')
    .select(`
      id, tanim, lokasyon_id, aktif_olma_saati, frekans_tipi,
      gunluk_frekans_sayisi, haftalik_frekans_sayisi, aktif_gunler, aktif,
      lokasyon:lokasyon_id (id, tanim, parent_id, ust:parent_id (id, tanim))
    `)
    .eq('firma_id', firmaId)
    .eq('aktif', true)
  if (projeId) q = (q as any).eq('proje_id', projeId)
  if (yetkiliLokIds) q = q.in('lokasyon_id', yetkiliLokIds)

  const { data: rows, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Oto Yıkama modülü şu an SA-only — TA/U/M için bu lokasyonların kurallarını gizle
  const otoIds = !isSA ? await getOtoYikamaLokasyonIds(admin, firmaId) : new Set<string>()

  const kurallar = (rows ?? [])
    .filter((r: any) => !otoIds.has(r.lokasyon_id))
    .map((r: any) => {
    const saat = r.aktif_olma_saati ? String(r.aktif_olma_saati).slice(0, 5) : ''
    const vno = saat ? vardiyaNoBul(saat, ayarlar) : null
    const sayi = r.frekans_tipi === 'haftalik'
      ? (r.haftalik_frekans_sayisi ?? 0)
      : (r.gunluk_frekans_sayisi ?? 0)
    return {
      id: r.id,
      tanim: r.tanim,
      lokasyon_id: r.lokasyon_id,
      lokasyon_tanim: r.lokasyon?.tanim ?? null,
      ust_lokasyon_id: r.lokasyon?.parent_id ?? r.lokasyon_id,
      ust_lokasyon_tanim: r.lokasyon?.ust?.tanim ?? r.lokasyon?.tanim ?? null,
      aktif_olma_saati: saat,
      vardiya_no: vno,
      frekans_tipi: r.frekans_tipi,
      gunluk_frekans_sayisi: r.gunluk_frekans_sayisi,
      haftalik_frekans_sayisi: r.haftalik_frekans_sayisi,
      aktif_gunler: r.aktif_gunler ?? [],
      sayi,
    }
  })

  return NextResponse.json({ ok: true, kurallar, vardiya_sayisi: vs ?? 0 })
}
