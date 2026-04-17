import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/arsiv/kapasite
 *
 * Arşiv tablolarının doluluk oranlarını döner.
 * Supabase Pro: 8GB database limiti.
 * Her arşiv tablosu için makul kayıt limitleri belirlendi.
 */

// Tablo başına maksimum kayıt limitleri
// Supabase 8GB DB — tahmini satır başı boyut × limit ≈ toplam ~4GB arşiv alanı
const KAPASITE_LIMITLERI: Record<string, { limit: number; label: string }> = {
  canli_gorevler_arsiv:              { limit: 500_000, label: 'Frekansiyel Görevler' },
  personel_mesai_kayitlari_arsiv:    { limit: 200_000, label: 'Personel Mesai' },
  musteri_degerlendirmeleri_arsiv:    { limit: 100_000, label: 'Müşteri Değerlendirmeleri' },
  gorevler_arsiv:                    { limit: 200_000, label: 'Spesifik Görevler' },
  checklist_sonuc_basliklari_arsiv:  { limit: 300_000, label: 'Çeklist Başlıkları' },
  checklist_sonuc_maddeleri_arsiv:   { limit: 1_000_000, label: 'Çeklist Maddeleri' },
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
    const tablolar = Object.keys(KAPASITE_LIMITLERI)
    const sonuclar: Array<{
      tablo: string
      label: string
      kayit: number
      limit: number
      doluluk: number
      durum: 'normal' | 'uyari' | 'kritik'
    }> = []

    // Paralel count sorguları
    const countPromises = tablolar.map(async (tablo) => {
      const { count, error } = await admin
        .from(tablo)
        .select('id', { count: 'exact', head: true })

      return { tablo, count: error ? 0 : (count ?? 0) }
    })

    const counts = await Promise.all(countPromises)

    let toplamKayit = 0
    let toplamLimit = 0

    for (const { tablo, count } of counts) {
      const conf = KAPASITE_LIMITLERI[tablo]
      const doluluk = Math.round((count / conf.limit) * 100)
      const durum = doluluk >= 90 ? 'kritik' : doluluk >= 70 ? 'uyari' : 'normal'

      toplamKayit += count
      toplamLimit += conf.limit

      sonuclar.push({
        tablo,
        label: conf.label,
        kayit: count,
        limit: conf.limit,
        doluluk,
        durum,
      })
    }

    const genelDoluluk = Math.round((toplamKayit / toplamLimit) * 100)

    return NextResponse.json({
      ok: true,
      genel: {
        toplam_kayit: toplamKayit,
        toplam_limit: toplamLimit,
        doluluk: genelDoluluk,
        durum: genelDoluluk >= 90 ? 'kritik' : genelDoluluk >= 70 ? 'uyari' : 'normal',
        db_limit: '8 GB (Supabase Pro)',
      },
      tablolar: sonuclar,
    })
  } catch (err) {
    console.error('[arsiv-kapasite] Hata:', err)
    return NextResponse.json({ ok: false, error: 'query_error' }, { status: 500 })
  }
}
