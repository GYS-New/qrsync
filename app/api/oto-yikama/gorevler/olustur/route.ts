/**
 * POST /api/oto-yikama/gorevler/olustur
 *
 * Toplu yıkama görevi oluşturma. Mevcut "gorevler" tablosuna spesifik görev
 * olarak yazılır + yana 1:1 oto_yikama_gorev_metadata kaydı atılır.
 *
 * Bu sayede mobil app değişmez (mevcut spesifik görev akışıyla yıkama
 * görevleri de gelir/yapılır). Plaka geçmişi raporu metadata tablosundan.
 *
 * Body:
 *   {
 *     firma_id: string,
 *     atamalar: Array<{ arac_id: string, lokasyon_id: string }>,
 *     tarihler: string[]   // 'YYYY-MM-DD'
 *   }
 *
 * Davranış:
 *   - Görev tanımı: "Oto Yıkama - PLAKA"
 *   - atanan_kullanici_id = NULL (açık görev — atama yok)
 *   - durum = hedef_tarih > bugün ise 'HAZIR', değilse 'ACIK'
 *     (HAZIR görevleri her gece 00:01 TR'de cron ACIK'a alır)
 *   - Aynı (arac, lokasyon, hedef_tarih) için duplicate engelleme:
 *     metadata UNIQUE constraint + ön sorgu ile API'de elenir.
 *   - Hata olursa best-effort cleanup: metadata INSERT fail ederse oluşan
 *     gorev satırı silinir.
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

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Bu işlem için yönetici (SA veya TA) yetkisi gerekli' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const firmaId = body.firma_id
  const atamalar = (body.atamalar ?? []) as Atama[]
  const tarihler = (body.tarihler ?? []) as string[]

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  if (!isSA && firmaId !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }
  if (!Array.isArray(atamalar) || atamalar.length === 0) {
    return NextResponse.json({ ok: false, error: 'En az bir plaka × lokasyon ataması gerekli' }, { status: 400 })
  }
  if (!Array.isArray(tarihler) || tarihler.length === 0) {
    return NextResponse.json({ ok: false, error: 'En az bir tarih seçilmeli' }, { status: 400 })
  }
  const gecersizTarih = tarihler.find(t => !DATE_RE.test(t))
  if (gecersizTarih) {
    return NextResponse.json({ ok: false, error: `Geçersiz tarih formatı: ${gecersizTarih}` }, { status: 400 })
  }

  const admin = createAdminClient()

  const modulAktif = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!modulAktif) {
    return NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 })
  }

  // Aracı + lokasyonu doğrula
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
      ok: false, error: 'Doğrulama hatası',
      hatalar: dogrulamaHatalari.slice(0, 20),
      toplam_hata: dogrulamaHatalari.length,
    }, { status: 400 })
  }

  // Duplicate önle: hangi (arac_id, hedef_tarih) kombinasyonu zaten yazılmış?
  const { data: mevcutMeta } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('arac_id, hedef_tarih')
    .in('arac_id', aracIds)
    .in('hedef_tarih', tarihler)
  const mevcutSet = new Set<string>(
    (mevcutMeta ?? []).map(m => `${m.arac_id}__${m.hedef_tarih}`),
  )

  // Görev satırlarını hazırla
  type GorevSatir = { arac_id: string; lokasyon_id: string; hedef_tarih: string; plaka: string }
  const planlanan: GorevSatir[] = []
  for (const a of atamalar) {
    const plaka = aracMap.get(a.arac_id)!.plaka
    for (const t of tarihler) {
      const k = `${a.arac_id}__${t}`
      if (mevcutSet.has(k)) continue  // duplicate, atla
      planlanan.push({ arac_id: a.arac_id, lokasyon_id: a.lokasyon_id, hedef_tarih: t, plaka })
    }
  }

  let eklenen = 0
  const hatalar: string[] = []
  const duplicate = (atamalar.length * tarihler.length) - planlanan.length

  // Batch — her satır için gorevler INSERT + metadata INSERT
  // (Supabase JS'te transaction yok; metadata fail olursa gorev rollback.)
  // Durum: hedef_tarih > bugün → HAZIR (cron 00:01'de ACIK'a alır), bugün/geçmiş → direkt ACIK.
  const bugunTR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
  const BATCH = 100
  for (let i = 0; i < planlanan.length; i += BATCH) {
    const chunk = planlanan.slice(i, i + BATCH)

    // 1) gorevler INSERT
    const gorevRows = chunk.map(c => ({
      firma_id: firmaId,
      tanim: `Oto Yıkama - ${c.plaka}`,
      lokasyon_id: c.lokasyon_id,
      atanan_kullanici_id: null,
      durum: c.hedef_tarih > bugunTR ? 'HAZIR' : 'ACIK',
      olusturan_id: me.id,
    }))
    const { data: insertedGorevler, error: gorevErr } = await admin
      .from('gorevler')
      .insert(gorevRows)
      .select('id')

    if (gorevErr || !insertedGorevler || insertedGorevler.length !== chunk.length) {
      hatalar.push(`gorevler batch ${i}: ${gorevErr?.message ?? 'beklenen satır sayısı eşleşmedi'}`)
      continue
    }

    // 2) metadata INSERT — gorev_id'lerle eşle
    // ekstra=true: bu sayfa "Ekstra Görev Oluştur" rolünde olduğu için
    // buradan kaydedilen tüm görevler kuraldışı ekstra olarak işaretlenir.
    // Otomatik cron (oto_yikama_gorev_uret_ertesi_gun) ekstra=false yazıyor.
    const ekstraFlag = body.ekstra === true
    const metaRows = insertedGorevler.map((g, idx) => ({
      gorev_id: g.id,
      arac_id: chunk[idx].arac_id,
      plaka_snapshot: chunk[idx].plaka,
      hedef_tarih: chunk[idx].hedef_tarih,
      ekstra: ekstraFlag,
    }))
    const { error: metaErr } = await admin.from('oto_yikama_gorev_metadata').insert(metaRows)

    if (metaErr) {
      // Rollback: oluşan görevleri sil — yetim kalmasın
      const idsToDelete = insertedGorevler.map(g => g.id)
      await admin.from('gorevler').delete().in('id', idsToDelete)
      hatalar.push(`metadata batch ${i}: ${metaErr.message} (görevler geri alındı)`)
      continue
    }

    eklenen += chunk.length
  }

  try {
    await admin.from('audit_log').insert({
      tip: 'oto_yikama_gorev_olustur',
      tablo: 'gorevler',
      kullanici_id: me.id,
      basarili: hatalar.length === 0,
      satir_sayisi: eklenen,
      hata_mesaji: hatalar.length > 0 ? hatalar.join('; ').slice(0, 1000) : null,
      detay: {
        firma_id: firmaId,
        toplam_atama: atamalar.length,
        toplam_tarih: tarihler.length,
        beklenen: planlanan.length,
        eklenen,
        duplicate,
        hata_sayisi: hatalar.length,
      },
    })
  } catch {}

  return NextResponse.json({
    ok: hatalar.length === 0,
    beklenen: planlanan.length,
    eklenen,
    duplicate,
    hatalar: hatalar.slice(0, 10),
  })
}
