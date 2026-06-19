/**
 * POST /api/oto-yikama/araclar/import
 *
 * Excel ile araç listesi tam senkronizasyon (full sync) — Excel artık
 * truth source. Davranış:
 *
 *   • Excel'de var, DB'de yok      → EKLE
 *   • Excel'de var, DB'de pasif    → REAKTIFLEŞTİR (+ farkları update)
 *   • Excel'de var, DB'de aktif    → Alanlar eşitse DOKUNMA, farklıysa UPDATE
 *   • Excel'de yok, DB'de aktif    → PASİFLEŞTİR (aktif=false; soft delete)
 *   • Excel'de yok, DB'de pasif    → DOKUNMA
 *
 * Soft delete neden? oto_yikama_gorev_metadata.arac_id ON DELETE CASCADE.
 * Hard delete metadata + gorev kayıtlarını siler. Pasifleştirme tarihsel
 * kayıtları korur (kullanıcı talebi: "tüm önceki görev kayıtları DB'de
 * kalmaya devam eder").
 *
 * Update kapsamındaki alanlar (Excel'den gelirse hepsi senkronize edilir):
 *   marka, model, renk, departman, periyot_gun, yikama_gunleri,
 *   kullanici_adi_soyadi, kullanici_telefon, kullanici_email,
 *   yikama_frekans_tip, yikama_frekans_aralik, yikama_referans_tarih,
 *   varsayilan_lokasyon_id
 *
 * Body:
 *   {
 *     firma_id,
 *     proje_id?,
 *     araclar: ImportRow[],
 *     dry_run?      // önizleme: değişiklik yapmadan ne olacağını döner
 *   }
 *
 * ImportRow.varsayilan_istasyon: lokasyon TANIMI gelir (örn 'İSTASYON - 1'),
 * server tarafında o firma'nın aktif alt istasyonlarından bulunup ID'ye
 * çevrilir. Bulunamazsa hatalı satır.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type FrekansTip = 'HAFTALIK' | 'BIHAFTA' | 'AYLIK'

type ImportRow = {
  plaka: string
  marka?: string | null
  model?: string | null
  renk?: string | null
  departman?: string | null
  periyot_gun?: number | null
  yikama_gunleri?: number[] | null
  kullanici_adi_soyadi?: string | null
  kullanici_telefon?: string | null
  kullanici_email?: string | null
  yikama_frekans_tip?: string | null
  yikama_frekans_aralik?: number | null
  yikama_referans_tarih?: string | null
  varsayilan_istasyon?: string | null  // lokasyon TANIMI
}

type Normalized = {
  plaka: string
  marka: string | null
  model: string | null
  renk: string | null
  departman: string
  periyot_gun: number
  yikama_gunleri: number[]
  kullanici_adi_soyadi: string
  kullanici_telefon: string | null
  kullanici_email: string | null
  yikama_frekans_tip: FrekansTip
  yikama_frekans_aralik: number
  yikama_referans_tarih: string | null
  varsayilan_lokasyon_id: string | null
}

const FREKANS_VALID = new Set<FrekansTip>(['HAFTALIK', 'BIHAFTA', 'AYLIK'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// İki normalized satırın yıkama kuralı + araç alanlarında farklılık var mı?
function farkVarMi(db: Normalized, excel: Normalized): boolean {
  const cmpStr = (a: string | null, b: string | null) => (a ?? '') !== (b ?? '')
  const cmpArr = (a: number[], b: number[]) => {
    if (a.length !== b.length) return true
    const aS = [...a].sort((x, y) => x - y)
    const bS = [...b].sort((x, y) => x - y)
    for (let i = 0; i < aS.length; i++) if (aS[i] !== bS[i]) return true
    return false
  }
  return (
    cmpStr(db.marka, excel.marka) ||
    cmpStr(db.model, excel.model) ||
    cmpStr(db.renk, excel.renk) ||
    db.departman !== excel.departman ||
    db.periyot_gun !== excel.periyot_gun ||
    cmpArr(db.yikama_gunleri, excel.yikama_gunleri) ||
    db.kullanici_adi_soyadi !== excel.kullanici_adi_soyadi ||
    cmpStr(db.kullanici_telefon, excel.kullanici_telefon) ||
    cmpStr(db.kullanici_email, excel.kullanici_email) ||
    db.yikama_frekans_tip !== excel.yikama_frekans_tip ||
    db.yikama_frekans_aralik !== excel.yikama_frekans_aralik ||
    cmpStr(db.yikama_referans_tarih, excel.yikama_referans_tarih) ||
    cmpStr(db.varsayilan_lokasyon_id, excel.varsayilan_lokasyon_id)
  )
}

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
  const projeId = body.proje_id ?? null
  const dryRun = !!body.dry_run
  const araclar = (body.araclar ?? []) as ImportRow[]

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!Array.isArray(araclar)) return NextResponse.json({ ok: false, error: 'araclar dizisi gerekli' }, { status: 400 })

  const admin = createAdminClient()

  const modulAktif = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!modulAktif) {
    return NextResponse.json(
      { ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil. Firma detay sayfasından açın.' },
      { status: 403 },
    )
  }

  // Lokasyon tanım → ID haritası (case-insensitive, trim'li)
  const { data: lokRows } = await admin
    .from('lokasyonlar')
    .select('id, tanim, parent_id, aktif, parent:lokasyonlar!parent_id(oto_yikama_lokasyon)')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
  const lokMap = new Map<string, string>()
  for (const l of (lokRows ?? []) as any[]) {
    if (!l.parent_id) continue
    if (!l.parent?.oto_yikama_lokasyon) continue
    lokMap.set(String(l.tanim).trim().toLocaleLowerCase('tr'), l.id)
  }

  // Excel satırlarını normalize et + sınıflandır
  const excelMap = new Map<string, Normalized>()
  const hataliSatirlar: { satir: number; plaka: string; eksik: string[] }[] = []

  araclar.forEach((r, idx) => {
    const plaka = String(r.plaka ?? '').trim().toUpperCase().replace(/\s+/g, '')
    const kullaniciAd = String(r.kullanici_adi_soyadi ?? '').trim()
    const departman = String(r.departman ?? '').trim()

    const eksik: string[] = []
    if (!plaka) eksik.push('plaka')
    if (!kullaniciAd) eksik.push('kullanici_adi_soyadi')
    if (!departman) eksik.push('departman')

    const frekansTipRaw = String(r.yikama_frekans_tip ?? '').trim().toUpperCase()
    const frekansTip: FrekansTip = FREKANS_VALID.has(frekansTipRaw as FrekansTip)
      ? (frekansTipRaw as FrekansTip) : 'HAFTALIK'

    const frekansAralik = Number.isInteger(r.yikama_frekans_aralik) && (r.yikama_frekans_aralik as number) >= 1
      ? (r.yikama_frekans_aralik as number) : 1

    let referansTarih: string | null = null
    if (r.yikama_referans_tarih) {
      const s = String(r.yikama_referans_tarih).trim()
      if (DATE_RE.test(s)) referansTarih = s
      else if (s) eksik.push('yikama_referans_tarih (YYYY-MM-DD formatında)')
    }
    if ((frekansTip === 'BIHAFTA' || frekansTip === 'AYLIK') && !referansTarih) {
      eksik.push(`yikama_referans_tarih (${frekansTip} için zorunlu)`)
    }

    // Lokasyon adı → ID resolve
    const istasyonAdRaw = String(r.varsayilan_istasyon ?? '').trim()
    let varsayilanLokId: string | null = null
    if (istasyonAdRaw) {
      const key = istasyonAdRaw.toLocaleLowerCase('tr')
      varsayilanLokId = lokMap.get(key) ?? null
      if (!varsayilanLokId) eksik.push(`varsayilan_istasyon ('${istasyonAdRaw}' bulunamadı)`)
    }

    if (eksik.length > 0) {
      hataliSatirlar.push({ satir: idx + 2, plaka: plaka || '(boş)', eksik })
      return
    }

    const gunler = Array.isArray(r.yikama_gunleri)
      ? [...new Set(r.yikama_gunleri.map(g => Number(g)).filter(n => Number.isInteger(n) && n >= 1 && n <= 7))].sort((a, b) => a - b)
      : []

    excelMap.set(plaka, {
      plaka,
      marka: r.marka?.toString().trim() || null,
      model: r.model?.toString().trim() || null,
      renk: r.renk?.toString().trim() || null,
      departman,
      periyot_gun: r.periyot_gun != null ? Number(r.periyot_gun) || 7 : 7,
      yikama_gunleri: gunler,
      kullanici_adi_soyadi: kullaniciAd,
      kullanici_telefon: r.kullanici_telefon?.toString().trim() || null,
      kullanici_email: r.kullanici_email?.toString().trim() || null,
      yikama_frekans_tip: frekansTip,
      yikama_frekans_aralik: frekansAralik,
      yikama_referans_tarih: referansTarih,
      varsayilan_lokasyon_id: varsayilanLokId,
    })
  })

  if (hataliSatirlar.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `${hataliSatirlar.length} satırda hata var. Önce düzeltin.`,
      hatali_satirlar: hataliSatirlar.slice(0, 20),
      toplam_hatali: hataliSatirlar.length,
    }, { status: 400 })
  }

  // DB'deki TÜM araçları çek (aktif + pasif — pasif olanlar geri aktifleşebilir)
  let dbQ = admin.from('araclar').select('*').eq('firma_id', firmaId)
  if (projeId) dbQ = dbQ.eq('proje_id', projeId)
  const { data: dbAraclar, error: dbErr } = await dbQ
  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 })

  const dbMap = new Map<string, any>()
  for (const a of dbAraclar ?? []) dbMap.set(a.plaka, a)

  // Sınıflandır
  const eklenecek: Normalized[] = []
  const guncellenecek: { id: string; eski: any; yeni: Normalized; reaktivleseck: boolean }[] = []
  const dokunulmayan: string[] = []
  const silinecek: { id: string; plaka: string }[] = []

  for (const [plaka, excel] of excelMap.entries()) {
    const db = dbMap.get(plaka)
    if (!db) {
      eklenecek.push(excel)
      continue
    }
    const dbNorm: Normalized = {
      plaka: db.plaka,
      marka: db.marka,
      model: db.model,
      renk: db.renk,
      departman: db.departman ?? '',
      periyot_gun: db.periyot_gun ?? 7,
      yikama_gunleri: Array.isArray(db.yikama_gunleri) ? db.yikama_gunleri : [],
      kullanici_adi_soyadi: db.kullanici_adi_soyadi ?? '',
      kullanici_telefon: db.kullanici_telefon,
      kullanici_email: db.kullanici_email,
      yikama_frekans_tip: (db.yikama_frekans_tip ?? 'HAFTALIK') as FrekansTip,
      yikama_frekans_aralik: db.yikama_frekans_aralik ?? 1,
      yikama_referans_tarih: db.yikama_referans_tarih,
      varsayilan_lokasyon_id: db.varsayilan_lokasyon_id,
    }
    const reaktifNeeded = db.aktif === false
    if (reaktifNeeded || farkVarMi(dbNorm, excel)) {
      guncellenecek.push({ id: db.id, eski: db, yeni: excel, reaktivleseck: reaktifNeeded })
    } else {
      dokunulmayan.push(plaka)
    }
  }

  // Excel'de yok ama DB'de AKTİF olanlar pasifleştirilir (pasifler dokunulmaz)
  for (const [plaka, db] of dbMap.entries()) {
    if (excelMap.has(plaka)) continue
    if (db.aktif === false) continue
    silinecek.push({ id: db.id, plaka })
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      eklenecek: eklenecek.length,
      guncellenecek: guncellenecek.length,
      dokunulmayan: dokunulmayan.length,
      silinecek: silinecek.length,
      ornek: {
        eklenecek: eklenecek.slice(0, 5).map(r => r.plaka),
        guncellenecek: guncellenecek.slice(0, 5).map(g => g.yeni.plaka),
        silinecek: silinecek.slice(0, 5).map(s => s.plaka),
      },
    })
  }

  // Gerçek sync
  const sonuc = {
    eklenen: 0,
    guncellenen: 0,
    dokunulmayan: dokunulmayan.length,
    silinen: 0,
    hata: [] as string[],
  }

  // 1. EKLE
  if (eklenecek.length > 0) {
    const BATCH = 200
    for (let i = 0; i < eklenecek.length; i += BATCH) {
      const batch = eklenecek.slice(i, i + BATCH).map(r => ({
        firma_id: firmaId, proje_id: projeId,
        plaka: r.plaka, marka: r.marka, model: r.model, renk: r.renk,
        departman: r.departman, periyot_gun: r.periyot_gun,
        yikama_gunleri: r.yikama_gunleri,
        kullanici_adi_soyadi: r.kullanici_adi_soyadi,
        kullanici_telefon: r.kullanici_telefon,
        kullanici_email: r.kullanici_email,
        yikama_frekans_tip: r.yikama_frekans_tip,
        yikama_frekans_aralik: r.yikama_frekans_aralik,
        yikama_referans_tarih: r.yikama_referans_tarih,
        varsayilan_lokasyon_id: r.varsayilan_lokasyon_id,
        olusturan_id: me.id, aktif: true,
      }))
      const { error } = await admin.from('araclar').insert(batch)
      if (error) sonuc.hata.push(`insert ${i}: ${error.message}`)
      else sonuc.eklenen += batch.length
    }
  }

  // 2. GÜNCELLE (tek tek — alan değişikliği ve aktif reset için)
  for (const g of guncellenecek) {
    const update: any = {
      marka: g.yeni.marka,
      model: g.yeni.model,
      renk: g.yeni.renk,
      departman: g.yeni.departman,
      periyot_gun: g.yeni.periyot_gun,
      yikama_gunleri: g.yeni.yikama_gunleri,
      kullanici_adi_soyadi: g.yeni.kullanici_adi_soyadi,
      kullanici_telefon: g.yeni.kullanici_telefon,
      kullanici_email: g.yeni.kullanici_email,
      yikama_frekans_tip: g.yeni.yikama_frekans_tip,
      yikama_frekans_aralik: g.yeni.yikama_frekans_aralik,
      yikama_referans_tarih: g.yeni.yikama_referans_tarih,
      varsayilan_lokasyon_id: g.yeni.varsayilan_lokasyon_id,
    }
    if (g.reaktivleseck) update.aktif = true
    const { error } = await admin.from('araclar').update(update).eq('id', g.id)
    if (error) sonuc.hata.push(`update ${g.yeni.plaka}: ${error.message}`)
    else sonuc.guncellenen += 1
  }

  // 3. PASİFLEŞTİR
  if (silinecek.length > 0) {
    const ids = silinecek.map(s => s.id)
    const BATCH = 500
    for (let i = 0; i < ids.length; i += BATCH) {
      const batchIds = ids.slice(i, i + BATCH)
      const { error } = await admin.from('araclar').update({ aktif: false }).in('id', batchIds)
      if (error) sonuc.hata.push(`pasifle ${i}: ${error.message}`)
      else sonuc.silinen += batchIds.length
    }
  }

  try {
    await admin.from('audit_log').insert({
      tip: 'oto_yikama_arac_import',
      tablo: 'araclar',
      kullanici_id: me.id,
      basarili: sonuc.hata.length === 0,
      satir_sayisi: araclar.length,
      hata_mesaji: sonuc.hata.length > 0 ? sonuc.hata.join('; ').slice(0, 1000) : null,
      detay: {
        firma_id: firmaId, proje_id: projeId,
        toplam_excel: araclar.length,
        eklenen: sonuc.eklenen,
        guncellenen: sonuc.guncellenen,
        dokunulmayan: sonuc.dokunulmayan,
        silinen: sonuc.silinen,
      },
    })
  } catch {}

  return NextResponse.json({ ok: sonuc.hata.length === 0, ...sonuc })
}
