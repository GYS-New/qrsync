/**
 * POST /api/app/oto-yikama/gorev-basla
 *
 * Personel plaka seçince çağrılır. Görev ACIK → ISLEMDE'ye geçer.
 *
 * Body: { gorev_id }
 * Header: X-Device-Token
 *
 * İdempotent: zaten ISLEMDE ise hata vermez, mevcut baslatan/baslatilma_tarihi
 * korunur (sadece görev bilgisi döner).
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
  if (!gorevId) {
    return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400, headers: CORS_HEADERS })
  }

  const admin = createAdminClient()

  const { data: gorev } = await admin
    .from('yikama_gorevleri')
    .select('id, firma_id, durum, baslatan_id, baslatilma_tarihi')
    .eq('id', gorevId)
    .single()

  if (!gorev) {
    return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404, headers: CORS_HEADERS })
  }
  if (gorev.firma_id !== user.firmaId) {
    return NextResponse.json({ ok: false, error: 'Görev başka firmaya ait' }, { status: 403, headers: CORS_HEADERS })
  }

  // İdempotent davranış
  if (gorev.durum === 'ISLEMDE') {
    return NextResponse.json({ ok: true, gorev, idempotent: true }, { headers: CORS_HEADERS })
  }
  if (gorev.durum !== 'ACIK') {
    return NextResponse.json({ ok: false, error: `Görev ${gorev.durum} durumda; başlatılamaz` }, { status: 400, headers: CORS_HEADERS })
  }

  const { data: updated, error } = await admin
    .from('yikama_gorevleri')
    .update({
      durum: 'ISLEMDE',
      baslatan_id: user.userId,
      baslatilma_tarihi: new Date().toISOString(),
    })
    .eq('id', gorevId)
    .eq('durum', 'ACIK')  // race condition guard
    .select()
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS })
  }

  return NextResponse.json({ ok: true, gorev: updated }, { headers: CORS_HEADERS })
}
