/**
 * GET /api/auth/sayfa-yetkileri
 * Kullanıcının tüm sayfa yetki haritasını döner (4 boyut: gorebilir, ekleyebilir, duzenleyebilir, silebilir).
 * SA her zaman tüm sayfaları tam yetkiyle görür.
 * Öncelik: firma bazlı kayıt → global kayıt → açık (true)
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const TÜM_SAYFA_KODLARI = [
  'firmalar', 'projeler', 'kullanicilar', 'lokasyonlar', 'lokasyon-gruplari',
  'gorevler', 'checklist-sablonlari', 'canli-islemler', 'tum-gorevler', 'arsiv',
  'personel-takibi', 'raporlar', 'musteri-degerlendirme', 'birim-fiyatlar',
  'gorev-kurallari', 'ceklist-raporlari',
]

type YetkiRow = { gorebilir: boolean; ekleyebilir: boolean; duzenleyebilir: boolean; silebilir: boolean }
type YetkiMap = Record<string, YetkiRow>

const ACIK: YetkiRow = { gorebilir: true, ekleyebilir: true, duzenleyebilir: true, silebilir: true }

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
    if (!me) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

    // SA tam yetkili
    if (me.rol === 'super_admin' || me.rol === 'alt_super_admin') {
      const yetkileri: YetkiMap = {}
      TÜM_SAYFA_KODLARI.forEach(k => { yetkileri[k] = { ...ACIK } })
      return NextResponse.json({ ok: true, yetkileri }, {
        headers: { 'Cache-Control': 'private, max-age=30' },
      })
    }

    const admin = createAdminClient()
    const firmaId = me.firma_id ?? null

    const SELECT = 'sayfa_kodu,gorebilir,ekleyebilir,duzenleyebilir,silebilir'

    // Firma bazlı + global kayıtları paralel çek
    const [firmaRes, globalRes] = await Promise.all([
      firmaId
        ? admin.from('kullanici_grubu_yetkileri').select(SELECT)
            .eq('firma_id', firmaId).eq('rol', me.rol)
        : { data: [] as any[] },
      admin.from('kullanici_grubu_yetkileri').select(SELECT)
        .is('firma_id', null).eq('rol', me.rol),
    ])

    const firmaMap: Record<string, YetkiRow> = {}
    for (const r of firmaRes.data ?? []) {
      firmaMap[r.sayfa_kodu] = {
        gorebilir: r.gorebilir === true, ekleyebilir: r.ekleyebilir === true,
        duzenleyebilir: r.duzenleyebilir === true, silebilir: r.silebilir === true,
      }
    }

    const globalMap: Record<string, YetkiRow> = {}
    for (const r of globalRes.data ?? []) {
      globalMap[r.sayfa_kodu] = {
        gorebilir: r.gorebilir === true, ekleyebilir: r.ekleyebilir === true,
        duzenleyebilir: r.duzenleyebilir === true, silebilir: r.silebilir === true,
      }
    }

    const yetkileri: YetkiMap = {}
    for (const kod of TÜM_SAYFA_KODLARI) {
      if (kod in firmaMap) {
        yetkileri[kod] = firmaMap[kod]
      } else if (kod in globalMap) {
        yetkileri[kod] = globalMap[kod]
      } else {
        yetkileri[kod] = { ...ACIK }
      }
    }

    return NextResponse.json({ ok: true, yetkileri }, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
