import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/arsiv/kapasite
 *
 * Arşiv tablolarının gerçek disk boyutlarını Supabase'den çeker.
 * pg_total_relation_size() ile index dahil toplam boyut.
 * Supabase Pro: 8GB database limiti.
 */

const DB_LIMIT_BYTES = 8 * 1024 * 1024 * 1024 // 8 GB

const ARSIV_TABLOLARI: { tablo: string; label: string }[] = [
  { tablo: 'canli_gorevler_arsiv',             label: 'Frekansiyel Görevler' },
  { tablo: 'personel_mesai_kayitlari_arsiv',   label: 'Personel Mesai' },
  { tablo: 'musteri_degerlendirmeleri_arsiv',   label: 'Müşteri Değerlendirmeleri' },
  { tablo: 'gorevler_arsiv',                   label: 'Spesifik Görevler' },
  { tablo: 'checklist_sonuc_basliklari_arsiv', label: 'Çeklist Başlıkları' },
  { tablo: 'checklist_sonuc_maddeleri_arsiv',  label: 'Çeklist Maddeleri' },
]

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export async function GET() {
  const supabase = createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (!isSA) return NextResponse.json({ ok: false, error: 'yetkisiz' }, { status: 403 })

  const admin = createAdminClient()

  try {
    // Tüm tablo boyutlarını tek SQL ile çek
    const tabloIsimleri = ARSIV_TABLOLARI.map(t => `'${t.tablo}'`).join(',')
    const { data: boyutData, error: boyutErr } = await admin.rpc('get_table_sizes', {
      table_names: ARSIV_TABLOLARI.map(t => t.tablo),
    })

    // RPC yoksa fallback: tek tek count ile hesapla
    let sonuclar: Array<{
      tablo: string
      label: string
      kayit: number
      boyut_bytes: number
      boyut_label: string
      doluluk: number
      durum: 'normal' | 'uyari' | 'kritik'
    }> = []

    if (boyutErr || !boyutData) {
      // Fallback: count + tahmini boyut (satır başı ~500 byte ortalama)
      const countPromises = ARSIV_TABLOLARI.map(async ({ tablo, label }) => {
        const { count } = await admin.from(tablo).select('id', { count: 'exact', head: true })
        const kayit = count ?? 0
        const boyut_bytes = kayit * 500 // tahmini
        const doluluk = Math.round((boyut_bytes / DB_LIMIT_BYTES) * 100 * 10) / 10
        return {
          tablo, label, kayit, boyut_bytes,
          boyut_label: formatBytes(boyut_bytes),
          doluluk,
          durum: (doluluk >= 10 ? 'kritik' : doluluk >= 5 ? 'uyari' : 'normal') as 'normal' | 'uyari' | 'kritik',
        }
      })
      sonuclar = await Promise.all(countPromises)
    } else {
      // RPC başarılı — gerçek boyut verileri
      const boyutMap = new Map<string, { total_bytes: number; row_count: number }>()
      for (const row of boyutData) {
        boyutMap.set(row.table_name, { total_bytes: Number(row.total_bytes), row_count: Math.max(0, Number(row.row_count)) })
      }

      for (const { tablo, label } of ARSIV_TABLOLARI) {
        const info = boyutMap.get(tablo) ?? { total_bytes: 0, row_count: 0 }
        const doluluk = Math.round((info.total_bytes / DB_LIMIT_BYTES) * 100 * 10) / 10
        sonuclar.push({
          tablo, label,
          kayit: info.row_count,
          boyut_bytes: info.total_bytes,
          boyut_label: formatBytes(info.total_bytes),
          doluluk,
          durum: doluluk >= 10 ? 'kritik' : doluluk >= 5 ? 'uyari' : 'normal',
        })
      }
    }

    const toplamBytes = sonuclar.reduce((s, r) => s + r.boyut_bytes, 0)
    const toplamKayit = sonuclar.reduce((s, r) => s + r.kayit, 0)
    const genelDoluluk = Math.round((toplamBytes / DB_LIMIT_BYTES) * 100 * 10) / 10

    return NextResponse.json({
      ok: true,
      genel: {
        toplam_kayit: toplamKayit,
        toplam_bytes: toplamBytes,
        toplam_label: formatBytes(toplamBytes),
        doluluk: genelDoluluk,
        durum: genelDoluluk >= 10 ? 'kritik' : genelDoluluk >= 5 ? 'uyari' : 'normal',
        db_limit: '8 GB',
        db_limit_label: formatBytes(DB_LIMIT_BYTES),
      },
      tablolar: sonuclar,
    })
  } catch (err) {
    console.error('[arsiv-kapasite] Hata:', err)
    return NextResponse.json({ ok: false, error: 'query_error' }, { status: 500 })
  }
}
