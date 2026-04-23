/**
 * GET /api/app/vardiya-paketi
 *
 * Mobil çevrimdışı (offline) çalışma modu için vardiya snapshot endpoint'i.
 * İş başı (mesai-okut) yapıldıktan sonra cihaz tek çağrıda o vardiyada
 * ihtiyaç duyabileceği TÜM proje verisini indirir (2026-04-23 itibarıyla):
 *   - Proje'nin tüm aktif lokasyonları + QR/NFC token'ları + süre meta verisi
 *   - Proje'nin tüm açık spesifik görevleri (ACIK, ISLEMDE)
 *   - Proje'nin tüm açık canlı görevleri (ACIK, ISLEMDE, BEKLEMEDE)
 *   - Lokasyonlarda referans edilen çeklist şablonları (normalize, ayrı array)
 *   - Her lokasyon için ekstra-frekans dropdown verisi (kurallar + bugün
 *     tamamlananlar) — offline ekstra görev ekleme ekranı için
 *   - Vardiya ayarları + sunucu zamanı
 *
 * Önemli: Kullanıcı bazlı filtre YOKTUR. Sahada yardımlaşma/devir nedeniyle
 * operatörün atanmamış görevleri de görmesi gerekiyor. Lokasyon yetkisi ve
 * görev sahipliği tamamlama/iptal anında sunucuda kontrol edilir (mobil
 * yetkisiz bir gönderim yaparsa backend reddeder). Kapsam değişikliği mobil
 * ekip talebi, 2026-04-23.
 *
 * Sadece personel takibi aktif projeler için çalışır. PT pasif projelerde
 * 400 `PERSONEL_TAKIBI_KAPALI` döner; mobil bu durumda mevcut online akışını
 * kullanır.
 *
 * Header: X-Device-Token
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { bugunTRISO } from '@/lib/scan/bugunTamamlananlar'
import { aktifVardiyaAraligi } from '@/lib/scan/vardiya'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(req: Request) {
  try {
    const admin = createAdminClient()

    // ── Cihaz token ─────────────────────────────────────────────────────────
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

    const { user_id: userId, firma_id: firmaId, proje_id: personelProjeId } = tokenData

    // ── Kullanıcı aktif ─────────────────────────────────────────────────────
    const { data: userData } = await admin.from('users').select('aktif').eq('id', userId).single()
    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF' },
        { status: 403, headers: CORS }
      )
    }

    // ── Proje + personel takibi kontrolü ────────────────────────────────────
    if (!personelProjeId) {
      return NextResponse.json(
        { ok: false, error: 'Cihazın projesi tanımlı değil — offline paket yalnızca proje tanımlı cihazlar için çalışır.', code: 'PROJE_YOK' },
        { status: 400, headers: CORS }
      )
    }

    const { data: proje } = await admin
      .from('projeler')
      .select('id, ad, personel_takibi_aktif')
      .eq('id', personelProjeId)
      .single()

    if (!proje) {
      return NextResponse.json({ ok: false, error: 'Proje bulunamadı' }, { status: 404, headers: CORS })
    }

    if (proje.personel_takibi_aktif !== true) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Bu projede personel takibi aktif değil. Offline paket yalnızca personel takibi aktif projelerde çalışır — lütfen mevcut online akışı kullanın.',
          code: 'PERSONEL_TAKIBI_KAPALI',
        },
        { status: 400, headers: CORS }
      )
    }

    // ── Mesai (iş başı) kontrolü ────────────────────────────────────────────
    // TR günü — mesai-okut/gorevlerim ile aynı mantık
    const trBugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const { data: mesai } = await admin
      .from('personel_mesai_kayitlari')
      .select('id, giris_saati, kayit_tarihi')
      .eq('user_id', userId)
      .eq('kayit_tarihi', trBugun)
      .is('cikis_saati', null)
      .maybeSingle()

    if (!mesai) {
      return NextResponse.json(
        { ok: false, error: 'Offline paket için önce iş başı QR/NFC kodunu okutunuz.', code: 'MESAI_YOK' },
        { status: 403, headers: CORS }
      )
    }

    // ── Firma vardiya ayarları + aktif vardiya tespiti ──────────────────────
    const { data: firma } = await admin
      .from('firmalar')
      .select('tum_vardiya_ayarlari, vardiya_sayisi')
      .eq('id', firmaId)
      .single()

    // Şu an hangi vardiyadayız? (Mustafa 20:06'da iş başı yaparsa vardiya 3: 16:00-00:00)
    // Aktif vardiya tespit edilemezse mobil tarafı 0 görev görür (beklenen davranış —
    // ayar eksikse veya vardiya dışındaysa boş paket).
    const aktifVardiya = aktifVardiyaAraligi(
      (firma as any)?.vardiya_sayisi,
      (firma as any)?.tum_vardiya_ayarlari,
    )

    // ── Proje geneli kapsam ─────────────────────────────────────────────────
    // Önceden kullanıcı-lokasyon yetkilerine göre BFS yapılıyordu; offline sahada
    // yardımlaşma/devir senaryoları nedeniyle mobil operatörün TÜM proje verisini
    // görmesi gerekiyor (atanmamış görevler dahil). Lokasyon yetkisi ve görev
    // sahipliği tamamlama/iptal anında sunucuda kontrol edildiği için güvenli.
    // Ref: 2026-04-23 mobil ekip kapsam talebi.

    // ── Proje'nin tüm aktif lokasyonları ────────────────────────────────────
    const { data: lokRows } = await admin
      .from('lokasyonlar')
      .select('id, tanim, parent_id, qr_veri, nfc_token, tamamlama_qr_zorunlu, sureli_gorev_aktif, min_sure_dakika, max_sure_dakika, hedef_sure_dakika, aktif, checklist_sablon_id')
      .eq('firma_id', firmaId)
      .eq('proje_id', personelProjeId)
      .eq('aktif', true)
    const lokasyonlar = (lokRows ?? []) as any[]

    // ── Proje'nin aktif vardiyaya ait yapılabilir görevleri ─────────────────
    // Mobil ekip talebi (2026-04-23): Sadece şu anki vardiyaya ait + henüz
    // başlamamış (HAZIR/ACIK) görevler. Diğer vardiyaları veya ISLEMDE/BEKLEMEDE
    // durumları getirme. canli_gorevler için aktif_olma_tarihi vardiya aralığında
    // olmalı. Spesifik gorevler vardiya-bağımsız olduğundan sadece durum filtresi.
    let canliGorevlerQuery = admin.from('canli_gorevler').select(`
      id, tanim, durum, aktif_olma_tarihi, baslatilma_tarihi, tamamlanma_tarihi, lokasyon_id, atanan_kullanici_id,
      lokasyonlar ( id, tanim, checklist_sablon_id, ust_tanim:parent_id(tanim) )
    `).eq('firma_id', firmaId)
      .eq('proje_id', personelProjeId)
      .in('durum', ['HAZIR', 'ACIK'])
      .order('aktif_olma_tarihi', { ascending: false })

    if (aktifVardiya) {
      canliGorevlerQuery = canliGorevlerQuery
        .gte('aktif_olma_tarihi', aktifVardiya.baslangicISO)
        .lt('aktif_olma_tarihi', aktifVardiya.bitisISO)
    } else {
      // Aktif vardiya yoksa (ayar eksik veya vardiya dışı) boş liste döndür.
      // Bu durumda sorgu sonucu teknik olarak önemsiz, güvenlik için imkansız
      // filtre ekle (aktif_olma_tarihi = epoch 0).
      canliGorevlerQuery = canliGorevlerQuery.lt('aktif_olma_tarihi', '1970-01-01T00:00:00Z')
    }

    const [gorevlerRes, canliGorevlerRes] = await Promise.all([
      admin.from('gorevler').select(`
        id, tanim, durum, olusturma_tarihi, baslatilma_tarihi, tamamlanma_tarihi, lokasyon_id, atanan_kullanici_id,
        lokasyonlar ( id, tanim, checklist_sablon_id, ust_tanim:parent_id(tanim) )
      `).eq('firma_id', firmaId)
        .eq('proje_id', personelProjeId)
        .in('durum', ['HAZIR', 'ACIK'])
        .order('olusturma_tarihi', { ascending: false }),
      canliGorevlerQuery,
    ])

    const gorevler = (gorevlerRes.data ?? []) as any[]
    const canliGorevler = (canliGorevlerRes.data ?? []) as any[]

    // Parent tanımları — set içindeki lokasyonların parent_id'leri seti dışındaysa ekstra çek
    const parentTanimMap = new Map<string, string>()
    for (const l of lokasyonlar) {
      if (l.id && l.tanim) parentTanimMap.set(l.id, l.tanim)
    }
    const eksikParents = new Set<string>()
    for (const l of lokasyonlar) {
      if (l.parent_id && !parentTanimMap.has(l.parent_id)) eksikParents.add(l.parent_id)
    }
    if (eksikParents.size > 0) {
      const { data: parentRows } = await admin
        .from('lokasyonlar')
        .select('id, tanim')
        .in('id', [...eksikParents])
      for (const p of (parentRows ?? []) as any[]) parentTanimMap.set(p.id, p.tanim)
    }

    // ── Ekstra-frekans dropdown verisi (tüm proje lokasyonları için batch) ──
    // Mobil ekip talebi (2026-04-23): Offline modda ekstra görev ekleme ekranı
    // için her lokasyonun kuralları ve bugün tamamlanmış kural-tabanlı görevleri
    // gerekli. N lokasyon için N ayrı query yerine 3 toplu sorgu ile getirip
    // lokasyon_id bazında grupluyoruz.
    const projeLokIds = lokasyonlar.map((l: any) => l.id).filter(Boolean)
    const ekstraFrekansDropdown: Record<string, {
      kurallari: { tanim: string; adet: number }[]
      bugun_tamamlananlar: { tanim: string; adet: number }[]
    }> = {}
    if (projeLokIds.length > 0) {
      const bugunBaslangic = bugunTRISO()
      const [kuralRes, aktifRes, arsivRes] = await Promise.all([
        admin.from('gorev_kurallari')
          .select('tanim, lokasyon_id')
          .in('lokasyon_id', projeLokIds)
          .eq('aktif', true),
        admin.from('canli_gorevler')
          .select('tanim, lokasyon_id')
          .in('lokasyon_id', projeLokIds)
          .not('kural_id', 'is', null)
          .eq('durum', 'TAMAMLANDI')
          .gte('tamamlanma_tarihi', bugunBaslangic),
        admin.from('canli_gorevler_arsiv')
          .select('tanim, lokasyon_id')
          .in('lokasyon_id', projeLokIds)
          .not('kural_id', 'is', null)
          .eq('durum', 'TAMAMLANDI')
          .gte('tamamlanma_tarihi', bugunBaslangic),
      ])

      // Init entries for all project locations (boş da olsa key olsun)
      for (const id of projeLokIds) ekstraFrekansDropdown[id] = { kurallari: [], bugun_tamamlananlar: [] }

      // Kurallar — her lokasyon için distinct tanım
      const kuralMap = new Map<string, Set<string>>()
      for (const r of (kuralRes.data ?? []) as any[]) {
        const lid = r.lokasyon_id
        const t = typeof r.tanim === 'string' ? r.tanim.trim() : ''
        if (!lid || !t) continue
        if (!kuralMap.has(lid)) kuralMap.set(lid, new Set())
        kuralMap.get(lid)!.add(t)
      }
      for (const [lid, set] of kuralMap.entries()) {
        if (!ekstraFrekansDropdown[lid]) continue
        ekstraFrekansDropdown[lid].kurallari = [...set]
          .map(tanim => ({ tanim, adet: 0 }))
          .sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))
      }

      // Bugün tamamlananlar — lokasyon × tanım bazında adet
      const bugunMap = new Map<string, Map<string, number>>()
      for (const r of [...(aktifRes.data ?? []), ...(arsivRes.data ?? [])] as any[]) {
        const lid = r.lokasyon_id
        const t = typeof r.tanim === 'string' ? r.tanim.trim() : ''
        if (!lid || !t) continue
        if (!bugunMap.has(lid)) bugunMap.set(lid, new Map())
        const m = bugunMap.get(lid)!
        m.set(t, (m.get(t) ?? 0) + 1)
      }
      for (const [lid, m] of bugunMap.entries()) {
        if (!ekstraFrekansDropdown[lid]) continue
        ekstraFrekansDropdown[lid].bugun_tamamlananlar = [...m.entries()]
          .map(([tanim, adet]) => ({ tanim, adet }))
          .sort((a, b) => b.adet - a.adet)
      }
    }

    // ── Çeklist şablonları (normalize, ayrı array) ──────────────────────────
    const sablonIdSet = new Set<string>()
    for (const l of lokasyonlar) {
      if (l.checklist_sablon_id) sablonIdSet.add(l.checklist_sablon_id)
    }
    // Görevlerin lokasyonlarından da şablon ID'si gelebilir (inaktif lokasyon olsa bile
    // açık görev var olabilir — o lokasyonun şablonunu offline'da göstermek için)
    for (const g of [...gorevler, ...canliGorevler]) {
      const sid = g.lokasyonlar?.checklist_sablon_id
      if (sid) sablonIdSet.add(sid)
    }

    const checklist_sablonlari: any[] = []
    if (sablonIdSet.size > 0) {
      const [sablonlarRes, maddelerRes] = await Promise.all([
        admin.from('checklist_sablonlari')
          .select('id, baslik, versiyon')
          .in('id', [...sablonIdSet]),
        admin.from('checklist_sablon_maddeleri')
          .select('id, sablon_id, sira_no, baslik, zorunlu_cevap, gorsel_gerekli, checklist_madde_secenekleri(id, deger, sira_no, aciklama_gerekli)')
          .in('sablon_id', [...sablonIdSet])
          .order('sira_no', { ascending: true }),
      ])

      const sablonMap = new Map<string, any>()
      for (const s of (sablonlarRes.data ?? []) as any[]) {
        sablonMap.set(s.id, {
          id: s.id,
          baslik: s.baslik,
          versiyon: s.versiyon ?? 1,
          maddeler: [] as any[],
        })
      }
      for (const m of (maddelerRes.data ?? []) as any[]) {
        const s = sablonMap.get(m.sablon_id)
        if (!s) continue
        s.maddeler.push({
          id: m.id,
          sira_no: m.sira_no ?? 0,
          baslik: m.baslik ?? '',
          zorunlu_cevap: m.zorunlu_cevap !== false,
          gorsel_gerekli: !!m.gorsel_gerekli,
          secenekler: ((m.checklist_madde_secenekleri ?? []) as any[])
            .sort((a: any, b: any) => (a.sira_no ?? 0) - (b.sira_no ?? 0))
            .map((o: any) => ({ deger: o.deger as string, aciklama_gerekli: o.aciklama_gerekli === true })),
        })
      }
      for (const v of sablonMap.values()) checklist_sablonlari.push(v)
    }

    // ── Cihaz son kullanım ─────────────────────────────────────────────────
    const nowIso = new Date().toISOString()
    await admin.from('device_tokens').update({ son_kullanim: nowIso }).eq('device_token', deviceToken)

    // ── Response compose ───────────────────────────────────────────────────
    // Görevler: gorevlerim ile aynı şekil + lokasyon_id, checklist_sablon_id
    // (mobil mevcut parse logic'i sorunsuz çalışır, ek alanlar opsiyonel)
    return NextResponse.json({
      ok: true,
      sunucu_zamani: nowIso,
      kullanici: {
        id: userId,
        isim_soyisim: (tokenData as any).isim_soyisim,
        firma_id: firmaId,
        proje_id: personelProjeId,
      },
      proje: {
        id: proje.id,
        ad: proje.ad,
        personel_takibi_aktif: true,
      },
      vardiya: {
        mesai_kayit_id: (mesai as any).id,
        kayit_tarihi: (mesai as any).kayit_tarihi,
        giris_saati: (mesai as any).giris_saati,
        // Aktif vardiya tespiti — firma.tum_vardiya_ayarlari'ndan alınan
        // şu an içinde bulunulan vardiyanın meta bilgisi. Null ise ayar eksik
        // veya vardiya dışı (bu durumda canli_gorevler listesi boş gelir).
        aktif_vardiya: aktifVardiya
          ? { no: aktifVardiya.no, baslangic: aktifVardiya.baslangic, bitis: aktifVardiya.bitis }
          : null,
      },
      vardiya_ayarlari: (firma as any)?.tum_vardiya_ayarlari ?? null,
      gorevler: gorevler.map((g: any) => ({
        id:                   g.id,
        gorev_tipi:           'gorevler',
        tanim:                g.tanim,
        durum:                g.durum,
        olusturma_tarihi:     g.olusturma_tarihi,
        baslatilma_tarihi:    g.baslatilma_tarihi,
        tamamlanma_tarihi:    g.tamamlanma_tarihi ?? null,
        lokasyon_id:          g.lokasyon_id,
        atanan_kullanici_id:  g.atanan_kullanici_id ?? null,
        lokasyon: g.lokasyonlar
          ? { id: g.lokasyonlar.id, tanim: g.lokasyonlar.tanim, ust_tanim: g.lokasyonlar.ust_tanim?.tanim ?? null }
          : null,
        checklist_sablon_id: g.lokasyonlar?.checklist_sablon_id ?? null,
      })),
      canli_gorevler: canliGorevler.map((g: any) => ({
        id:                   g.id,
        gorev_tipi:           'canli_gorevler',
        tanim:                g.tanim,
        durum:                g.durum,
        olusturma_tarihi:     g.aktif_olma_tarihi,
        baslatilma_tarihi:    g.baslatilma_tarihi,
        tamamlanma_tarihi:    g.tamamlanma_tarihi ?? null,
        lokasyon_id:          g.lokasyon_id,
        atanan_kullanici_id:  g.atanan_kullanici_id ?? null,
        lokasyon: g.lokasyonlar
          ? { id: g.lokasyonlar.id, tanim: g.lokasyonlar.tanim, ust_tanim: g.lokasyonlar.ust_tanim?.tanim ?? null }
          : null,
        checklist_sablon_id: g.lokasyonlar?.checklist_sablon_id ?? null,
      })),
      lokasyonlar: lokasyonlar.map((l: any) => ({
        id:                    l.id,
        tanim:                 l.tanim,
        parent_id:             l.parent_id ?? null,
        ust_tanim:             l.parent_id ? (parentTanimMap.get(l.parent_id) ?? null) : null,
        aktif:                 l.aktif !== false,
        qr_veri:               l.qr_veri ?? null,
        nfc_token:             l.nfc_token ?? null,
        tamamlama_qr_zorunlu:  l.tamamlama_qr_zorunlu === true,
        sureli_gorev_aktif:    l.sureli_gorev_aktif === true,
        min_sure_dakika:       l.min_sure_dakika ?? null,
        max_sure_dakika:       l.max_sure_dakika ?? null,
        hedef_sure_dakika:     l.hedef_sure_dakika ?? null,
        checklist_sablon_id:   l.checklist_sablon_id ?? null,
      })),
      checklist_sablonlari,
      // Her proje lokasyonu için ekstra-frekans ekleme dropdown'u:
      //   { <lokasyonId>: { kurallari: [...], bugun_tamamlananlar: [...] } }
      // Mobil offline "ekstra görev ekle" ekranı bu sözlükten çeker; qr/[token]
      // GET response'undaki bugun_tamamlananlar + lokasyon_kurallari ile aynı
      // yapı (sadece proje geneli tek paketle geliyor).
      ekstra_frekans_dropdown: ekstraFrekansDropdown,
    }, { headers: CORS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS })
  }
}
