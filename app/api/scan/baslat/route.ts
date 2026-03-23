/**
 * POST /api/scan/baslat
 * Süreli görevlerde görevi başlatır (ACIK → ISLEMDE + baslatilma_tarihi set)
 * Body: { gorev_id, kaynak: 'gorevler'|'canli_gorevler' }
 * Auth: X-Device-Token header (mobil) VEYA oturum (web)
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function POST(req: Request) {
  try {
    const admin = createAdminClient()
    let userId: string | null = null

    // ── Auth: Device Token (mobil) VEYA session (web) ─────────────────────
    const deviceToken = req.headers.get('X-Device-Token')
    if (deviceToken) {
      const { data: dt } = await admin
        .from('device_tokens')
        .select('user_id, aktif')
        .eq('device_token', deviceToken)
        .single()
      if (!dt?.aktif) return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
      userId = dt.user_id
    } else {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return NextResponse.json({ ok: false, error: 'Oturum bulunamadı' }, { status: 401, headers: CORS })
      userId = user.id
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400, headers: CORS })
    }

    const { gorev_id, kaynak } = body
    if (!gorev_id || !kaynak) {
      return NextResponse.json({ ok: false, error: 'gorev_id ve kaynak gerekli' }, { status: 400, headers: CORS })
    }

    const nowIso = new Date().toISOString()

    const { data: gorev } = await admin
      .from(kaynak)
      .select('id, firma_id, durum, atanan_kullanici_id, baslatilma_tarihi')
      .eq('id', gorev_id)
      .single()

    if (!gorev) return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404, headers: CORS })

    // Zaten başlatılmışsa tekrar başlatmaya gerek yok
    if (gorev.baslatilma_tarihi) {
      return NextResponse.json({
        ok: true,
        mesaj: 'Zaten başlatılmış',
        baslatilma_tarihi: gorev.baslatilma_tarihi,
      }, { headers: CORS })
    }

    const updatePayload: any = {
      baslatilma_tarihi: nowIso,
      baslatan_kullanici_id: userId,
      durum_degisim_tarihi: nowIso,
    }
    if (kaynak === 'gorevler') updatePayload.durum = 'ISLEMDE'
    if (kaynak === 'canli_gorevler') updatePayload.durum = 'ISLEMDE'

    const { error: updErr } = await admin.from(kaynak).update(updatePayload).eq('id', gorev_id)
    if (updErr) throw new Error(updErr.message)

    return NextResponse.json({ ok: true, mesaj: 'Görev başlatıldı', baslatilma_tarihi: nowIso }, { headers: CORS })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
