/**
 * GET /api/app/oto-yikama/istasyon-gorevleri?lokasyon_id=...
 *
 * Personel istasyondaki QR'ı okutunca app bu endpoint'i çağırır.
 * O istasyondaki açık + işlemdeki yıkama görevlerini plaka + araç bilgisi
 * ile birlikte döner.
 *
 * Header: X-Device-Token
 *
 * Filtre:
 *   - lokasyon, yıkama istasyonu olarak işaretli olmalı (yikama_istasyonlari)
 *   - istasyon device'ın firmasıyla aynı firma olmalı
 *   - durum IN ('ACIK', 'ISLEMDE')
 *   - hedef_tarih <= bugün (geçmişe kalan açık görevler de görünür —
 *     personel kaçırdığını da yapabilsin)
 *
 * Plaka snapshot kullanıldığı için araç pasifleşse bile görev listede görünür.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { CORS_HEADERS, getDeviceUser, isOtoYikamaAktif } from '../_helpers'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(req: Request) {
  const user = await getDeviceUser(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz', kod: 'ESLESMEDI' }, { status: 401, headers: CORS_HEADERS })
  }

  if (!(await isOtoYikamaAktif(user.firmaId))) {
    return NextResponse.json({ ok: false, error: 'Oto Yıkama modülü kapalı' }, { status: 403, headers: CORS_HEADERS })
  }

  const url = new URL(req.url)
  const lokasyonId = url.searchParams.get('lokasyon_id')
  if (!lokasyonId) {
    return NextResponse.json({ ok: false, error: 'lokasyon_id gerekli' }, { status: 400, headers: CORS_HEADERS })
  }

  const admin = createAdminClient()

  // Lokasyon → istasyon kaydı (aktif olmalı)
  const { data: istasyon } = await admin
    .from('yikama_istasyonlari')
    .select('id, ad, firma_id, aktif')
    .eq('lokasyon_id', lokasyonId)
    .eq('firma_id', user.firmaId)
    .maybeSingle()

  if (!istasyon) {
    return NextResponse.json({ ok: false, error: 'Bu lokasyon bir yıkama istasyonu değil', kod: 'ISTASYON_YOK' }, { status: 404, headers: CORS_HEADERS })
  }
  if (!istasyon.aktif) {
    return NextResponse.json({ ok: false, error: 'İstasyon pasif durumda', kod: 'ISTASYON_PASIF' }, { status: 403, headers: CORS_HEADERS })
  }

  // Bugün ve geçmişteki açık + işlemdeki görevler
  const bugun = new Date()
  const bugunStr = `${bugun.getFullYear()}-${String(bugun.getMonth() + 1).padStart(2, '0')}-${String(bugun.getDate()).padStart(2, '0')}`

  const { data: gorevler, error } = await admin
    .from('yikama_gorevleri')
    .select(`
      id, hedef_tarih, durum, plaka_snapshot,
      baslatan_id, baslatilma_tarihi,
      arac:araclar(id, plaka, marka, model, renk, departman, kullanici_adi_soyadi, kullanici_telefon)
    `)
    .eq('istasyon_id', istasyon.id)
    .in('durum', ['ACIK', 'ISLEMDE'])
    .lte('hedef_tarih', bugunStr)
    .order('hedef_tarih', { ascending: true })
    .order('plaka_snapshot', { ascending: true })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS })
  }

  return NextResponse.json({
    ok: true,
    istasyon: { id: istasyon.id, ad: istasyon.ad },
    gorevler: gorevler ?? [],
  }, { headers: CORS_HEADERS })
}
