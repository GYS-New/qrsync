/**
 * GET /api/app/aktif-gorev
 * Mobil — kullanıcının şu an aktif (ISLEMDE) görevini döner.
 * Header: X-Device-Token
 *
 * Response:
 *   { ok: true, gorev: { id, tanim, gorev_tipi, lokasyon, baslatilma_tarihi } }
 *   { ok: true, gorev: null }  — aktif görev yok
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function GET(req: Request) {
  const admin = createAdminClient()

  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) {
    return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401, headers: CORS })
  }

  const { data: tokenData } = await admin
    .from('device_tokens')
    .select('user_id, firma_id')
    .eq('device_token', deviceToken)
    .eq('aktif', true)
    .single()

  if (!tokenData) {
    return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
  }

  const { user_id: userId, firma_id: firmaId } = tokenData

  // Frekansiyel görevlerde ISLEMDE olan
  const { data: canliGorev } = await admin
    .from('canli_gorevler')
    .select('id, tanim, baslatilma_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .eq('firma_id', firmaId)
    .eq('durum', 'ISLEMDE')
    .or(`atanan_kullanici_id.eq.${userId},islemi_yapan_id.eq.${userId},baslatan_kullanici_id.eq.${userId}`)
    .order('baslatilma_tarihi', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (canliGorev) {
    return NextResponse.json({
      ok: true,
      gorev: {
        id: canliGorev.id,
        tanim: canliGorev.tanim,
        gorev_tipi: 'canli_gorevler',
        lokasyon: (canliGorev.lokasyonlar as any)?.tanim ?? null,
        baslatilma_tarihi: canliGorev.baslatilma_tarihi,
      },
    }, { headers: CORS })
  }

  // Spesifik görevlerde ISLEMDE olan
  const { data: spesifikGorev } = await admin
    .from('gorevler')
    .select('id, tanim, baslatilma_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .eq('firma_id', firmaId)
    .eq('durum', 'ISLEMDE')
    .or(`atanan_kullanici_id.eq.${userId},islemi_yapan_id.eq.${userId}`)
    .order('baslatilma_tarihi', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (spesifikGorev) {
    return NextResponse.json({
      ok: true,
      gorev: {
        id: spesifikGorev.id,
        tanim: spesifikGorev.tanim,
        gorev_tipi: 'gorevler',
        lokasyon: (spesifikGorev.lokasyonlar as any)?.tanim ?? null,
        baslatilma_tarihi: spesifikGorev.baslatilma_tarihi,
      },
    }, { headers: CORS })
  }

  // Aktif görev yok
  return NextResponse.json({ ok: true, gorev: null }, { headers: CORS })
}
