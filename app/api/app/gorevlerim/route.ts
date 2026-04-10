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
      .select('user_id, firma_id, isim_soyisim, proje_id')
      .eq('device_token', deviceToken)
      .single()

    if (tokenErr || !tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token', kod: 'ESLESMEDI' }, { status: 401 })
    }

    const { user_id: userId, firma_id: firmaId, proje_id: personelProjeId } = tokenData

    // ── Kullanıcı aktif/pasif kontrolü ──────────────────────────────────────
    const { data: userData } = await admin.from('users').select('aktif').eq('id', userId).single()
    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF' },
        { status: 403 }
      )
    }

    // ── Mesai kontrolü (sadece proje bazlı) ─────────────────────────────────
    {
      let personelTakibiAktif = false
      if (personelProjeId) {
        const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', personelProjeId).single()
        personelTakibiAktif = proje?.personel_takibi_aktif === true
      }
      if (personelTakibiAktif) {
        const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const { data: mesai } = await admin
          .from('personel_mesai_kayitlari')
          .select('id')
          .eq('user_id', userId)
          .eq('kayit_tarihi', bugun)
          .is('cikis_saati', null)
          .maybeSingle()
        if (!mesai) {
          return NextResponse.json(
            { ok: false, error: 'Lütfen önce iş başı QR/NFC kodunu okutunuz.', code: 'MESAI_YOK' },
            { status: 403 }
          )
        }
      }
    }

    // 24 saat öncesinin ISO tarihi — bu sınırdan yeni tamamlananlar hâlâ görevlerimde görünür
    const sinir24s = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Spesifik + canlı görevleri paralel çek
    const [gorevlerRes, canliGorevlerRes] = await Promise.all([
      admin.from('gorevler').select(`
        id, tanim, durum, olusturma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
        lokasyonlar ( id, tanim, checklist_sablon_id, ust_tanim:parent_id(tanim) )
      `).eq('firma_id', firmaId).eq('atanan_kullanici_id', userId)
        .or(`durum.in.(ACIK,ISLEMDE),and(durum.eq.TAMAMLANDI,tamamlanma_tarihi.gt.${sinir24s})`)
        .order('olusturma_tarihi', { ascending: false }),
      admin.from('canli_gorevler').select(`
        id, tanim, durum, aktif_olma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
        lokasyonlar ( id, tanim, checklist_sablon_id, ust_tanim:parent_id(tanim) )
      `).eq('firma_id', firmaId).eq('atanan_kullanici_id', userId)
        .or(`durum.in.(ACIK,ISLEMDE,BEKLEMEDE),and(durum.in.(TAMAMLANDI,ZAMANINDA_TAMAMLANDI),tamamlanma_tarihi.gt.${sinir24s})`)
        .order('aktif_olma_tarihi', { ascending: false })
        .limit(10000),
    ])

    const gorevler      = gorevlerRes.data ?? []
    const canliGorevler = canliGorevlerRes.data ?? []

    // ── Çeklist şablonlarını batch yükle ────────────────────────────────────
    const tumGorevler = [...gorevler, ...canliGorevler] as any[]
    const sablonIdler = [...new Set(
      tumGorevler.map((g: any) => g.lokasyonlar?.checklist_sablon_id).filter(Boolean)
    )] as string[]

    // sablon_id → { baslik, versiyon, maddeler[] } map'i
    const sablonMap = new Map<string, any>()
    if (sablonIdler.length > 0) {
      const [sablonlarRes, maddelerRes] = await Promise.all([
        admin.from('checklist_sablonlari')
          .select('id,baslik,versiyon')
          .in('id', sablonIdler),
        admin.from('checklist_sablon_maddeleri')
          .select('id,sablon_id,sira_no,baslik,zorunlu_cevap,gorsel_gerekli,checklist_madde_secenekleri(id,deger,sira_no,aciklama_gerekli)')
          .in('sablon_id', sablonIdler)
          .order('sira_no', { ascending: true }),
      ])

      for (const s of sablonlarRes.data ?? []) {
        sablonMap.set(s.id, {
          id:       s.id,
          baslik:   s.baslik,
          versiyon: s.versiyon ?? 1,
          maddeler: [],
        })
      }
      for (const m of (maddelerRes.data ?? []) as any[]) {
        const s = sablonMap.get(m.sablon_id)
        if (!s) continue
        s.maddeler.push({
          id:             m.id,
          sira_no:        m.sira_no ?? 0,
          baslik:         m.baslik ?? '',
          zorunlu_cevap:  m.zorunlu_cevap !== false,
          gorsel_gerekli: !!m.gorsel_gerekli,
          secenekler: ((m.checklist_madde_secenekleri ?? []) as any[])
            .sort((a: any, b: any) => (a.sira_no ?? 0) - (b.sira_no ?? 0))
            .map((o: any) => ({ deger: o.deger as string, aciklama_gerekli: o.aciklama_gerekli === true })),
        })
      }
    }

    function buildChecklist(lok: any) {
      if (!lok?.checklist_sablon_id) return null
      return sablonMap.get(lok.checklist_sablon_id) ?? null
    }

    // ── Cihaz son kullanım ───────────────────────────────────────────────────
    await admin.from('device_tokens')
      .update({ son_kullanim: new Date().toISOString() })
      .eq('device_token', deviceToken)

    return NextResponse.json({
      ok: true,
      kullanici: {
        id:           userId,
        isim_soyisim: tokenData.isim_soyisim,
        firma_id:     firmaId,
      },
      gorevler: gorevler.map((g: any) => ({
        id:               g.id,
        tanim:            g.tanim,
        durum:            g.durum,
        gorev_tipi:       'gorevler',
        olusturma_tarihi: g.olusturma_tarihi,
        baslatilma_tarihi: g.baslatilma_tarihi,
        tamamlanma_tarihi: g.tamamlanma_tarihi ?? null,
        lokasyon: g.lokasyonlar
          ? { id: g.lokasyonlar.id, tanim: g.lokasyonlar.tanim, ust_tanim: g.lokasyonlar.ust_tanim?.tanim ?? null }
          : null,
        checklist: buildChecklist(g.lokasyonlar),
      })),
      canli_gorevler: canliGorevler.map((g: any) => ({
        id:               g.id,
        tanim:            g.tanim,
        durum:            g.durum,
        gorev_tipi:       'canli_gorevler',
        olusturma_tarihi: g.aktif_olma_tarihi,
        baslatilma_tarihi: g.baslatilma_tarihi,
        tamamlanma_tarihi: g.tamamlanma_tarihi ?? null,
        lokasyon: g.lokasyonlar
          ? { id: g.lokasyonlar.id, tanim: g.lokasyonlar.tanim, ust_tanim: g.lokasyonlar.ust_tanim?.tanim ?? null }
          : null,
        checklist: buildChecklist(g.lokasyonlar),
      })),
    })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
