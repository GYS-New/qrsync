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

    // 24 saat öncesinin ISO tarihi — bu sınırdan yeni tamamlananlar hâlâ görevlerimde görünür
    const sinir24s = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Spesifik görevler (gorevler tablosu) — atanan_kullanici_id = userId
    // Aktif (ACIK/ISLEMDE) + son 24 saat içinde tamamlananlar
    const { data: gorevler } = await admin
      .from('gorevler')
      .select(`
        id, tanim, durum, olusturma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
        lokasyonlar ( id, tanim, ust_tanim:parent_id(tanim) )
      `)
      .eq('firma_id', firmaId)
      .eq('atanan_kullanici_id', userId)
      .or(`durum.in.(ACIK,ISLEMDE),and(durum.eq.TAMAMLANDI,tamamlanma_tarihi.gt.${sinir24s})`)
      .order('olusturma_tarihi', { ascending: false })

    // Canlı görevler (canli_gorevler tablosu) — atanan_kullanici_id = userId
    // Aktif (ACIK/ISLEMDE/BEKLEMEDE) + son 24 saat içinde tamamlananlar
    const { data: canliGorevler } = await admin
      .from('canli_gorevler')
      .select(`
        id, tanim, durum, aktif_olma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
        lokasyonlar ( id, tanim, ust_tanim:parent_id(tanim) )
      `)
      .eq('firma_id', firmaId)
      .eq('atanan_kullanici_id', userId)
      .or(`durum.in.(ACIK,ISLEMDE,BEKLEMEDE),and(durum.in.(TAMAMLANDI,ZAMANINDA_TAMAMLANDI),tamamlanma_tarihi.gt.${sinir24s})`)
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
        id:                  g.id,
        tanim:               g.tanim,
        durum:               g.durum,
        gorev_tipi:          'gorevler',
        olusturma_tarihi:    g.olusturma_tarihi,
        baslatilma_tarihi:   g.baslatilma_tarihi,
        tamamlanma_tarihi:   g.tamamlanma_tarihi ?? null,
        lokasyon:            g.lokasyonlar
          ? { id: g.lokasyonlar.id, tanim: g.lokasyonlar.tanim, ust_tanim: g.lokasyonlar.ust_tanim?.tanim ?? null }
          : null,
      })),
      canli_gorevler: (canliGorevler ?? []).map((g: any) => ({
        id:                  g.id,
        tanim:               g.tanim,
        durum:               g.durum,
        gorev_tipi:          'canli_gorevler',
        olusturma_tarihi:    g.aktif_olma_tarihi,
        baslatilma_tarihi:   g.baslatilma_tarihi,
        tamamlanma_tarihi:   g.tamamlanma_tarihi ?? null,
        lokasyon:            g.lokasyonlar
          ? { id: g.lokasyonlar.id, tanim: g.lokasyonlar.tanim, ust_tanim: g.lokasyonlar.ust_tanim?.tanim ?? null }
          : null,
      })),
    })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
