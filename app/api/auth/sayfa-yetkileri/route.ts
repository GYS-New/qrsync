/**
 * GET /api/auth/sayfa-yetkileri
 * Kullanıcının erişebildiği sayfa kodlarını döner.
 * SA her zaman tüm sayfaları görebilir.
 * Diğer roller için: önce firma bazlı kayıt, yoksa global kayıt, o da yoksa → açık (true).
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const TÜM_SAYFA_KODLARI = [
  'firmalar', 'projeler', 'kullanicilar', 'lokasyonlar', 'lokasyon-gruplari',
  'gorevler', 'checklist-sablonlari', 'canli-islemler', 'tum-gorevler', 'arsiv',
  'personel-takibi', 'raporlar', 'musteri-degerlendirme',
]

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: me } = await supabase
      .from('users')
      .select('id,rol,firma_id')
      .eq('id', authUser.id)
      .single()
    if (!me) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

    // SA her zaman her şeyi görebilir
    if (me.rol === 'super_admin' || me.rol === 'alt_super_admin') {
      const map: Record<string, boolean> = {}
      TÜM_SAYFA_KODLARI.forEach(k => { map[k] = true })
      return NextResponse.json({ ok: true, gorebilir: map }, {
        headers: { 'Cache-Control': 'private, max-age=30' },
      })
    }

    const admin = createAdminClient()

    // Firma bazlı + global kayıtları tek sorguda çek
    const sorguFirmaId = me.firma_id ?? null

    // Firma bazlı kayıtlar (öncelikli)
    const firmaRows = sorguFirmaId
      ? (await admin
          .from('kullanici_grubu_yetkileri')
          .select('sayfa_kodu,gorebilir')
          .eq('firma_id', sorguFirmaId)
          .eq('rol', me.rol)).data ?? []
      : []

    // Global kayıtlar (fallback)
    const globalRows = (await admin
      .from('kullanici_grubu_yetkileri')
      .select('sayfa_kodu,gorebilir')
      .is('firma_id', null)
      .eq('rol', me.rol)).data ?? []

    // Firma bazlı map
    const firmaMap: Record<string, boolean> = {}
    for (const r of firmaRows) {
      firmaMap[r.sayfa_kodu] = r.gorebilir === true
    }

    // Global map
    const globalMap: Record<string, boolean> = {}
    for (const r of globalRows) {
      globalMap[r.sayfa_kodu] = r.gorebilir === true
    }

    // Sonuç: firma bazlı varsa onu kullan, yoksa global, o da yoksa true (açık)
    const gorebilir: Record<string, boolean> = {}
    for (const kod of TÜM_SAYFA_KODLARI) {
      if (kod in firmaMap) {
        gorebilir[kod] = firmaMap[kod]
      } else if (kod in globalMap) {
        gorebilir[kod] = globalMap[kod]
      } else {
        gorebilir[kod] = true // kayıt yoksa açık
      }
    }

    return NextResponse.json({ ok: true, gorebilir }, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
