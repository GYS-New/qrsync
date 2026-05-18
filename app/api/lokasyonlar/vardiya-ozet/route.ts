/**
 * GET /api/lokasyonlar/vardiya-ozet?firma_id=...&proje_id=...
 *
 * Her lokasyon için bugün (TR) aktif olan vardiyalardaki kural-tabanlı
 * görev sayılarını döner — durum kategorisine göre ayrılmış.
 *
 * SA/TA/U → kendi firma scope'unda.
 *
 * Response:
 *   {
 *     ok: true,
 *     ozet: {
 *       "<lokasyon_id>": {
 *         "1": { tamamlandi, islemde, acik },
 *         "2": { ... },
 *         "3": { ... }
 *       }
 *     }
 *   }
 *
 * Durum kategorileri:
 *   tamamlandi → TAMAMLANDI
 *   islemde    → ISLEMDE
 *   acik       → ACIK + BEKLEMEDE (henüz yapılmamış, devam eden)
 *   (ZAMANINDA_YAPILAMAYAN, IPTAL, SILINDI dahil edilmez)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

type VardiyaItem = { no: number; baslangic: string; bitis: string }

function parseHHMM(s: string | null | undefined): number | null {
  if (typeof s !== 'string' || !s) return null
  const [hh, mm] = s.split(':').map(Number)
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return hh * 60 + mm
}

function bugunTRDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

/** ISO timestamp'in TR günündeki dakikasını döner (0-1439) */
function trDakika(iso: string): number {
  const d = new Date(iso)
  const trStr = d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false })
  const [h, m] = trStr.split(':').map(Number)
  return h * 60 + m
}

/** Verilen dakika hangi vardiya numarasına düşer? */
function vardiyaNoBul(dakika: number, ayarlar: VardiyaItem[]): number | null {
  for (const v of ayarlar) {
    const bas = parseHHMM(v.baslangic)
    const bit0 = parseHHMM(v.bitis)
    if (bas == null || bit0 == null) continue
    let bit = bit0
    if (bit === 0 && bas !== 0) bit = 24 * 60
    // Sarkan vardiya
    if (bit <= bas && bit !== 24 * 60) {
      // bas..24:00 veya 00:00..bit aralığında mı?
      if (dakika >= bas || dakika < bit0) return v.no
    } else {
      if (dakika >= bas && dakika < bit) return v.no
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
  const sp = req.nextUrl.searchParams
  const firmaIdReq = sp.get('firma_id')
  const firmaId = isSA ? firmaIdReq : me.firma_id
  if (!firmaId) return NextResponse.json({ ok: true, ozet: {} })
  const projeId = sp.get('proje_id') || null

  const admin = createAdminClient()

  // Firma vardiya ayarları
  const { data: firma } = await admin
    .from('firmalar')
    .select('vardiya_sayisi, tum_vardiya_ayarlari')
    .eq('id', firmaId)
    .single()
  const vs = (firma as any)?.vardiya_sayisi as number | null
  const ayarlar: VardiyaItem[] = vs
    ? ((firma as any)?.tum_vardiya_ayarlari ?? {})?.[String(vs)] ?? []
    : []
  if (ayarlar.length === 0) return NextResponse.json({ ok: true, ozet: {} })

  // Bugün TR — UTC aralığı (TR 00:00..ertesi gün 00:00)
  const trBugun = bugunTRDate()
  const baslangicIso = new Date(`${trBugun}T00:00:00+03:00`).toISOString()
  const bitisIso = new Date(`${trBugun}T00:00:00+03:00`)
  bitisIso.setUTCDate(bitisIso.getUTCDate() + 1)

  // Bugünün canlı görevleri (kural-tabanlı)
  let q = admin
    .from('canli_gorevler')
    .select('id, lokasyon_id, durum, aktif_olma_tarihi')
    .eq('firma_id', firmaId)
    .not('kural_id', 'is', null)
    .gte('aktif_olma_tarihi', baslangicIso)
    .lt('aktif_olma_tarihi', bitisIso.toISOString())
  if (projeId) q = (q as any).eq('proje_id', projeId)
  const { data: gorevler } = await q

  // Oto Yıkama modülü şu an SA-only — TA/U/M için bu lokasyonların özetini gizle
  const otoIds = !isSA ? await getOtoYikamaLokasyonIds(admin, firmaId) : new Set<string>()

  type Bucket = { tamamlandi: number; islemde: number; acik: number }
  const ozet: Record<string, Record<number, Bucket>> = {}

  for (const g of (gorevler ?? []) as any[]) {
    if (!g.lokasyon_id || !g.aktif_olma_tarihi) continue
    if (otoIds.has(g.lokasyon_id)) continue
    const dk = trDakika(g.aktif_olma_tarihi)
    const vno = vardiyaNoBul(dk, ayarlar)
    if (vno == null) continue

    if (!ozet[g.lokasyon_id]) ozet[g.lokasyon_id] = {}
    if (!ozet[g.lokasyon_id][vno]) ozet[g.lokasyon_id][vno] = { tamamlandi: 0, islemde: 0, acik: 0 }
    const b = ozet[g.lokasyon_id][vno]
    if (g.durum === 'TAMAMLANDI') b.tamamlandi++
    else if (g.durum === 'ISLEMDE') b.islemde++
    else if (g.durum === 'ACIK' || g.durum === 'BEKLEMEDE') b.acik++
  }

  return NextResponse.json({ ok: true, ozet, tarih: trBugun })
}
