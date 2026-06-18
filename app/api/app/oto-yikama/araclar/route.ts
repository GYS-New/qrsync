/**
 * GET /api/app/oto-yikama/araclar
 *
 * Mobil yıkama personeli için zenginleştirilmiş araç listesi.
 * Offline cache için tüm aktif araçlar tek istekte gelir.
 *
 * Headers:
 *   X-Device-Token: <cihaz tokeni>
 *
 * Yetki:
 *   - Kullanıcı aktif olmalı
 *   - kullanici_lokasyon_yetkileri'nde oto_yikama_lokasyon=true bir üst lokasyona
 *     bağlı olmalı (yıkama personeli kontrolü)
 *
 * Response:
 *   {
 *     ok: true,
 *     araclar: [{
 *       id, plaka, marka, model, renk, departman, kullanici_adi_soyadi,
 *       yikama_gunleri: [1,3,5],          // 1=Pzt..7=Paz
 *       son_yikama_tarihi: "YYYY-MM-DD" | null,
 *       son_yikama_km: int | null,
 *       bugun_yikandi: boolean,
 *       yikama_gerekli_mi: boolean,        // bugün yikama_gunleri içinde mi
 *     }]
 *   }
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getUserOtoYikamaUstIds } from '@/lib/oto-yikama/getUserOtoYikamaUstIds'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

function bugunTRDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

function bugunTRGunNo(): number {
  // 1=Pzt..7=Paz
  const tr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }))
  const js = tr.getDay() // 0=Paz..6=Cmt
  return js === 0 ? 7 : js
}

export async function GET(req: Request) {
  try {
    const admin = createAdminClient()
    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401, headers: CORS })
    }

    const { data: tok } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, aktif')
      .eq('device_token', deviceToken)
      .single()
    if (!tok || !tok.aktif) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
    }

    const { data: userData } = await admin.from('users').select('aktif').eq('id', tok.user_id).single()
    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF' },
        { status: 403, headers: CORS },
      )
    }

    // Yıkama personeli kontrolü — users.ust_lokasyon_id OR kullanici_lokasyon_yetkileri
    const yetkiliUstIds = await getUserOtoYikamaUstIds(admin, tok.user_id, tok.firma_id)
    if (yetkiliUstIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Oto Yıkama lokasyonuna yetkili değilsiniz', code: 'OTO_YIKAMA_YETKISI_YOK' },
        { status: 403, headers: CORS },
      )
    }

    // Firma araçları (aktif)
    const { data: araclar } = await admin
      .from('araclar')
      .select('id, plaka, marka, model, renk, departman, kullanici_adi_soyadi, yikama_gunleri, son_yikama_tarihi')
      .eq('firma_id', tok.firma_id)
      .eq('aktif', true)
      .order('plaka')

    if (!araclar || araclar.length === 0) {
      return NextResponse.json({ ok: true, araclar: [] }, { headers: CORS })
    }

    const aracIds = araclar.map((a: any) => a.id)
    const today = bugunTRDate()
    const trGun = bugunTRGunNo()

    // Bugün yıkanmış kayıtlar
    const { data: bugunkuMeta } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('arac_id, gorev_id, km')
      .in('arac_id', aracIds)
      .eq('hedef_tarih', today)
    const gorevIds = (bugunkuMeta ?? []).map((m: any) => m.gorev_id)
    let tamamlanmisAracIds = new Set<string>()
    if (gorevIds.length > 0) {
      const { data: tamamlanmis } = await admin
        .from('gorevler').select('id').in('id', gorevIds).eq('durum', 'TAMAMLANDI')
      const tamamlanmisGorevIds = new Set((tamamlanmis ?? []).map((g: any) => g.id))
      for (const m of bugunkuMeta ?? []) {
        if (tamamlanmisGorevIds.has(m.gorev_id)) tamamlanmisAracIds.add(m.arac_id)
      }
    }

    // Son yıkama KM (en yüksek km değeri, arac başına)
    const { data: kmRows } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('arac_id, km, hedef_tarih')
      .in('arac_id', aracIds)
      .not('km', 'is', null)
    const sonKmMap = new Map<string, { km: number; tarih: string }>()
    for (const r of kmRows ?? []) {
      const cur = sonKmMap.get((r as any).arac_id)
      if (!cur || (r as any).hedef_tarih > cur.tarih) {
        sonKmMap.set((r as any).arac_id, { km: (r as any).km, tarih: (r as any).hedef_tarih })
      }
    }

    const result = araclar.map((a: any) => {
      const yikamaGunleri = Array.isArray(a.yikama_gunleri) ? a.yikama_gunleri : []
      return {
        id: a.id,
        plaka: a.plaka,
        marka: a.marka ?? null,
        model: a.model ?? null,
        renk: a.renk ?? null,
        departman: a.departman ?? null,
        kullanici_adi_soyadi: a.kullanici_adi_soyadi ?? null,
        yikama_gunleri: yikamaGunleri,
        son_yikama_tarihi: a.son_yikama_tarihi ?? null,
        son_yikama_km: sonKmMap.get(a.id)?.km ?? null,
        bugun_yikandi: tamamlanmisAracIds.has(a.id),
        yikama_gerekli_mi: yikamaGunleri.includes(trGun) && !tamamlanmisAracIds.has(a.id),
      }
    })

    return NextResponse.json({ ok: true, araclar: result, today, tr_gun: trGun }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
