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
  const sonYirmiDortSaat = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // 1. Tamamlanan manuel görevler (son 24 saat)
  const { data: gorevler } = await admin
    .from('gorevler')
    .select('id, tanim, durum, tamamlanma_tarihi, durum_degisim_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .or(`islemi_yapan_id.eq.${user.id},atanan_kullanici_id.eq.${user.id}`)
    .eq('durum', 'TAMAMLANDI')
    .gte('tamamlanma_tarihi', sonYirmiDortSaat)
    .order('tamamlanma_tarihi', { ascending: false })
    .limit(50)

  // 2. Tamamlanan canlı görevler (son 24 saat)
  const { data: canliGorevler } = await admin
    .from('canli_gorevler')
    .select('id, tanim, durum, tamamlanma_tarihi, durum_degisim_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .or(`islemi_yapan_id.eq.${user.id},atanan_kullanici_id.eq.${user.id}`)
    .in('durum', ['TAMAMLANDI', 'ZAMANINDA_TAMAMLANDI', 'ZAMANI_GECMIS', 'ZAMANINDA_YAPILAMAYAN'])
    .gte('durum_degisim_tarihi', sonYirmiDortSaat)
    .order('durum_degisim_tarihi', { ascending: false })
    .limit(50)

  // 3. Aktif/açık atanmış görevler (henüz tamamlanmamış)
  const { data: aktifGorevler } = await admin
    .from('gorevler')
    .select('id, tanim, durum, olusturma_tarihi, durum_degisim_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .eq('atanan_kullanici_id', user.id)
    .in('durum', ['ACIK', 'ISLEMDE'])
    .order('olusturma_tarihi', { ascending: false })
    .limit(20)

  // 4. Aktif/açık atanmış canlı görevler
  const { data: aktifCanliGorevler } = await admin
    .from('canli_gorevler')
    .select('id, tanim, durum, olusturma_tarihi, durum_degisim_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .eq('atanan_kullanici_id', user.id)
    .in('durum', ['ACIK', 'ISLEMDE', 'BEKLEMEDE'])
    .order('olusturma_tarihi', { ascending: false })
    .limit(20)

  // Birleştir ve sırala
  const tamamlananlar = [
    ...(gorevler ?? []).map((g: any) => ({
      id: g.id,
      tanim: g.tanim,
      durum: g.durum,
      tarih: g.tamamlanma_tarihi || g.durum_degisim_tarihi,
      lokasyon: g.lokasyonlar?.tanim || '',
      tip: 'manuel',
      kategori: 'tamamlanan',
    })),
    ...(canliGorevler ?? []).map((g: any) => ({
      id: g.id,
      tanim: g.tanim,
      durum: g.durum,
      tarih: g.tamamlanma_tarihi || g.durum_degisim_tarihi,
      lokasyon: g.lokasyonlar?.tanim || '',
      tip: 'canli',
      kategori: 'tamamlanan',
    })),
  ].sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime())

  const bekleyenler = [
    ...(aktifGorevler ?? []).map((g: any) => ({
      id: g.id,
      tanim: g.tanim,
      durum: g.durum,
      tarih: g.olusturma_tarihi || g.durum_degisim_tarihi,
      lokasyon: g.lokasyonlar?.tanim || '',
      tip: 'manuel',
      kategori: 'bekleyen',
    })),
    ...(aktifCanliGorevler ?? []).map((g: any) => ({
      id: g.id,
      tanim: g.tanim,
      durum: g.durum,
      tarih: g.olusturma_tarihi || g.durum_degisim_tarihi,
      lokasyon: g.lokasyonlar?.tanim || '',
      tip: 'canli',
      kategori: 'bekleyen',
    })),
  ].sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime())

  return NextResponse.json({
    ok: true,
    gorevler: [...bekleyenler, ...tamamlananlar],
  }, { headers: CORS_HEADERS })
}
