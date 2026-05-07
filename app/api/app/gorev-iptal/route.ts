import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { gorevDurumPayload } from '@/lib/gorev/durum-degistir'
import { iptalSebepKontrol } from '@/lib/validation/iptalSebep'

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

    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401, headers: CORS })
    }

    const { data: tokenData } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, proje_id, isim_soyisim')
      .eq('device_token', deviceToken)
      .single()

    if (!tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
    }

    const { user_id: userId, firma_id: firmaId } = tokenData

    const { data: userData } = await admin.from('users').select('aktif').eq('id', userId).single()
    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF' },
        { status: 403, headers: CORS }
      )
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400, headers: CORS })
    }

    const gorevId      = body?.gorev_id as string | undefined
    const gorevTipi    = (body?.gorev_tipi as string | undefined) ?? 'gorevler'

    if (!gorevId) {
      return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400, headers: CORS })
    }
    if (!['gorevler', 'canli_gorevler'].includes(gorevTipi)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz gorev_tipi' }, { status: 400, headers: CORS })
    }

    const sebepCheck = iptalSebepKontrol(body?.iptal_sebep)
    if (!sebepCheck.ok) {
      return NextResponse.json(
        { ok: false, error: sebepCheck.mesaj, code: sebepCheck.kod },
        { status: 400, headers: CORS }
      )
    }
    const iptalSebep = sebepCheck.sebep

    const { data: gorev, error: gorevErr } = await admin
      .from(gorevTipi)
      .select('id, firma_id, durum, atanan_kullanici_id, tanim, lokasyon_id')
      .eq('id', gorevId)
      .single()

    if (gorevErr || !gorev) {
      return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404, headers: CORS })
    }

    if (gorev.firma_id !== firmaId) {
      return NextResponse.json({ ok: false, error: 'Bu göreve erişim yetkiniz yok' }, { status: 403, headers: CORS })
    }

    if (gorev.atanan_kullanici_id && gorev.atanan_kullanici_id !== userId) {
      return NextResponse.json({ ok: false, error: 'Bu görev size atanmış değil' }, { status: 403, headers: CORS })
    }

    const iptalEdilebilir = ['ACIK', 'ISLEMDE', 'BEKLEMEDE'].includes(gorev.durum)
    if (!iptalEdilebilir) {
      return NextResponse.json(
        { ok: false, error: `Görev zaten ${gorev.durum} durumunda — iptal edilemez`, code: 'IPTAL_EDILEMEZ' },
        { status: 409, headers: CORS }
      )
    }

    const nowIso = new Date().toISOString()

    const { error: updateErr } = await admin
      .from(gorevTipi)
      .update(gorevDurumPayload('IPTAL', 'MOBIL', {
        at: nowIso,
        iptal_sebep: iptalSebep,
        ek: { islemi_yapan_id: userId },
      }) as any)
      .eq('id', gorevId)

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500, headers: CORS })
    }

    await admin
      .from('device_tokens')
      .update({ son_kullanim: nowIso })
      .eq('device_token', deviceToken)

    await auditLog({
      tip: 'gorev_iptal_manuel',
      tablo: gorevTipi,
      firma_id: firmaId,
      kullanici_id: userId,
      detay: {
        gorev_id: gorevId,
        gorev_tipi: gorevTipi,
        gorev_tanim: gorev.tanim ?? null,
        lokasyon_id: gorev.lokasyon_id ?? null,
        onceki_durum: gorev.durum,
        iptal_sebep: iptalSebep,
        kanal: 'MOBIL',
      },
    })

    return NextResponse.json({
      ok: true,
      mesaj: 'Görev iptal edildi',
      gorev_id: gorevId,
      gorev_tipi: gorevTipi,
      durum: 'IPTAL',
      iptal_sebep: iptalSebep,
      iptal_tarihi: nowIso,
    }, { headers: CORS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
