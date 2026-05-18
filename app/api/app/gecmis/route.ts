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

  // 1. Spesifik görevler — kullanıcıya atanmış VEYA bu kullanıcı tarafından
  //    tamamlanmış (Oto Yıkama gibi açık spesifik görevler atanan_kullanici_id
  //    NULL ile açılır, QR okutan personel tamamlar — onlar da geçmişte görünmeli)
  const { data: gorevler } = await admin
    .from('gorevler')
    .select('id, tanim, durum, tamamlanma_tarihi, durum_degisim_tarihi, olusturma_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .or(`atanan_kullanici_id.eq.${user.id},islemi_yapan_id.eq.${user.id}`)
    .gte('olusturma_tarihi', sonYirmiDortSaat)
    .order('olusturma_tarihi', { ascending: false })
    .limit(50)

  // 2. Frekansiyel görevler — tamamlayan_kullanici_id ile sorgula, son 24 saat
  const { data: canliGorevler } = await admin
    .from('canli_gorevler')
    .select('id, tanim, durum, tamamlanma_tarihi, durum_degisim_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .eq('tamamlayan_kullanici_id', user.id)
    .eq('durum', 'TAMAMLANDI')
    .gte('tamamlanma_tarihi', sonYirmiDortSaat)
    .order('tamamlanma_tarihi', { ascending: false })
    .limit(50)

  // 3. Aktif bekleyen frekansiyel görevler yok — sadece spesifik görevler bekleyende görünür
  const aktifGorevler: any[] = []
  const aktifCanliGorevler: any[] = []

  // 4. Oto Yıkama metadata (km/notlar/foto) — gorevler içindekiler için
  const spesifikGorevIds = (gorevler ?? []).map((g: any) => g.id)
  const otoMetaMap = new Map<string, { km: number | null; notlar: string | null; foto_oncesi_url: string | null; foto_sonrasi_url: string | null; ekstra: boolean; plaka_snapshot: string | null }>()
  if (spesifikGorevIds.length > 0) {
    const { data: otoMeta } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('gorev_id, plaka_snapshot, ekstra, km, notlar, foto_oncesi_url, foto_sonrasi_url')
      .in('gorev_id', spesifikGorevIds)
    for (const m of (otoMeta ?? []) as any[]) {
      otoMetaMap.set(m.gorev_id, {
        km: m.km ?? null,
        notlar: m.notlar ?? null,
        foto_oncesi_url: m.foto_oncesi_url ?? null,
        foto_sonrasi_url: m.foto_sonrasi_url ?? null,
        ekstra: !!m.ekstra,
        plaka_snapshot: m.plaka_snapshot ?? null,
      })
    }
  }

  // Spesifik görevleri kategorize et
  const spesifikTamamlanan = (gorevler ?? []).filter((g: any) => g.durum === 'TAMAMLANDI')
  const spesifikBekleyen = (gorevler ?? []).filter((g: any) => ['ACIK', 'ISLEMDE'].includes(g.durum))
  const spesifikDiger = (gorevler ?? []).filter((g: any) => !['TAMAMLANDI', 'ACIK', 'ISLEMDE'].includes(g.durum))

  function withOtoMeta(g: any) {
    const meta = otoMetaMap.get(g.id)
    if (!meta) return null
    return {
      oto_yikama: true,
      plaka: meta.plaka_snapshot,
      ekstra: meta.ekstra,
      km: meta.km,
      notlar: meta.notlar,
      foto_oncesi_url: meta.foto_oncesi_url,
      foto_sonrasi_url: meta.foto_sonrasi_url,
    }
  }

  const tamamlananlar = [
    ...spesifikTamamlanan.map((g: any) => ({
      id: g.id, tanim: g.tanim, durum: g.durum,
      tarih: g.tamamlanma_tarihi || g.durum_degisim_tarihi,
      lokasyon: g.lokasyonlar?.tanim || '', tip: 'manuel', kategori: 'tamamlanan',
      ...(withOtoMeta(g) ?? {}),
    })),
    ...(canliGorevler ?? []).map((g: any) => ({
      id: g.id, tanim: g.tanim, durum: g.durum,
      tarih: g.tamamlanma_tarihi || g.durum_degisim_tarihi,
      lokasyon: g.lokasyonlar?.tanim || '', tip: 'canli', kategori: 'tamamlanan',
    })),
  ].sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime())

  const bekleyenler = [
    ...spesifikBekleyen.map((g: any) => ({
      id: g.id, tanim: g.tanim, durum: g.durum,
      tarih: g.olusturma_tarihi || g.durum_degisim_tarihi,
      lokasyon: g.lokasyonlar?.tanim || '', tip: 'manuel', kategori: 'bekleyen',
      ...(withOtoMeta(g) ?? {}),
    })),
    ...spesifikDiger.map((g: any) => ({
      id: g.id, tanim: g.tanim, durum: g.durum,
      tarih: g.olusturma_tarihi || g.durum_degisim_tarihi,
      lokasyon: g.lokasyonlar?.tanim || '', tip: 'manuel', kategori: 'tamamlanan',
      ...(withOtoMeta(g) ?? {}),
    })),
  ].sort((a, b) => new Date(b.tarih || 0).getTime() - new Date(a.tarih || 0).getTime())

  return NextResponse.json({
    ok: true,
    gorevler: [...bekleyenler, ...tamamlananlar],
  }, { headers: CORS_HEADERS })
}
