/**
 * POST /api/app/oto-yikama/gorev-tamamla
 *
 * Görev TAMAMLANDI'ya geçer + araç.son_yikama_tarihi güncellenir (periyot
 * hesabı için). Yıkama bittikten sonra çağrılır.
 *
 * Body: { gorev_id, notlar? }
 * Header: X-Device-Token
 *
 * Esneklik: ACIK durumdayken de tamamlanabilir (personel start adımını
 * atlamış olabilir). Tamamlanma anında baslatilma_tarihi boşsa olusturma'dan
 * sayılır, doluysa onu kullanır.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { CORS_HEADERS, getDeviceUser, isOtoYikamaAktif } from '../_helpers'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: Request) {
  const user = await getDeviceUser(req)
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401, headers: CORS_HEADERS })
  }
  if (!(await isOtoYikamaAktif(user.firmaId))) {
    return NextResponse.json({ ok: false, error: 'Oto Yıkama modülü kapalı' }, { status: 403, headers: CORS_HEADERS })
  }

  const body = await req.json().catch(() => ({}))
  const gorevId = body.gorev_id
  const notlar = body.notlar?.toString().trim() || null
  if (!gorevId) {
    return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400, headers: CORS_HEADERS })
  }

  const admin = createAdminClient()

  const { data: gorev } = await admin
    .from('yikama_gorevleri')
    .select('id, firma_id, arac_id, durum')
    .eq('id', gorevId)
    .single()

  if (!gorev) {
    return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404, headers: CORS_HEADERS })
  }
  if (gorev.firma_id !== user.firmaId) {
    return NextResponse.json({ ok: false, error: 'Görev başka firmaya ait' }, { status: 403, headers: CORS_HEADERS })
  }
  if (gorev.durum === 'TAMAMLANDI') {
    return NextResponse.json({ ok: true, idempotent: true }, { headers: CORS_HEADERS })
  }
  if (gorev.durum === 'IPTAL') {
    return NextResponse.json({ ok: false, error: 'İptal edilmiş görev tamamlanamaz' }, { status: 400, headers: CORS_HEADERS })
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await admin
    .from('yikama_gorevleri')
    .update({
      durum: 'TAMAMLANDI',
      tamamlayan_id: user.userId,
      tamamlanma_tarihi: now,
      notlar,
    })
    .eq('id', gorevId)
    .in('durum', ['ACIK', 'ISLEMDE'])  // race-condition guard
    .select()
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS })
  }

  // Yan etki: aracın son yıkama tarihini güncelle (sonraki periyot hesabı)
  // Hata olursa görevi geri almıyoruz — yıkama yapıldı, sadece tarih takibi best-effort
  admin
    .from('araclar')
    .update({ son_yikama_tarihi: now })
    .eq('id', gorev.arac_id)
    .then(() => {})

  return NextResponse.json({ ok: true, gorev: updated }, { headers: CORS_HEADERS })
}
