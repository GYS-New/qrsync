/**
 * POST /api/app/oto-yikama/gorev-iptal
 *
 * Görev IPTAL'e geçer. Personel sebep belirtmek zorunda (örn. "Araç yok",
 * "Hava şartları"). İptal sonrası görev tekrar açılmaz; yönetici yeniden
 * görev oluşturur.
 *
 * Body: { gorev_id, sebep }
 * Header: X-Device-Token
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
  const sebep = String(body.sebep ?? '').trim()
  if (!gorevId) {
    return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400, headers: CORS_HEADERS })
  }
  if (!sebep) {
    return NextResponse.json({ ok: false, error: 'İptal sebebi gerekli' }, { status: 400, headers: CORS_HEADERS })
  }

  const admin = createAdminClient()

  const { data: gorev } = await admin
    .from('yikama_gorevleri')
    .select('id, firma_id, durum')
    .eq('id', gorevId)
    .single()

  if (!gorev) {
    return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404, headers: CORS_HEADERS })
  }
  if (gorev.firma_id !== user.firmaId) {
    return NextResponse.json({ ok: false, error: 'Görev başka firmaya ait' }, { status: 403, headers: CORS_HEADERS })
  }
  if (gorev.durum === 'TAMAMLANDI') {
    return NextResponse.json({ ok: false, error: 'Tamamlanmış görev iptal edilemez' }, { status: 400, headers: CORS_HEADERS })
  }
  if (gorev.durum === 'IPTAL') {
    return NextResponse.json({ ok: true, idempotent: true }, { headers: CORS_HEADERS })
  }

  const { data: updated, error } = await admin
    .from('yikama_gorevleri')
    .update({
      durum: 'IPTAL',
      tamamlayan_id: user.userId,
      tamamlanma_tarihi: new Date().toISOString(),
      iptal_sebep: sebep.slice(0, 500),
    })
    .eq('id', gorevId)
    .in('durum', ['ACIK', 'ISLEMDE'])
    .select()
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: CORS_HEADERS })
  }

  return NextResponse.json({ ok: true, gorev: updated }, { headers: CORS_HEADERS })
}
