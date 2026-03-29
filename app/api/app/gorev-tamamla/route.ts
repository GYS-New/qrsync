import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

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

    const { data: tokenData, error: tokenErr } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, isim_soyisim')
      .eq('device_token', deviceToken)
      .single()

    if (tokenErr || !tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
    }

    const { user_id: userId, firma_id: firmaId } = tokenData

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400, headers: CORS })
    }

    const gorevId   = body?.gorev_id as string | undefined
    const gorevTipi = (body?.gorev_tipi as string | undefined) ?? 'gorevler'
    const maddeler  = body?.maddeler ?? []

    if (!gorevId) {
      return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400, headers: CORS })
    }
    if (!['gorevler', 'canli_gorevler'].includes(gorevTipi)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz gorev_tipi' }, { status: 400, headers: CORS })
    }

    const nowIso = new Date().toISOString()

    const { data: gorev, error: gorevErr } = await admin
      .from(gorevTipi)
      .select('id, firma_id, durum, atanan_kullanici_id, baslatilma_tarihi, lokasyon_id')
      .eq('id', gorevId)
      .single()

    if (gorevErr || !gorev) {
      return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404, headers: CORS })
    }

    // checklist_sablon_id lokasyondan okunur
    let checklistSablonId: string | null = null
    if (gorev.lokasyon_id && maddeler?.length > 0) {
      const { data: lok } = await admin
        .from('lokasyonlar')
        .select('checklist_sablon_id')
        .eq('id', gorev.lokasyon_id)
        .single()
      checklistSablonId = lok?.checklist_sablon_id ?? null
    }

    if (gorev.firma_id !== firmaId) {
      return NextResponse.json({ ok: false, error: 'Bu göreve erişim yetkiniz yok' }, { status: 403, headers: CORS })
    }

    if (gorev.atanan_kullanici_id && gorev.atanan_kullanici_id !== userId) {
      return NextResponse.json({ ok: false, error: 'Bu görev size atanmış değil' }, { status: 403, headers: CORS })
    }

    const tamamlanabilir = gorevTipi === 'gorevler'
      ? ['ACIK', 'ISLEMDE'].includes(gorev.durum)
      : ['ACIK', 'ISLEMDE', 'BEKLEMEDE'].includes(gorev.durum)

    if (!tamamlanabilir) {
      return NextResponse.json({ ok: false, error: `Görev zaten ${gorev.durum} durumunda` }, { status: 409, headers: CORS })
    }

    // Çeklist: mobil uygulama checklist_cevaplari yazar; raporlar ise checklist_sonuc_basliklari okur
    // (QR/Web = scan/tamamla bu tablolara yazar). Her iki tabloyu da doldur ki Çeklist Raporu görünsün.
    if (maddeler && maddeler.length > 0 && checklistSablonId) {
      let templateVersion = 1
      const { data: sablonMeta } = await admin
        .from('checklist_sablonlari')
        .select('versiyon')
        .eq('id', checklistSablonId)
        .maybeSingle()
      templateVersion = sablonMeta?.versiyon ?? 1

      const sonucPayload: any = {
        lokasyon_id:      gorev.lokasyon_id,
        sablon_id:        checklistSablonId,
        template_version: templateVersion,
        kanal:            'MOBİL',
        kullanici_id:     userId,
      }
      if (gorevTipi === 'gorevler') sonucPayload.gorev_id = gorevId
      else sonucPayload.canli_gorev_id = gorevId

      const { data: sonucRow, error: sonucErr } = await admin
        .from('checklist_sonuc_basliklari')
        .insert(sonucPayload)
        .select('id')
        .single()

      if (sonucErr || !sonucRow) {
        console.error('[gorev-tamamla] checklist_sonuc_basliklari:', sonucErr)
        return NextResponse.json({ ok: false, error: 'Çeklist rapor kaydı oluşturulamadı: ' + (sonucErr?.message ?? '') }, { status: 500, headers: CORS })
      }

      const maddeRows = maddeler.map((m: any) => ({
        sonuc_id:       sonucRow.id,
        madde_id:       m.madde_id,
        secenek_degeri: m.secenek_degeri ?? null,
        aciklama:       typeof m.aciklama === 'string' ? m.aciklama.trim() || null : m.aciklama ?? null,
        gorsel_url:     m.gorsel_url ?? null,
      }))
      const { error: maddeErr } = await admin.from('checklist_sonuc_maddeleri').insert(maddeRows)
      if (maddeErr) {
        console.error('[gorev-tamamla] checklist_sonuc_maddeleri:', maddeErr)
        await admin.from('checklist_sonuc_basliklari').delete().eq('id', sonucRow.id)
        return NextResponse.json({ ok: false, error: 'Çeklist maddeleri kaydedilemedi: ' + maddeErr.message }, { status: 500, headers: CORS })
      }

      const cevaplar = maddeler.map((m: any) => ({
        gorev_id:        gorevId,
        gorev_tipi:      gorevTipi,
        sablon_id:       checklistSablonId,
        madde_id:        m.madde_id,
        secenek_degeri:  m.secenek_degeri ?? null,
        aciklama:        m.aciklama ?? null,
        gorsel_url:      m.gorsel_url ?? null,
        user_id:         userId,
        firma_id:        firmaId,
        yanitlayan_id:   userId,
      }))

      const { error: cevapErr } = await admin
        .from('checklist_cevaplari')
        .insert(cevaplar)

      if (cevapErr) {
        await admin.from('checklist_sonuc_maddeleri').delete().eq('sonuc_id', sonucRow.id)
        await admin.from('checklist_sonuc_basliklari').delete().eq('id', sonucRow.id)
        return NextResponse.json({ ok: false, error: 'Çeklist kaydedilemedi: ' + cevapErr.message }, { status: 500, headers: CORS })
      }
    }

    let sureSaniye: number | null = null
    if (gorev.baslatilma_tarihi) {
      const ms = new Date(nowIso).getTime() - new Date(gorev.baslatilma_tarihi).getTime()
      sureSaniye = Math.max(0, Math.floor(ms / 1000))
    }

    const { error: updateErr } = await admin
      .from(gorevTipi)
      .update({
        durum:                    'TAMAMLANDI',
        durum_degisim_tarihi:     nowIso,
        tamamlanma_tarihi:        nowIso,
        tamamlanma_suresi_saniye: sureSaniye,
        islemi_yapan_id:          userId,
        son_tamamlama_kanali:     'MOBIL',
      } as any)
      .eq('id', gorevId)

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500, headers: CORS })
    }

    await admin
      .from('device_tokens')
      .update({ son_kullanim: nowIso })
      .eq('device_token', deviceToken)

    return NextResponse.json({
      ok: true,
      mesaj: 'Görev başarıyla tamamlandı',
      gorev_id: gorevId,
      gorev_tipi: gorevTipi,
      tamamlanma_tarihi: nowIso,
    }, { headers: CORS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
