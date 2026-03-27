/**
 * POST /api/app/gorev-tamamla
 * Mobil uygulama tarafından çağrılır.
 * Header: X-Device-Token — kayıtlı cihaz token'ı
 * Body: { gorev_id, gorev_tipi? }
 *   gorev_tipi: 'gorevler' (varsayılan) | 'canli_gorevler'
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const admin = createAdminClient()

    // ── Cihaz doğrulama ──────────────────────────────────────────────────────
    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli', kod: 'ESLESMEDI' }, { status: 401 })
    }

    const { data: tokenData, error: tokenErr } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, isim_soyisim')
      .eq('device_token', deviceToken)
      .single()

    if (tokenErr || !tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token', kod: 'ESLESMEDI' }, { status: 401 })
    }

    const { user_id: userId, firma_id: firmaId } = tokenData

    // ── İstek body ───────────────────────────────────────────────────────────
    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 })
    }

    const gorevId   = body?.gorev_id as string | undefined
    const gorevTipi = (body?.gorev_tipi as string | undefined) ?? 'gorevler'
    const maddeler  = (body?.maddeler ?? []) as {
      madde_id: string
      secenek_degeri: string | null
      aciklama: string | null
      gorsel_url: string | null
    }[]

    if (!gorevId) {
      return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400 })
    }
    if (!['gorevler', 'canli_gorevler'].includes(gorevTipi)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz gorev_tipi' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()

    // ── Görev kontrolü — önce belirtilen tabloda ara, bulamazsa diğer tabloda dene ──
    let gorev: any = null
    let gercekGorevTipi = gorevTipi

    const { data: gorev1, error: gorevErr1 } = await admin
      .from(gorevTipi)
      .select('id, firma_id, durum, atanan_kullanici_id, baslatilma_tarihi, lokasyon_id')
      .eq('id', gorevId)
      .maybeSingle()

    if (gorev1) {
      gorev = gorev1
    } else {
      // Belirtilen tabloda bulunamadı — diğer tabloyu dene
      const digerTablo = gorevTipi === 'gorevler' ? 'canli_gorevler' : 'gorevler'
      const { data: gorev2 } = await admin
        .from(digerTablo)
        .select('id, firma_id, durum, atanan_kullanici_id, baslatilma_tarihi, lokasyon_id')
        .eq('id', gorevId)
        .maybeSingle()
      if (gorev2) {
        gorev = gorev2
        gercekGorevTipi = digerTablo
      }
    }

    if (!gorev) {
      return NextResponse.json({
        ok: false,
        error: 'Görev bulunamadı',
        debug: { gorevTipi, gorevId, dbError: gorevErr1?.message ?? null }
      }, { status: 404 })
    }

    // Firma güvenlik kontrolü — firmaId null ise atla (eski device_token kayıtları)
    if (firmaId && gorev.firma_id !== firmaId) {
      return NextResponse.json({ ok: false, error: 'Bu göreve erişim yetkiniz yok' }, { status: 403 })
    }

    // Atanan kullanıcı kontrolü
    if (gorev.atanan_kullanici_id && gorev.atanan_kullanici_id !== userId) {
      return NextResponse.json({ ok: false, error: 'Bu görev size atanmış değil' }, { status: 403 })
    }

    // Durum kontrolü
    const tamamlanmis = ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'KAPATILDI'].includes(gorev.durum)
    if (tamamlanmis) {
      // Zaten tamamlanmış — idempotent başarı döndür
      return NextResponse.json({ ok: true, mesaj: 'Görev zaten tamamlanmış', durum: gorev.durum, gorev_id: gorevId, gorev_tipi: gercekGorevTipi })
    }

    const tamamlanabilir = gercekGorevTipi === 'gorevler'
      ? ['ACIK', 'ISLEMDE'].includes(gorev.durum)
      : ['ACIK', 'ISLEMDE', 'BEKLEMEDE'].includes(gorev.durum)

    if (!tamamlanabilir) {
      return NextResponse.json({
        ok: false,
        error: `Görev ${gorev.durum} durumunda, tamamlanamaz`,
      }, { status: 409 })
    }

    // ── Çeklist validasyonu ──────────────────────────────────────────────────
    // Lokasyona bağlı şablon varsa zorunlu alanları kontrol et
    const { data: lokasyon } = await admin
      .from('lokasyonlar')
      .select('id,checklist_sablon_id')
      .eq('id', gorev.lokasyon_id ?? '')
      .maybeSingle()

    const sablonId = lokasyon?.checklist_sablon_id ?? null

    if (sablonId && maddeler.length > 0) {
      const { data: sablonMaddeler } = await admin
        .from('checklist_sablon_maddeleri')
        .select('id,zorunlu_cevap,gorsel_gerekli,aciklama_gerekli_yapilamadi')
        .eq('sablon_id', sablonId)

      const cevapMap = new Map(maddeler.map(m => [m.madde_id, m]))
      const eksikler: string[] = []

      for (const sm of sablonMaddeler ?? []) {
        const c = cevapMap.get(sm.id)
        if (sm.zorunlu_cevap !== false && !c?.secenek_degeri) {
          eksikler.push(sm.id)
        }
        if (sm.gorsel_gerekli && !c?.gorsel_url) {
          eksikler.push(sm.id)
        }
        const yapilamadi = (c?.secenek_degeri ?? '').toLowerCase().includes('yapılamad')
          || (c?.secenek_degeri ?? '').toLowerCase().includes('yapilamad')
        if (yapilamadi && sm.aciklama_gerekli_yapilamadi !== false && !c?.aciklama?.trim()) {
          eksikler.push(sm.id)
        }
      }

      if (eksikler.length > 0) {
        return NextResponse.json({
          ok: false,
          error: 'Zorunlu çeklist alanları eksik',
          eksik_madde_idler: eksikler,
        }, { status: 422 })
      }
    }

    // ── Süre hesaplama ───────────────────────────────────────────────────────
    let sureSaniye: number | null = null
    if (gorev.baslatilma_tarihi) {
      const ms = new Date(nowIso).getTime() - new Date(gorev.baslatilma_tarihi).getTime()
      sureSaniye = Math.max(0, Math.floor(ms / 1000))
    }

    // ── Görevi tamamla ───────────────────────────────────────────────────────
    const { error: updateErr } = await admin
      .from(gercekGorevTipi)
      .update({
        durum:                    'TAMAMLANDI',
        durum_degisim_tarihi:     nowIso,
        tamamlanma_tarihi:        nowIso,
        tamamlanma_suresi_saniye: sureSaniye,
        islemi_yapan_id:          userId,
      } as any)
      .eq('id', gorevId)

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 })
    }

    // ── Çeklist cevaplarını kaydet ───────────────────────────────────────────
    if (sablonId && maddeler.length > 0) {
      const { data: sablon } = await admin
        .from('checklist_sablonlari')
        .select('versiyon')
        .eq('id', sablonId)
        .maybeSingle()

      const gorevIdKolonu = gercekGorevTipi === 'gorevler' ? 'gorev_id' : 'canli_gorev_id'
      const insertPayload: any = {
        kullanici_id:     userId,
        kanal:            'APP',
        lokasyon_id:      lokasyon?.id ?? null,
        sablon_id:        sablonId,
        template_version: sablon?.versiyon ?? 1,
      }
      insertPayload[gorevIdKolonu] = gorevId

      const { data: sonucBaslik } = await admin
        .from('checklist_sonuc_basliklari')
        .insert(insertPayload)
        .select('id')
        .single()

      if (sonucBaslik) {
        const doldurulanlar = maddeler.filter(m => m.secenek_degeri || m.aciklama || m.gorsel_url)
        if (doldurulanlar.length > 0) {
          await admin.from('checklist_sonuc_maddeleri').insert(
            doldurulanlar.map(m => ({
              sonuc_id:       sonucBaslik.id,
              madde_id:       m.madde_id,
              secenek_degeri: m.secenek_degeri || null,
              aciklama:       m.aciklama?.trim() || null,
              gorsel_url:     m.gorsel_url || null,
            }))
          )
        }
      }
    }

    // ── Cihaz son kullanım güncelle ──────────────────────────────────────────
    await admin
      .from('device_tokens')
      .update({ son_kullanim: nowIso })
      .eq('device_token', deviceToken)

    return NextResponse.json({
      ok: true,
      mesaj: 'Görev başarıyla tamamlandı',
      gorev_id: gorevId,
      gorev_tipi: gercekGorevTipi,
      tamamlanma_tarihi: nowIso,
    })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
