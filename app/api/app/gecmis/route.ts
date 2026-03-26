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
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })

  const admin = createAdminClient()

  // Manuel görevler (gorevler tablosu)
  // islemi_yapan_id VEYA atanan_kullanici_id eşleşenler
  const { data: gorevler } = await admin
    .from('gorevler')
    .select('id, tanim, durum, tamamlanma_tarihi, durum_degisim_tarihi, lokasyon_id, lokasyonlar(tanim), islemi_yapan_id, atanan_kullanici_id')
    .or(`islemi_yapan_id.eq.${user.id},atanan_kullanici_id.eq.${user.id}`)
    .in('durum', ['TAMAMLANDI', 'ZAMANI_GECMIS', 'ZAMANINDA_YAPILAMAYAN'])
    .order('durum_degisim_tarihi', { ascending: false })
    .limit(30)

  // Canlı görevler (canli_gorevler tablosu)
  const { data: canliGorevler } = await admin
    .from('canli_gorevler')
    .select('id, tanim, durum, tamamlanma_tarihi, durum_degisim_tarihi, lokasyon_id, lokasyonlar(tanim), islemi_yapan_id, atanan_kullanici_id')
    .or(`islemi_yapan_id.eq.${user.id},atanan_kullanici_id.eq.${user.id}`)
    .in('durum', ['TAMAMLANDI', 'ZAMANINDA_TAMAMLANDI', 'ZAMANI_GECMIS', 'ZAMANINDA_YAPILAMAYAN'])
    .order('durum_degisim_tarihi', { ascending: false })
    .limit(30)

  // İkisini birleştir ve tarihe göre sırala
  const tumGorevler = [
    ...(gorevler ?? []).map((g: any) => ({
      id: g.id,
      tanim: g.tanim,
      durum: g.durum,
      tarih: g.tamamlanma_tarihi || g.durum_degisim_tarihi,
      lokasyon: g.lokasyonlar?.tanim || '',
      tip: 'manuel',
    })),
    ...(canliGorevler ?? []).map((g: any) => ({
      id: g.id,
      tanim: g.tanim,
      durum: g.durum,
      tarih: g.tamamlanma_tarihi || g.durum_degisim_tarihi,
      lokasyon: g.lokasyonlar?.tanim || '',
      tip: 'canli',
    })),
  ].sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime())
   .slice(0, 50)

  return NextResponse.json({ ok: true, gorevler: tumGorevler }, { headers: CORS_HEADERS })
}
