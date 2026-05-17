/**
 * POST /api/oto-yikama/araclar/import
 *
 * Excel ile araç listesi tam senkronizasyon (full sync):
 *   - Excel'de var DB'de yok  → EKLE
 *   - Excel'de de DB'de de var (plaka match) → DOKUNMA (mevcut metadata korunur)
 *   - Excel'de yok DB'de var  → SİL (soft: aktif=false; pasiflerin geçmişi korunur)
 *
 * Bu sync logic SA tarafından bilinçli olarak tetiklenir. Audit log'a yazılır.
 *
 * Body:
 *   { firma_id, proje_id?, araclar: Array<{ plaka, marka?, model?, renk?, departman?, periyot_gun? }>, dry_run? }
 *
 * dry_run=true → işlem yapmaz, sadece ne olacağını döndürür (önizleme).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'
export const maxDuration = 120  // Büyük import için

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

  // Firma modül flag kontrolü — modül kapalıysa import bile başlatma
  const modulAktif = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!modulAktif) {
    return NextResponse.json(
      { ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil. Firma detay sayfasından açın.' },
      { status: 403 },
    )
  }

  // Excel satırlarını temizle ve plaka bazlı haritala.
  // Zorunlu alanlar: plaka, kullanici_adi_soyadi, departman. Eksik satırlar
  // hatalı liste döndürülür ve sync iptal edilir (kullanıcı önce excel'i düzeltsin).
  const excelMap = new Map<string, ImportRow>()
  const hataliSatirlar: { satir: number; plaka: string; eksik: string[] }[] = []
  araclar.forEach((r, idx) => {
    const plaka = String(r.plaka ?? '').trim().toUpperCase().replace(/\s+/g, '')
    const kullaniciAd = String(r.kullanici_adi_soyadi ?? '').trim()
    const departman = String(r.departman ?? '').trim()
    const eksik: string[] = []
    if (!plaka) eksik.push('plaka')
    if (!kullaniciAd) eksik.push('kullanici_adi_soyadi')
    if (!departman) eksik.push('departman')
    if (eksik.length > 0) {
      hataliSatirlar.push({ satir: idx + 2, plaka: plaka || '(boş)', eksik })  // +2: header satırı + 1-based
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
    })
  })

  if (hataliSatirlar.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `${hataliSatirlar.length} satırda zorunlu alan eksik (plaka, kullanici_adi_soyadi, departman).`,
      hatali_satirlar: hataliSatirlar.slice(0, 20),
      toplam_hatali: hataliSatirlar.length,
    }, { status: 400 })
  }

  // DB'deki AKTİF araçları çek (sync sadece aktifler arasında çalışır)
  let dbQ = admin.from('araclar').select('id, plaka, aktif').eq('firma_id', firmaId).eq('aktif', true)
  if (projeId) dbQ = dbQ.eq('proje_id', projeId)
  const { data: dbAraclar, error: dbErr } = await dbQ
  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 })

  const dbMap = new Map<string, { id: string; plaka: string }>()
  for (const a of dbAraclar ?? []) dbMap.set(a.plaka, { id: a.id, plaka: a.plaka })

  // Sınıflandır
  const eklenecek: ImportRow[] = []
  const dokunulmayan: string[] = []
  const silinecek: { id: string; plaka: string }[] = []

  for (const [plaka, row] of excelMap.entries()) {
    if (dbMap.has(plaka)) dokunulmayan.push(plaka)
    else eklenecek.push(row)
  }
  for (const [plaka, db] of dbMap.entries()) {
    if (!excelMap.has(plaka)) silinecek.push(db)
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      eklenecek: eklenecek.length,
      dokunulmayan: dokunulmayan.length,
      silinecek: silinecek.length,
      ornek: {
        eklenecek: eklenecek.slice(0, 5).map(r => r.plaka),
        silinecek: silinecek.slice(0, 5).map(s => s.plaka),
      },
    })
  }

  // Gerçek sync — batch'ler halinde
  const sonuc = { eklenen: 0, dokunulmayan: dokunulmayan.length, silinen: 0, hata: [] as string[] }

  // 1. EKLE (batch INSERT)
  if (eklenecek.length > 0) {
    const BATCH = 200
    for (let i = 0; i < eklenecek.length; i += BATCH) {
      const batch = eklenecek.slice(i, i + BATCH).map(r => ({
        firma_id: firmaId, proje_id: projeId,
        plaka: r.plaka, marka: r.marka, model: r.model, renk: r.renk,
        departman: r.departman, periyot_gun: r.periyot_gun ?? 7,
        yikama_gunleri: r.yikama_gunleri ?? [],
        kullanici_adi_soyadi: r.kullanici_adi_soyadi,
        kullanici_telefon: r.kullanici_telefon,
        kullanici_email: r.kullanici_email,
        olusturan_id: me.id, aktif: true,
      }))
      const { error } = await admin.from('araclar').insert(batch)
      if (error) sonuc.hata.push(`insert ${i}: ${error.message}`)
      else sonuc.eklenen += batch.length
    }
  }

  // 2. SİL (soft delete — pasif yap)
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

  // Audit log
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
        dokunulmayan: sonuc.dokunulmayan,
        silinen: sonuc.silinen,
      },
    })
  } catch {}

  return NextResponse.json({ ok: sonuc.hata.length === 0, ...sonuc })
}
