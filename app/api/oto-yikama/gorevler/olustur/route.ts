/**
 * POST /api/oto-yikama/gorevler/olustur
 *
 * Toplu yıkama görevi oluşturma:
 *   - Yönetici plaka(lar) ve her plaka için istasyon seçer
 *   - Çoklu tarih seçer
 *   - Her (plaka × tarih) için açık görev oluşturulur (atanan_kullanici_id NULL)
 *
 * Body:
 *   {
 *     firma_id: string,
 *     atamalar: Array<{ arac_id: string, istasyon_id: string }>,
 *     tarihler: string[]   // 'YYYY-MM-DD'
 *   }
 *
 * Davranış:
 *   - Aynı (arac, istasyon, tarih) için zaten görev varsa atlanır (UNIQUE constraint).
 *   - Her INSERT ayrı; bir satır hata verirse diğerleri etkilenmez (best-effort).
 *   - Plaka snapshot — araç sonradan silinse bile görev geçmişi okunur kalır.
 *
 * SA-only + firma için oto_yikama_aktif=true zorunlu.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'
export const maxDuration = 60  // büyük toplu insert için

type Atama = { arac_id: string; istasyon_id: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const firmaId = body.firma_id
  const atamalar = (body.atamalar ?? []) as Atama[]
  const tarihler = (body.tarihler ?? []) as string[]

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!Array.isArray(atamalar) || atamalar.length === 0) {
    return NextResponse.json({ ok: false, error: 'En az bir plaka × istasyon ataması gerekli' }, { status: 400 })
  }
  if (!Array.isArray(tarihler) || tarihler.length === 0) {
    return NextResponse.json({ ok: false, error: 'En az bir tarih seçilmeli' }, { status: 400 })
  }
  // Tarih format kontrolü — DB'ye gitmeden hatalıları ele
  const gecersizTarih = tarihler.find(t => !DATE_RE.test(t))
  if (gecersizTarih) {
    return NextResponse.json({ ok: false, error: `Geçersiz tarih formatı: ${gecersizTarih} (beklenen YYYY-MM-DD)` }, { status: 400 })
  }

  const admin = createAdminClient()

  const modulAktif = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!modulAktif) {
    return NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 })
  }

  // 1) Araçları doğrula (firmaya ait, aktif, plaka snapshot için)
  const aracIds = [...new Set(atamalar.map(a => a.arac_id).filter(Boolean))]
  const istasyonIds = [...new Set(atamalar.map(a => a.istasyon_id).filter(Boolean))]
  if (aracIds.length === 0 || istasyonIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'arac_id ve istasyon_id zorunlu' }, { status: 400 })
  }

  const [aracQ, istQ] = await Promise.all([
    admin.from('araclar').select('id, firma_id, plaka, aktif').in('id', aracIds),
    admin.from('yikama_istasyonlari').select('id, firma_id, aktif').in('id', istasyonIds),
  ])

  if (aracQ.error) return NextResponse.json({ ok: false, error: aracQ.error.message }, { status: 500 })
  if (istQ.error)  return NextResponse.json({ ok: false, error: istQ.error.message },  { status: 500 })

  const aracMap = new Map<string, { firma_id: string; plaka: string; aktif: boolean }>()
  for (const a of aracQ.data ?? []) aracMap.set(a.id, { firma_id: a.firma_id, plaka: a.plaka, aktif: a.aktif })
  const istMap = new Map<string, { firma_id: string; aktif: boolean }>()
  for (const i of istQ.data ?? []) istMap.set(i.id, { firma_id: i.firma_id, aktif: i.aktif })

  const dogrulamaHatalari: string[] = []
  for (const a of atamalar) {
    const arac = aracMap.get(a.arac_id)
    const ist = istMap.get(a.istasyon_id)
    if (!arac) dogrulamaHatalari.push(`Araç bulunamadı: ${a.arac_id}`)
    else if (arac.firma_id !== firmaId) dogrulamaHatalari.push(`Araç farklı firmaya ait: ${arac.plaka}`)
    else if (!arac.aktif) dogrulamaHatalari.push(`Araç pasif: ${arac.plaka}`)
    if (!ist) dogrulamaHatalari.push(`İstasyon bulunamadı: ${a.istasyon_id}`)
    else if (ist.firma_id !== firmaId) dogrulamaHatalari.push(`İstasyon farklı firmaya ait`)
    else if (!ist.aktif) dogrulamaHatalari.push(`İstasyon pasif`)
  }
  if (dogrulamaHatalari.length > 0) {
    return NextResponse.json({
      ok: false,
      error: 'Doğrulama hatası',
      hatalar: dogrulamaHatalari.slice(0, 20),
      toplam_hata: dogrulamaHatalari.length,
    }, { status: 400 })
  }

  // 2) Toplu INSERT — duplicate olanları atlamak için DB unique constraint'ine güveniyoruz
  const rows = atamalar.flatMap(a =>
    tarihler.map(t => ({
      firma_id: firmaId,
      arac_id: a.arac_id,
      istasyon_id: a.istasyon_id,
      plaka_snapshot: aracMap.get(a.arac_id)!.plaka,
      hedef_tarih: t,
      durum: 'ACIK' as const,
      olusturan_id: me.id,
    })),
  )

  // Toplu insert — chunk'la
  const BATCH = 500
  let eklenen = 0
  let duplicate = 0
  const hatalar: string[] = []
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { data, error } = await admin
      .from('yikama_gorevleri')
      .insert(batch)
      .select('id')
    if (error) {
      // Toplu hata durumunda satır satır geç — duplicate'ları sessizce atla
      for (const row of batch) {
        const { error: rowErr } = await admin.from('yikama_gorevleri').insert(row)
        if (!rowErr) eklenen++
        else if (rowErr.code === '23505') duplicate++
        else hatalar.push(`(${row.plaka_snapshot}, ${row.hedef_tarih}): ${rowErr.message}`)
      }
    } else {
      eklenen += data?.length ?? 0
    }
  }

  // Audit
  try {
    await admin.from('audit_log').insert({
      tip: 'oto_yikama_gorev_olustur',
      tablo: 'yikama_gorevleri',
      kullanici_id: me.id,
      basarili: hatalar.length === 0,
      satir_sayisi: eklenen,
      hata_mesaji: hatalar.length > 0 ? hatalar.join('; ').slice(0, 1000) : null,
      detay: {
        firma_id: firmaId,
        toplam_atama: atamalar.length,
        toplam_tarih: tarihler.length,
        beklenen: rows.length,
        eklenen,
        duplicate,
        hata_sayisi: hatalar.length,
      },
    })
  } catch {}

  return NextResponse.json({
    ok: hatalar.length === 0,
    beklenen: rows.length,
    eklenen,
    duplicate,
    hatalar: hatalar.slice(0, 10),
  })
}
