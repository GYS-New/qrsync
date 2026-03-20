/**
 * GET /api/app/gorevlerim
 * Mobil — giriş yapmış personelin aktif görevleri
 * Header: X-Device-Token
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const admin = createAdminClient()

    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401 })
    }

    const { data: tokenData, error: tokenErr } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, isim_soyisim')
      .eq('device_token', deviceToken)
      .single()

    if (tokenErr || !tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401 })
    }

    const { user_id: userId, firma_id: firmaId } = tokenData

    // Spesifik görevler (gorevler tablosu) — atanan_kullanici_id = userId
    const { data: gorevler } = await admin
      .from('gorevler')
      .select(`
        id, tanim, durum, olusturma_tarihi, baslatilma_tarihi,
        lokasyonlar ( id, tanim, ust_tanim:parent_id(tanim) )
      `)
      .eq('firma_id', firmaId)
      .eq('atanan_kullanici_id', userId)
      .in('durum', ['ACIK', 'ISLEMDE'])
      .order('olusturma_tarihi', { ascending: false })

    // Canlı görevler (canli_gorevler tablosu) — atanan_kullanici_id = userId
    const { data: canliGorevler } = await admin
      .from('canli_gorevler')
      .select(`
        id, tanim, durum, aktif_olma_tarihi, baslatilma_tarihi,
        lokasyonlar ( id, tanim, ust_tanim:parent_id(tanim) )
      `)
      .eq('firma_id', firmaId)
      .eq('atanan_kullanici_id', userId)
      .in('durum', ['ACIK', 'ISLEMDE'])
      .order('aktif_olma_tarihi', { ascending: false })

    // ── Cihaz son kullanım ───────────────────────────────────────────────────
    await admin
      .from('device_tokens')
      .update({ son_kullanim: new Date().toISOString() })
      .eq('device_token', deviceToken)

    return NextResponse.json({
      ok: true,
      kullanici: {
        id:            userId,
        isim_soyisim:  tokenData.isim_soyisim,
        firma_id:      firmaId,
      },
      gorevler: (gorevler ?? []).map((g: any) => ({
        id:                g.id,
        tanim:             g.tanim,
        durum:             g.durum,
        gorev_tipi:        'gorevler',
        olusturma_tarihi:  g.olusturma_tarihi,
        baslatilma_tarihi: g.baslatilma_tarihi,
        lokasyon:          g.lokasyonlar
          ? { id: g.lokasyonlar.id, tanim: g.lokasyonlar.tanim, ust_tanim: g.lokasyonlar.ust_tanim?.tanim ?? null }
          : null,
      })),
      canli_gorevler: (canliGorevler ?? []).map((g: any) => ({
        id:                g.id,
        tanim:             g.tanim,
        durum:             g.durum,
        gorev_tipi:        'canli_gorevler',
        olusturma_tarihi:  g.aktif_olma_tarihi,
        baslatilma_tarihi: g.baslatilma_tarihi,
        lokasyon:          g.lokasyonlar
          ? { id: g.lokasyonlar.id, tanim: g.lokasyonlar.tanim, ust_tanim: g.lokasyonlar.ust_tanim?.tanim ?? null }
          : null,
      })),
    })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
