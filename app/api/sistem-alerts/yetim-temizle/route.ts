import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sistem-alerts/yetim-temizle
 *
 * Görevi silinmiş yetim çeklist başlıklarını + bağlı maddelerini temizler.
 * Sadece super_admin / alt_super_admin yetkili.
 *
 * Dönüş: { ok, silinen: { aktif_baslik, aktif_madde, arsiv_baslik, arsiv_madde, toplam_baslik, toplam_madde } }
 */
export async function POST(_req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) {
    return NextResponse.json({ error: 'Yetkisiz — sadece super admin' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('temizle_yetim_ceklist_basliklari')
  if (error) {
    await auditLog({
      tip: 'manuel_yetim_temizlik',
      tablo: 'checklist_sonuc_basliklari',
      kullanici_id: user.id,
      basarili: false,
      hata_mesaji: error.message,
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sonuc = (data ?? {}) as any
  const toplamBaslik = Number(sonuc.toplam_baslik_silinen ?? 0)
  const toplamMadde  = Number(sonuc.toplam_madde_silinen ?? 0)

  await auditLog({
    tip: 'manuel_yetim_temizlik',
    tablo: 'checklist_sonuc_basliklari',
    satir_sayisi: toplamBaslik,
    kullanici_id: user.id,
    detay: {
      aktif_baslik_silinen: Number(sonuc.aktif_baslik_silinen ?? 0),
      aktif_madde_silinen:  Number(sonuc.aktif_madde_silinen ?? 0),
      arsiv_baslik_silinen: Number(sonuc.arsiv_baslik_silinen ?? 0),
      arsiv_madde_silinen:  Number(sonuc.arsiv_madde_silinen ?? 0),
      toplam_baslik:        toplamBaslik,
      toplam_madde:         toplamMadde,
      silinen_aktif_ids:    (sonuc.aktif_ids ?? []).slice(0, 50),
      silinen_arsiv_ids:    (sonuc.arsiv_ids ?? []).slice(0, 50),
    },
  })

  return NextResponse.json({
    ok: true,
    silinen: {
      aktif_baslik: Number(sonuc.aktif_baslik_silinen ?? 0),
      aktif_madde:  Number(sonuc.aktif_madde_silinen ?? 0),
      arsiv_baslik: Number(sonuc.arsiv_baslik_silinen ?? 0),
      arsiv_madde:  Number(sonuc.arsiv_madde_silinen ?? 0),
      toplam_baslik: toplamBaslik,
      toplam_madde:  toplamMadde,
    },
  })
}
