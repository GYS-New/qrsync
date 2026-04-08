/**
 * GET /api/scan/context?token=...&kanal=QR|NFC
 * Authenticated user session ile çalışır (admin client bypass RLS).
 * QR/NFC token'a göre lokasyon, görevler ve çeklist şablonunu döndürür.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Oturum bulunamadı' }, { status: 401 })

    const { data: me } = await supabase
      .from('users')
      .select('id,isim_soyisim,firma_id,rol,aktif')
      .eq('id', user.id)
      .single()
    if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

    // Pasif kullanıcı kontrolü
    if (me.aktif === false) {
      return NextResponse.json({ ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF' }, { status: 403 })
    }

    const p     = new URL(req.url).searchParams
    const token = p.get('token')
    const kanal = p.get('kanal') as 'QR' | 'NFC'
    if (!token || !kanal) return NextResponse.json({ ok: false, error: 'token ve kanal gerekli' }, { status: 400 })

    const admin = createAdminClient()

    // ── Lokasyonu bul ────────────────────────────────────────────────────────
    let lokasyon: any = null
    if (kanal === 'NFC') {
      const { data } = await admin.from('lokasyonlar').select('*').eq('nfc_token', token).maybeSingle()
      lokasyon = data
    } else {
      const { data: byQr } = await admin.from('lokasyonlar').select('*').eq('qr_veri', token).maybeSingle()
      lokasyon = byQr
      if (!lokasyon) {
        const { data: byId } = await admin.from('lokasyonlar').select('*').eq('qr_id', token).maybeSingle()
        lokasyon = byId
      }
    }
    if (!lokasyon) return NextResponse.json({ ok: false, error: 'Lokasyon bulunamadı' }, { status: 404 })
    if (!lokasyon.aktif) return NextResponse.json({ ok: false, error: 'Lokasyon aktif değil' }, { status: 403 })

    // Firma yetki kontrolü
    if (me.firma_id && lokasyon.firma_id !== me.firma_id &&
        me.rol !== 'super_admin' && me.rol !== 'alt_super_admin') {
      return NextResponse.json({ ok: false, error: 'Bu lokasyona erişim yetkiniz yok' }, { status: 403 })
    }

    // Firma aktif + lisans kontrolü
    const { data: firma } = await admin.from('firmalar').select('aktif,qr_sistemi_aktif,nfc_sistemi_aktif,lisans_gecerlilik_tarihi,personel_takibi_aktif').eq('id', lokasyon.firma_id).single()
    if (!firma?.aktif) return NextResponse.json({ ok: false, error: 'Firma aktif değil' }, { status: 403 })
    if (kanal === 'QR'  && firma.qr_sistemi_aktif  === false) return NextResponse.json({ ok: false, error: 'QR sistemi aktif değil' }, { status: 403 })
    if (kanal === 'NFC' && firma.nfc_sistemi_aktif === false) return NextResponse.json({ ok: false, error: 'NFC sistemi aktif değil' }, { status: 403 })
    if (firma.lisans_gecerlilik_tarihi && new Date(firma.lisans_gecerlilik_tarihi) < new Date()) {
      return NextResponse.json({ ok: false, error: 'Firma lisansı süresi dolmuş' }, { status: 403 })
    }

    // ── Görevleri çek ────────────────────────────────────────────────────────
    const [manualRes, liveRes] = await Promise.all([
      admin.from('gorevler')
        .select('id,tanim,durum,atanan_kullanici_id,olusturma_tarihi,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye')
        .eq('lokasyon_id', lokasyon.id)
        .in('durum', ['ACIK', 'ISLEMDE']),
      admin.from('canli_gorevler')
        .select('id,tanim,durum,atanan_kullanici_id,olusturma_tarihi,baslatilma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye')
        .eq('lokasyon_id', lokasyon.id)
        .in('durum', ['ACIK', 'BEKLEMEDE']),
    ])

    const spesifik = ((manualRes.data ?? []) as any[])
      .filter(t => !t.atanan_kullanici_id || t.atanan_kullanici_id === me.id)
      .map(t => ({ ...t, kaynak: 'gorevler' as const }))

    const frekansiyel = ((liveRes.data ?? []) as any[])
      .filter(t => !t.atanan_kullanici_id || t.atanan_kullanici_id === me.id)
      .map(t => ({ ...t, kaynak: 'canli_gorevler' as const }))

    const gorevler = [...spesifik, ...frekansiyel]

    // ── Çeklist şablonunu yükle ──────────────────────────────────────────────
    let sablon: any = null
    const sablonId = lokasyon.checklist_sablon_id ?? null
    if (sablonId) {
      const { data: sablonRow } = await admin
        .from('checklist_sablonlari')
        .select('id,baslik,tanim,versiyon')
        .eq('id', sablonId)
        .maybeSingle()

      if (sablonRow) {
        const { data: itemRows } = await admin
          .from('checklist_sablon_maddeleri')
          .select('id,sira_no,baslik,zorunlu_cevap,aciklama_gerekli_yapilamadi,gorsel_gerekli,checklist_madde_secenekleri(id,deger,sira_no,aciklama_gerekli)')
          .eq('sablon_id', sablonId)
          .order('sira_no', { ascending: true })

        sablon = {
          id: sablonRow.id,
          baslik: (sablonRow as any).baslik,
          tanim:  (sablonRow as any).tanim,
          versiyon: (sablonRow as any).versiyon ?? 1,
          maddeler: ((itemRows ?? []) as any[]).map(row => ({
            id:      row.id,
            sira_no: row.sira_no ?? 0,
            baslik:  row.baslik ?? '',
            zorunlu_cevap:                row.zorunlu_cevap !== false,
            aciklama_gerekli_yapilamadi:  row.aciklama_gerekli_yapilamadi !== false,
            gorsel_gerekli:               !!row.gorsel_gerekli,
            secenekler: (() => {
              const opts = ((row.checklist_madde_secenekleri ?? []) as any[])
                .sort((a: any, b: any) => (a.sira_no ?? 0) - (b.sira_no ?? 0))
                .map((opt: any) => ({ id: opt.id, deger: opt.deger, sira_no: opt.sira_no ?? 0, aciklama_gerekli: opt.aciklama_gerekli === true }))
              return opts.length > 0 ? opts : [
                { id: '', deger: 'EVET', sira_no: 1, aciklama_gerekli: false },
                { id: '', deger: 'HAYIR', sira_no: 2, aciklama_gerekli: false },
              ]
            })(),
          })),
        }
      }
    }

    return NextResponse.json({
      ok: true,
      lokasyon: {
        id: lokasyon.id,
        tanim: lokasyon.tanim,
        aciklama: lokasyon.aciklama,
        firma_id: lokasyon.firma_id,
        sureli_gorev_aktif: !!lokasyon.sureli_gorev_aktif,
      },
      kullanici: { id: me.id, isim_soyisim: me.isim_soyisim, firma_id: me.firma_id },
      gorevler,
      sablon,
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    })
  } catch (err: any) {
    console.error('[scan/context]', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
