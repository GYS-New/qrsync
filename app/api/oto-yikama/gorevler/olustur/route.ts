/**
 * POST /api/oto-yikama/gorevler/olustur
 *
 * Toplu yıkama görevi oluşturma:
 *   - Yönetici plaka(lar) ve her plaka için lokasyon (yıkama alt lokasyonu) seçer
 *   - Çoklu tarih seçer
 *   - Her (plaka × tarih) için açık görev oluşturulur (atama yok)
 *
 * Body:
 *   {
 *     firma_id: string,
 *     atamalar: Array<{ arac_id: string, lokasyon_id: string }>,
 *     tarihler: string[]   // 'YYYY-MM-DD'
 *   }
 *
 * Davranış:
 *   - Aynı (arac, lokasyon, tarih) için zaten görev varsa atlanır (UNIQUE constraint).
 *   - Plaka snapshot — araç sonradan silinse bile görev geçmişi okunur kalır.
 *
 * SA-only + firma için oto_yikama_aktif=true zorunlu.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Atama = { arac_id: string; lokasyon_id: string }

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
    return NextResponse.json({ ok: false, error: 'En az bir plaka × lokasyon ataması gerekli' }, { status: 400 })
  }
  if (!Array.isArray(tarihler) || tarihler.length === 0) {
    return NextResponse.json({ ok: false, error: 'En az bir tarih seçilmeli' }, { status: 400 })
  }
  const gecersizTarih = tarihler.find(t => !DATE_RE.test(t))
  if (gecersizTarih) {
    return NextResponse.json({ ok: false, error: `Geçersiz tarih formatı: ${gecersizTarih} (beklenen YYYY-MM-DD)` }, { status: 400 })
  }

  const admin = createAdminClient()

  const modulAktif = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!modulAktif) {
    return NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 })
  }

  // Araç + lokasyon doğrulama
  const aracIds = [...new Set(atamalar.map(a => a.arac_id).filter(Boolean))]
  const lokasyonIds = [...new Set(atamalar.map(a => a.lokasyon_id).filter(Boolean))]
  if (aracIds.length === 0 || lokasyonIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'arac_id ve lokasyon_id zorunlu' }, { status: 400 })
  }

  const [aracQ, lokQ] = await Promise.all([
    admin.from('araclar').select('id, firma_id, plaka, aktif').in('id', aracIds),
    admin.from('lokasyonlar').select('id, firma_id, aktif').in('id', lokasyonIds),
  ])

  if (aracQ.error) return NextResponse.json({ ok: false, error: aracQ.error.message }, { status: 500 })
  if (lokQ.error)  return NextResponse.json({ ok: false, error: lokQ.error.message },  { status: 500 })

  const aracMap = new Map<string, { firma_id: string; plaka: string; aktif: boolean }>()
  for (const a of aracQ.data ?? []) aracMap.set(a.id, { firma_id: a.firma_id, plaka: a.plaka, aktif: a.aktif })
  const lokMap = new Map<string, { firma_id: string; aktif: boolean }>()
  for (const l of lokQ.data ?? []) lokMap.set(l.id, { firma_id: l.firma_id, aktif: l.aktif })

  const dogrulamaHatalari: string[] = []
  for (const a of atamalar) {
    const arac = aracMap.get(a.arac_id)
    const lok = lokMap.get(a.lokasyon_id)
    if (!arac) dogrulamaHatalari.push(`Araç bulunamadı: ${a.arac_id}`)
    else if (arac.firma_id !== firmaId) dogrulamaHatalari.push(`Araç farklı firmaya ait: ${arac.plaka}`)
    else if (!arac.aktif) dogrulamaHatalari.push(`Araç pasif: ${arac.plaka}`)
    if (!lok) dogrulamaHatalari.push(`Lokasyon bulunamadı`)
    else if (lok.firma_id !== firmaId) dogrulamaHatalari.push(`Lokasyon farklı firmaya ait`)
    else if (!lok.aktif) dogrulamaHatalari.push(`Lokasyon pasif`)
  }
  if (dogrulamaHatalari.length > 0) {
    return NextResponse.json({
      ok: false,
      error: 'Doğrulama hatası',
      hatalar: dogrulamaHatalari.slice(0, 20),
      toplam_hata: dogrulamaHatalari.length,
    }, { status: 400 })
  }

  const rows = atamalar.flatMap(a =>
    tarihler.map(t => ({
      firma_id: firmaId,
      arac_id: a.arac_id,
      lokasyon_id: a.lokasyon_id,
      plaka_snapshot: aracMap.get(a.arac_id)!.plaka,
      hedef_tarih: t,
      durum: 'ACIK' as const,
      olusturan_id: me.id,
    })),
  )

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
      // Toplu hata → satır satır retry (duplicate'ları ayıkla)
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
