/**
 * GET /api/oto-yikama/gunluk?firma_id=...
 *   → Bugünün (hedef_tarih = today) tüm Oto Yıkama görev kayıtlarını döner.
 *     metadata + gorevler + araclar + lokasyonlar birleştirilir.
 *
 * SA-only + oto_yikama_aktif=true.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'

function todayLocalDate(): string {
  const now = new Date()
  const tz = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - tz).toISOString().slice(0, 10)
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 })
  }

  const firmaId = req.nextUrl.searchParams.get('firma_id')
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })

  const admin = createAdminClient()
  const modul = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!modul) {
    return NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 })
  }

  const today = todayLocalDate()

  // 1) Bugünün metadata kayıtlarını çek
  const { data: metaRows, error: metaErr } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, arac_id, plaka_snapshot, hedef_tarih')
    .eq('hedef_tarih', today)

  if (metaErr) return NextResponse.json({ ok: false, error: metaErr.message }, { status: 500 })
  if (!metaRows || metaRows.length === 0) return NextResponse.json({ ok: true, data: [], today })

  // 2) Gorevler — firma filtresi burada uygulanır
  const gorevIds = metaRows.map(m => m.gorev_id)
  const { data: gorevler, error: gorevErr } = await admin
    .from('gorevler')
    .select(`
      id, durum, baslatilma_tarihi, tamamlanma_tarihi, durum_degisim_tarihi, olusturma_tarihi, iptal_sebep,
      lokasyon:lokasyon_id (tanim, parent_id, ust:parent_id (tanim)),
      baslatan:baslatan_kullanici_id (isim_soyisim),
      tamamlayan:islemi_yapan_id (isim_soyisim)
    `)
    .in('id', gorevIds)
    .eq('firma_id', firmaId)

  if (gorevErr) return NextResponse.json({ ok: false, error: gorevErr.message }, { status: 500 })

  // 3) Araçlar
  const aracIds = [...new Set(metaRows.map(m => m.arac_id))]
  const { data: araclar } = await admin
    .from('araclar')
    .select('id, plaka, marka, model, departman, kullanici_adi_soyadi')
    .in('id', aracIds)

  const aracMap = new Map((araclar ?? []).map((a: any) => [a.id, a]))
  const gorevMap = new Map((gorevler ?? []).map((g: any) => [g.id, g]))

  const data = metaRows
    .filter(m => gorevMap.has(m.gorev_id)) // firma filtresinden geçenler
    .map(m => {
      const g: any = gorevMap.get(m.gorev_id)
      const a: any = aracMap.get(m.arac_id)
      const ustTanim = g.lokasyon?.ust?.tanim ?? null
      const lokTanim = g.lokasyon?.tanim ?? null
      const lokasyon = ustTanim && lokTanim ? `${ustTanim} > ${lokTanim}` : (lokTanim ?? '—')
      return {
        gorev_id: m.gorev_id,
        plaka: m.plaka_snapshot,
        marka: a?.marka ?? null,
        model: a?.model ?? null,
        departman: a?.departman ?? null,
        kullanici: a?.kullanici_adi_soyadi ?? null,
        lokasyon,
        durum: g.durum as 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL',
        baslatan: g.baslatan?.isim_soyisim ?? null,
        baslatilma_tarihi: g.baslatilma_tarihi,
        tamamlayan: g.tamamlayan?.isim_soyisim ?? null,
        tamamlanma_tarihi: g.tamamlanma_tarihi,
        durum_degisim_tarihi: g.durum_degisim_tarihi,
        iptal_sebep: g.iptal_sebep,
        hedef_tarih: m.hedef_tarih,
      }
    })

  return NextResponse.json({ ok: true, data, today })
}
