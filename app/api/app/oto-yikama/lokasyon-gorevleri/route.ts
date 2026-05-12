/**
 * GET /api/app/oto-yikama/lokasyon-gorevleri?lokasyon_id=...
 *
 * Personel bir lokasyonun QR'ını okutunca app bu endpoint'i çağırır.
 * O lokasyona açılmış tüm açık + işlemdeki yıkama görevlerini plaka + araç
 * bilgisi ile birlikte döner. Atama yok — QR'ı okutan herkes görür ve yapar.
 *
 * Header: X-Device-Token
 *
 * Filtre:
 *   - lokasyon device'ın firmasıyla aynı firma olmalı
 *   - durum IN ('ACIK', 'ISLEMDE')
 *   - hedef_tarih <= bugün (geçmişe kalan açık görevler de görünür —
 *     personel kaçırdığını da yapabilsin)
 *
 * Bu lokasyona hiç yıkama görevi açılmamışsa boş liste döner (404 değil) —
 * mobil tarafı "yıkama görevi yok" mesajı gösterir.
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

  // Lokasyon firma uyumu — başka firmanın lokasyonuna görev sızdırma
  const { data: lok } = await admin
    .from('lokasyonlar')
    .select('id, tanim, firma_id, aktif')
    .eq('id', lokasyonId)
    .maybeSingle()
  if (!lok || lok.firma_id !== user.firmaId) {
    return NextResponse.json({ ok: false, error: 'Lokasyon bulunamadı' }, { status: 404, headers: CORS_HEADERS })
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
    .eq('lokasyon_id', lokasyonId)
    .eq('firma_id', user.firmaId)
    .in('durum', ['ACIK', 'ISLEMDE'])
    .lte('hedef_tarih', bugunStr)
    .order('hedef_tarih', { ascending: true })
    .order('plaka_snapshot', { ascending: true })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS })
  }

  return NextResponse.json({
    ok: true,
    lokasyon: { id: lok.id, tanim: lok.tanim },
    gorevler: gorevler ?? [],
  }, { headers: CORS_HEADERS })
}
