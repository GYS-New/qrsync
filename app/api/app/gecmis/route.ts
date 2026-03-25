import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

async function getAuthUser(req: Request) {
  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('device_tokens')
    .select('user_id, aktif')
    .eq('device_token', deviceToken)
    .single()
  if (data?.aktif) return { id: data.user_id }
  return null
}

export async function GET(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required', kod: 'ESLESMEDI' }, { status: 401, headers: CORS_HEADERS })

  const admin = createAdminClient()

  // 24 saat öncesinin sınırı — bu tarihten önce tamamlananlar arşive taşınmış sayılır
  const sinir24s = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Manuel görevler (gorevler tablosu) — bu tablo hiç arşiv tablosuna taşınmaz
  const { data: gorevler } = await admin
    .from('gorevler')
    .select('id, tanim, durum, tamamlanma_tarihi, durum_degisim_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .eq('islemi_yapan_id', user.id)
    .in('durum', ['TAMAMLANDI', 'ZAMANI_GECMIS', 'ZAMANINDA_YAPILAMAYAN'])
    .lt('tamamlanma_tarihi', sinir24s)
    .order('durum_degisim_tarihi', { ascending: false })
    .limit(30)

  // Canlı görevler — aktif tablodan (24 saat dolmamış, henüz arşive taşınmamış)
  const { data: canliGorevler } = await admin
    .from('canli_gorevler')
    .select('id, tanim, durum, tamamlanma_tarihi, durum_degisim_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .eq('islemi_yapan_id', user.id)
    .in('durum', ['TAMAMLANDI', 'ZAMANINDA_TAMAMLANDI', 'ZAMANI_GECMIS', 'ZAMANINDA_YAPILAMAYAN'])
    .lt('tamamlanma_tarihi', sinir24s)
    .order('durum_degisim_tarihi', { ascending: false })
    .limit(30)

  // Canlı görevler — arşiv tablosundan (cron tarafından taşınmış frekansiyel görevler)
  const { data: canliArsiv } = await admin
    .from('canli_gorevler_arsiv')
    .select('id, tanim, durum, tamamlanma_tarihi, durum_degisim_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .eq('islemi_yapan_id', user.id)
    .in('durum', ['TAMAMLANDI', 'ZAMANINDA_TAMAMLANDI', 'ZAMANI_GECMIS', 'ZAMANINDA_YAPILAMAYAN'])
    .order('durum_degisim_tarihi', { ascending: false })
    .limit(30)

  // Üçünü birleştir, tekrar eden id'leri temizle (aktif tablo + arşiv çakışabilir), tarihe göre sırala
  const gorevMap = new Map<string, any>()

  for (const g of gorevler ?? []) {
    gorevMap.set(g.id, {
      id: g.id, tanim: g.tanim, durum: g.durum,
      tarih: g.tamamlanma_tarihi || g.durum_degisim_tarihi,
      lokasyon: (g.lokasyonlar as any)?.tanim || '',
      tip: 'manuel',
    })
  }
  for (const g of canliGorevler ?? []) {
    gorevMap.set(g.id, {
      id: g.id, tanim: g.tanim, durum: g.durum,
      tarih: g.tamamlanma_tarihi || g.durum_degisim_tarihi,
      lokasyon: (g.lokasyonlar as any)?.tanim || '',
      tip: 'canli',
    })
  }
  // Arşivden gelenler: aktif tabloda zaten yoksa ekle (çakışma koruması)
  for (const g of canliArsiv ?? []) {
    if (!gorevMap.has(g.id)) {
      gorevMap.set(g.id, {
        id: g.id, tanim: g.tanim, durum: g.durum,
        tarih: g.tamamlanma_tarihi || g.durum_degisim_tarihi,
        lokasyon: (g.lokasyonlar as any)?.tanim || '',
        tip: 'canli',
      })
    }
  }

  const tumGorevler = Array.from(gorevMap.values())
    .sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime())
    .slice(0, 50)

  return NextResponse.json({ ok: true, gorevler: tumGorevler }, { headers: CORS_HEADERS })
}
