import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/arsiv/kapasite
 *
 * Modlar:
 *  - SA global (firma_id yok): Tüm DB, 8GB Supabase limitine göre (mevcut davranış).
 *  - SA firma_id ile veya TA: Firma başına rezerve edilen kapasite
 *    (firmalar.depolama_kapasitesi_mb) üzerinden doluluk.
 *    Firma payı = tablo_bytes * (firma_satir / toplam_satir) — yaklaşık hesap.
 */

const DB_LIMIT_BYTES = 8 * 1024 * 1024 * 1024 // 8 GB

const ARSIV_TABLOLARI: { tablo: string; label: string; firmaKolonu?: string; proxyTablo?: string }[] = [
  { tablo: 'canli_gorevler_arsiv',             label: 'Frekansiyel Görevler',    firmaKolonu: 'firma_id' },
  { tablo: 'personel_mesai_kayitlari_arsiv',   label: 'Personel Mesai',          firmaKolonu: 'firma_id' },
  { tablo: 'musteri_degerlendirmeleri_arsiv',  label: 'Müşteri Değerlendirmeleri', firmaKolonu: 'firma_id' },
  { tablo: 'gorevler_arsiv',                   label: 'Spesifik Görevler',       firmaKolonu: 'firma_id' },
  { tablo: 'checklist_sonuc_basliklari_arsiv', label: 'Çeklist Başlıkları',      firmaKolonu: 'firma_id' },
  // maddeleri tablosunda firma_id yok — başlık oranıyla tahmin
  { tablo: 'checklist_sonuc_maddeleri_arsiv',  label: 'Çeklist Maddeleri',       proxyTablo: 'checklist_sonuc_basliklari_arsiv' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function durumHesap(doluluk: number): 'normal' | 'uyari' | 'kritik' {
  return doluluk >= 85 ? 'kritik' : doluluk >= 60 ? 'uyari' : 'normal'
}

// Global (tüm DB) hesap için eski eşikler (çok düşük doluluk — 8GB'a göre)
function globalDurumHesap(doluluk: number): 'normal' | 'uyari' | 'kritik' {
  return doluluk >= 10 ? 'kritik' : doluluk >= 5 ? 'uyari' : 'normal'
}

export async function GET(req: NextRequest) {
  const supabase = createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  const isU  = me.rol === 'tenant_user' || me.rol === 'musteri'
  if (!isSA && !isTA && !isU) return NextResponse.json({ ok: false, error: 'yetkisiz' }, { status: 403 })

  const admin = createAdminClient()

  // firma_id belirleme
  const url = new URL(req.url)
  const queryFirma = url.searchParams.get('firma_id')
  const scopedFirmaId: string | null = isSA
    ? (queryFirma || null)           // SA: param verilmemişse global
    : (me.firma_id ?? null)          // TA/U: her zaman kendi firması

  // SA ve TA dışındaki U rolü sadece kendi firmasını görebilir; firma_id çakışması olmamalı
  if (!isSA && queryFirma && queryFirma !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'yetkisiz_firma' }, { status: 403 })
  }

  try {
    // 1) Tüm tabloların gerçek disk boyutu (RPC)
    const { data: boyutData, error: boyutErr } = await admin.rpc('get_table_sizes', {
      table_names: ARSIV_TABLOLARI.map(t => t.tablo),
    })

    const boyutMap = new Map<string, { total_bytes: number; row_count: number }>()
    if (!boyutErr && boyutData) {
      for (const row of boyutData as any[]) {
        boyutMap.set(row.table_name, {
          total_bytes: Number(row.total_bytes),
          row_count: Math.max(0, Number(row.row_count)),
        })
      }
    }

    // 2) Firma bazlı görünüm gerekiyorsa, firma satır sayılarını topla
    const firmaRowMap = new Map<string, number>()
    if (scopedFirmaId) {
      await Promise.all(ARSIV_TABLOLARI.map(async ({ tablo, firmaKolonu }) => {
        if (!firmaKolonu) return
        const { count } = await admin
          .from(tablo)
          .select('id', { count: 'exact', head: true })
          .eq(firmaKolonu, scopedFirmaId)
        firmaRowMap.set(tablo, Math.max(0, count ?? 0))
      }))
    }

    // 3) Limit belirle — firma moduysa firma kapasitesi, değilse 8GB DB
    let limitBytes = DB_LIMIT_BYTES
    let limitLabel = formatBytes(DB_LIMIT_BYTES)
    let scope: 'firma' | 'global' = 'global'

    if (scopedFirmaId) {
      const { data: firma } = await admin
        .from('firmalar')
        .select('depolama_kapasitesi_mb')
        .eq('id', scopedFirmaId)
        .single()
      const mb = Number(firma?.depolama_kapasitesi_mb ?? 1024)
      limitBytes = mb * 1024 * 1024
      limitLabel = `${mb.toLocaleString('tr-TR')} MB`
      scope = 'firma'
    }

    // 4) Tablo başına hesap
    const sonuclar = ARSIV_TABLOLARI.map(({ tablo, label, firmaKolonu, proxyTablo }) => {
      const globalInfo = boyutMap.get(tablo) ?? { total_bytes: 0, row_count: 0 }

      // Firma modunda: bytes = globalBytes * (firmaRows / totalRows)
      // maddeleri için: proxy tablonun firma oranını kullan
      let bytes: number
      let kayit: number

      if (scope === 'firma') {
        if (firmaKolonu) {
          const firmaRows = firmaRowMap.get(tablo) ?? 0
          const totalRows = globalInfo.row_count
          const oran = totalRows > 0 ? firmaRows / totalRows : 0
          bytes = Math.round(globalInfo.total_bytes * oran)
          kayit = firmaRows
        } else if (proxyTablo) {
          const proxyGlobal = boyutMap.get(proxyTablo) ?? { total_bytes: 0, row_count: 0 }
          const proxyFirma  = firmaRowMap.get(proxyTablo) ?? 0
          const oran = proxyGlobal.row_count > 0 ? proxyFirma / proxyGlobal.row_count : 0
          bytes = Math.round(globalInfo.total_bytes * oran)
          // Madde kayıt sayısını da aynı oranla tahmin et
          kayit = Math.round(globalInfo.row_count * oran)
        } else {
          bytes = 0; kayit = 0
        }
      } else {
        bytes = globalInfo.total_bytes
        kayit = globalInfo.row_count
      }

      const doluluk = limitBytes > 0 ? Math.round((bytes / limitBytes) * 100 * 10) / 10 : 0
      const durum = scope === 'firma' ? durumHesap(doluluk) : globalDurumHesap(doluluk)

      return {
        tablo, label,
        kayit,
        boyut_bytes: bytes,
        boyut_label: formatBytes(bytes),
        doluluk,
        durum,
      }
    })

    const toplamBytes = sonuclar.reduce((s, r) => s + r.boyut_bytes, 0)
    const toplamKayit = sonuclar.reduce((s, r) => s + r.kayit, 0)
    const genelDoluluk = limitBytes > 0 ? Math.round((toplamBytes / limitBytes) * 100 * 10) / 10 : 0
    const genelDurum = scope === 'firma' ? durumHesap(genelDoluluk) : globalDurumHesap(genelDoluluk)

    return NextResponse.json({
      ok: true,
      scope,
      firma_id: scopedFirmaId,
      genel: {
        toplam_kayit: toplamKayit,
        toplam_bytes: toplamBytes,
        toplam_label: formatBytes(toplamBytes),
        doluluk: genelDoluluk,
        durum: genelDurum,
        db_limit: limitLabel,
        db_limit_label: limitLabel,
      },
      tablolar: sonuclar,
    })
  } catch (err) {
    console.error('[arsiv-kapasite] Hata:', err)
    return NextResponse.json({ ok: false, error: 'query_error' }, { status: 500 })
  }
}
