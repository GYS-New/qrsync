/**
 * POST /api/app/offline-snapshot
 *
 * Mobil çevrimdışı çalışma için veri paketi endpoint'i. Mobil, şebekeyi kaybetmeden
 * önce lokalde ihtiyaç duyacağı görevleri, lokasyon meta bilgilerini ve çeklist
 * şablonlarını bu endpoint üzerinden çeker.
 *
 * İki senaryo:
 *   - PT aktif proje: Açık mesai zorunlu. İş başı giris_saati'ne göre aktif vardiya
 *     tespit edilir, sadece o vardiya × kullanıcının yetkili üst lokasyonları
 *     kapsamındaki HAZIR/ACIK görevler döner.
 *   - PT pasif proje: Mesai yok, vardiya yok. Kullanıcının yetkili üst lokasyonlarındaki
 *     tüm HAZIR/ACIK görevler döner.
 *
 * Kullanıcı yetkisi: kullanici_lokasyon_yetkileri.ust_lokasyon_id + BFS ile alt ağaç.
 * Yetki kaydı YOKSA → tüm proje lokasyonlarına erişim (sistem genelindeki konvansiyon,
 * lib/yetki/getLokasyonYetki.ts ile hizalı; online akış da aynı şekilde davranır).
 *
 * Header: X-Device-Token
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { aktifVardiyaAraligi } from '@/lib/scan/vardiya'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
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

    const { user_id: userId, firma_id: firmaId, proje_id: personelProjeId } = tokenData

    // ── Kullanıcı aktif ─────────────────────────────────────────────────────
    const { data: userData } = await admin.from('users').select('aktif').eq('id', userId).single()
    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.', code: 'USER_PASIF' },
        { status: 403, headers: CORS }
      )
    }

    // ── PT durumu + çeklist ayarları: firma + proje seviyesinde ─────────────
    const [firmaRes, projeRes] = await Promise.all([
      admin.from('firmalar')
        .select('personel_takibi_aktif, vardiya_sayisi, tum_vardiya_ayarlari, frekansiyel_ceklist_aktif, spesifik_ceklist_aktif')
        .eq('id', firmaId).single(),
      personelProjeId
        ? admin.from('projeler')
            .select('personel_takibi_aktif, frekansiyel_ceklist_aktif, spesifik_ceklist_aktif')
            .eq('id', personelProjeId).single()
        : Promise.resolve({ data: null }),
    ])
    const firma = firmaRes.data as any
    const proje = projeRes.data as any
    const ptAktif = firma?.personel_takibi_aktif === true && proje?.personel_takibi_aktif === true
    // Efektif ayar: proje override > firma default > true
    const efAyar = (k: string, defaultV = true): boolean => {
      if (proje?.[k] != null) return !!proje[k]
      if (firma?.[k] != null) return !!firma[k]
      return defaultV
    }
    const canliCeklistAktif    = efAyar('frekansiyel_ceklist_aktif')
    const spesifikCeklistAktif = efAyar('spesifik_ceklist_aktif')

    // ── PT aktif ise: mesai kontrolü + vardiya tespiti ───────────────────────
    let vardiyaBilgi: {
      no: number
      baslangic: string
      bitis: string
      baslangicISO: string
      bitisISO: string
    } | null = null
    let mesaiKaydi: any = null

    if (ptAktif) {
      const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
      const { data: mesai } = await admin
        .from('personel_mesai_kayitlari')
        .select('id, giris_saati, kayit_tarihi')
        .eq('user_id', userId)
        .eq('kayit_tarihi', bugun)
        .is('cikis_saati', null)
        .maybeSingle()

      if (!mesai) {
        return NextResponse.json(
          { ok: false, error: 'Önce iş başı QR/NFC kodunu okutunuz.', code: 'MESAI_YOK' },
          { status: 403, headers: CORS }
        )
      }
      mesaiKaydi = mesai

      // Vardiya tespiti: iş başı giris_saati'ne göre
      vardiyaBilgi = aktifVardiyaAraligi(firma?.vardiya_sayisi, firma?.tum_vardiya_ayarlari, mesai.giris_saati)
    }

    // ── Yetkili üst lokasyonlar + BFS (kullanıcının çalışma alanı) ──────────
    const { data: yetkiRows } = await admin
      .from('kullanici_lokasyon_yetkileri')
      .select('ust_lokasyon_id')
      .eq('user_id', userId)

    const yetkiliUstLokIds = (yetkiRows ?? []).map((r: any) => r.ust_lokasyon_id as string)
    const lokasyonIdSet = new Set<string>()

    if (yetkiliUstLokIds.length > 0) {
      // Yetki kaydı var → sadece yetkili üst lokasyonlar + BFS alt ağacı
      let tumLokQ = admin
        .from('lokasyonlar')
        .select('id, parent_id, aktif')
        .eq('firma_id', firmaId)
        .eq('aktif', true)
      if (personelProjeId) tumLokQ = (tumLokQ as any).eq('proje_id', personelProjeId)
      const { data: tumLoks } = await tumLokQ

      for (const id of yetkiliUstLokIds) lokasyonIdSet.add(id)
      const queue = [...yetkiliUstLokIds]
      while (queue.length > 0) {
        const cur = queue.shift()!
        for (const l of (tumLoks ?? []) as any[]) {
          if (l.parent_id === cur && !lokasyonIdSet.has(l.id)) {
            lokasyonIdSet.add(l.id)
            queue.push(l.id)
          }
        }
      }
    } else {
      // Yetki kaydı yok = tüm proje lokasyonlarına erişim.
      // Sistem konvansiyonu: lib/yetki/getLokasyonYetki.ts ids.length===0 → null (tümü).
      // Online akış (scan/tamamla, gorev-tamamla) zaten bu tabloyu okumuyor; snapshot
      // da aynı davranışa hizalanır.
      let tumLokQ = admin
        .from('lokasyonlar')
        .select('id')
        .eq('firma_id', firmaId)
        .eq('aktif', true)
      if (personelProjeId) tumLokQ = (tumLokQ as any).eq('proje_id', personelProjeId)
      const { data: tumLoks } = await tumLokQ
      for (const l of ((tumLoks ?? []) as any[])) lokasyonIdSet.add(l.id)
    }

    const yetkiliLokIds = [...lokasyonIdSet]
    const yetkiKaydiVar = yetkiliUstLokIds.length > 0

    // ── Bekleyen görevler ────────────────────────────────────────────────────
    // Snapshot kapsam politikası:
    //   - Sıradaki 1 saat penceresi: aktif_olma_tarihi <= (şimdi + 1 saat)
    //     → ACIK görevler (zaten aktifleşmiş) ve HAZIR görevler (1 saat içinde
    //       aktifleşecek olanlar) alınır. Daha ileri tarihli HAZIR görevler
    //       (sistem 24 saat ilerisi için üretir) snapshot DIŞINDA kalır.
    //   - Vardiya belli ise ek olarak vardiya penceresi uygulanır.
    //   - Vardiya belli değilse (iş başı saat toleransı dışında) sadece 1 saat
    //     penceresi çalışır — snapshot boyutu makul kalır.
    //
    // Lokasyon kapsam filtresi:
    //   yetkiKaydiVar → .in('lokasyon_id', yetkiliLokIds) (küçük liste)
    //   yetki yok    → .eq('proje_id', personelProjeId) (tek eq — URL limit'i aşmaz)
    // Neden: PostgREST .in() 400+ UUID'de URL limit'e (~8KB) takılır ve sessizce
    // boş sonuç döner. Fallback'te 397 lokasyon bu limiti aşıyordu.
    let bekleyenGorevler: any[] = []
    let bekleyenCanli: any[] = []

    // Pencere sınırı: offline kalan personel vardiya boyu görev listesini
    // görebilsin diye vardiya bitişine kadar uzatıldı. Eski "+1 saat"
    // offline'da stale snapshot'a yol açıyordu (personel görev göremiyor,
    // ekstra görev üretip yapıyor, frekansiyel görevler açık kalıyordu).
    // Fallback: vardiya bilgisi yoksa +12 saat (vardiyasız firma/proje için).
    const siradakiSinirIso = vardiyaBilgi?.bitisISO ?? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()

    if (yetkiliLokIds.length > 0) {
      const [spesifikRes, canliRes] = await Promise.all([
        // Spesifik görevler — vardiya bağımsız
        (() => {
          let q = admin.from('gorevler').select(`
            id, tanim, durum, olusturma_tarihi, aktif_olma_tarihi, baslatilma_tarihi, lokasyon_id,
            lokasyonlar ( id, tanim, checklist_sablon_id, ust_tanim:parent_id(tanim) )
          `)
            .eq('firma_id', firmaId)
            .in('durum', ['HAZIR', 'ACIK'])
            .lte('aktif_olma_tarihi', siradakiSinirIso)
            .order('olusturma_tarihi', { ascending: false })
          q = yetkiKaydiVar
            ? q.in('lokasyon_id', yetkiliLokIds)
            : (personelProjeId ? (q as any).eq('proje_id', personelProjeId) : q)
          return q
        })(),

        // Canlı görevler — PT aktifte vardiya içi, PT pasifte vardiya filtresi yok
        (() => {
          let q = admin.from('canli_gorevler').select(`
            id, tanim, durum, aktif_olma_tarihi, baslatilma_tarihi, lokasyon_id,
            lokasyonlar ( id, tanim, checklist_sablon_id, ust_tanim:parent_id(tanim) )
          `)
            .eq('firma_id', firmaId)
            .in('durum', ['HAZIR', 'ACIK'])
            .lte('aktif_olma_tarihi', siradakiSinirIso)
            .order('aktif_olma_tarihi', { ascending: false })

          q = yetkiKaydiVar
            ? q.in('lokasyon_id', yetkiliLokIds)
            : (personelProjeId ? (q as any).eq('proje_id', personelProjeId) : q)

          if (vardiyaBilgi) {
            // Vardiya pencere filtresi: aktif_olma_tarihi vardiya aralığında
            q = q.gte('aktif_olma_tarihi', vardiyaBilgi.baslangicISO)
                 .lt('aktif_olma_tarihi', vardiyaBilgi.bitisISO)
          }
          return q
        })(),
      ])

      bekleyenGorevler = (spesifikRes.data ?? []) as any[]
      bekleyenCanli = (canliRes.data ?? []) as any[]
    }

    // ── Lokasyon detayları (yetkili tüm lokasyonlar — ekstra görev için dahil) ──
    // Görev olmayan lokasyonları da kapsıyoruz: kullanıcı QR okuttuğunda "görev yok →
    // ekstra görev ekle" akışı için o lokasyonun kuralları lazım.
    let lokasyonlar: any[] = []
    if (yetkiliLokIds.length > 0) {
      let lokQ = admin
        .from('lokasyonlar')
        .select('id, tanim, parent_id, qr_veri, nfc_token, tamamlama_qr_zorunlu, sureli_gorev_aktif, min_sure_dakika, max_sure_dakika, hedef_sure_dakika, aktif, checklist_sablon_id')
        .eq('aktif', true)
      lokQ = yetkiKaydiVar
        ? lokQ.in('id', yetkiliLokIds)
        : (personelProjeId ? (lokQ as any).eq('proje_id', personelProjeId).eq('firma_id', firmaId) : lokQ)
      const { data: lokRows } = await lokQ
      lokasyonlar = (lokRows ?? []) as any[]
    }

    // Parent tanım map (ust_tanim göstermek için)
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

    // ── Lokasyon ekstra frekans kuralları (batch) ───────────────────────────
    // Not: gorev_kurallari.proje_id tarihsel olarak NULL kayıtlar içeriyor (schema
    // evrimi). Bu yüzden fallback'te .eq('proje_id') yerine firma_id ile çekip
    // memory'de lokasyonIdSet ile filtrele. Yetki varken IN filter doğrudan çalışır.
    const kuralMap = new Map<string, Set<string>>()
    if (yetkiliLokIds.length > 0) {
      let kuralQ = admin
        .from('gorev_kurallari')
        .select('tanim, lokasyon_id')
        .eq('aktif', true)
        .eq('firma_id', firmaId)
      if (yetkiKaydiVar) {
        kuralQ = kuralQ.in('lokasyon_id', yetkiliLokIds)
      }
      const { data: kuralRowsRaw } = await kuralQ
      const kuralRows = yetkiKaydiVar
        ? (kuralRowsRaw ?? [])
        : ((kuralRowsRaw ?? []) as any[]).filter((r: any) => lokasyonIdSet.has(r.lokasyon_id))
      for (const r of (kuralRows ?? []) as any[]) {
        const lid = r.lokasyon_id
        const t = typeof r.tanim === 'string' ? r.tanim.trim() : ''
        if (!lid || !t) continue
        if (!kuralMap.has(lid)) kuralMap.set(lid, new Set())
        kuralMap.get(lid)!.add(t)
      }
    }

    // ── Çeklist şablonları ──────────────────────────────────────────────────
    // Proje ayarı kapalıysa o tipe ait şablonlar snapshot'a alınmaz
    // (lokasyon meta'sı: ekstra görev frekansiyel sayıldığı için canli ayarına bakılır)
    const sablonIdSet = new Set<string>()
    if (canliCeklistAktif) {
      for (const l of lokasyonlar) if (l.checklist_sablon_id) sablonIdSet.add(l.checklist_sablon_id)
      for (const g of bekleyenCanli) {
        const sid = g.lokasyonlar?.checklist_sablon_id
        if (sid) sablonIdSet.add(sid)
      }
    }
    if (spesifikCeklistAktif) {
      for (const g of bekleyenGorevler) {
        const sid = g.lokasyonlar?.checklist_sablon_id
        if (sid) sablonIdSet.add(sid)
      }
    }

    const checklist_sablonlari: any[] = []
    if (sablonIdSet.size > 0) {
      const [sablonlarRes, maddelerRes] = await Promise.all([
        admin.from('checklist_sablonlari').select('id, baslik, versiyon').in('id', [...sablonIdSet]),
        admin.from('checklist_sablon_maddeleri')
          .select('id, sablon_id, sira_no, baslik, zorunlu_cevap, gorsel_gerekli, checklist_madde_secenekleri(id, deger, sira_no, aciklama_gerekli)')
          .in('sablon_id', [...sablonIdSet])
          .order('sira_no', { ascending: true }),
      ])
      const sablonMap = new Map<string, any>()
      for (const s of (sablonlarRes.data ?? []) as any[]) {
        sablonMap.set(s.id, { id: s.id, baslik: s.baslik, versiyon: s.versiyon ?? 1, maddeler: [] })
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

    // Cihaz son kullanım
    const nowIso = new Date().toISOString()
    await admin.from('device_tokens').update({ son_kullanim: nowIso }).eq('device_token', deviceToken)

    // ── Response ────────────────────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      sunucu_zamani: nowIso,
      mod: ptAktif ? 'pt_aktif' : 'pt_pasif',
      kullanici: {
        id: userId,
        isim_soyisim: (tokenData as any).isim_soyisim,
        firma_id: firmaId,
        proje_id: personelProjeId ?? null,
      },
      vardiya: vardiyaBilgi,
      mesai: mesaiKaydi
        ? { mesai_kayit_id: mesaiKaydi.id, kayit_tarihi: mesaiKaydi.kayit_tarihi, giris_saati: mesaiKaydi.giris_saati }
        : null,
      bekleyen_gorevler: [
        ...bekleyenGorevler.map((g: any) => ({
          gorev_id: g.id,
          gorev_tipi: 'gorevler',
          tanim: g.tanim,
          durum: g.durum,
          olusturma_tarihi: g.olusturma_tarihi,
          aktif_olma_tarihi: g.aktif_olma_tarihi ?? null,
          baslatilma_tarihi: g.baslatilma_tarihi ?? null,
          lokasyon_id: g.lokasyon_id,
          lokasyon: g.lokasyonlar
            ? { id: g.lokasyonlar.id, tanim: g.lokasyonlar.tanim, ust_tanim: g.lokasyonlar.ust_tanim?.tanim ?? null }
            : null,
          // Spesifik ayar kapalıysa şablon ID null — mobil çeklist butonu göstermez
          checklist_sablon_id: spesifikCeklistAktif ? (g.lokasyonlar?.checklist_sablon_id ?? null) : null,
        })),
        ...bekleyenCanli.map((g: any) => ({
          gorev_id: g.id,
          gorev_tipi: 'canli_gorevler',
          tanim: g.tanim,
          durum: g.durum,
          aktif_olma_tarihi: g.aktif_olma_tarihi,
          baslatilma_tarihi: g.baslatilma_tarihi ?? null,
          lokasyon_id: g.lokasyon_id,
          lokasyon: g.lokasyonlar
            ? { id: g.lokasyonlar.id, tanim: g.lokasyonlar.tanim, ust_tanim: g.lokasyonlar.ust_tanim?.tanim ?? null }
            : null,
          // Frekansiyel ayar kapalıysa şablon ID null — mobil çeklist butonu göstermez
          checklist_sablon_id: canliCeklistAktif ? (g.lokasyonlar?.checklist_sablon_id ?? null) : null,
        })),
      ],
      lokasyonlar: lokasyonlar.map((l: any) => ({
        id:                    l.id,
        tanim:                 l.tanim,
        parent_id:             l.parent_id ?? null,
        ust_tanim:             l.parent_id ? (parentTanimMap.get(l.parent_id) ?? null) : null,
        qr_veri:               l.qr_veri ?? null,
        nfc_token:             l.nfc_token ?? null,
        tamamlama_qr_zorunlu:  l.tamamlama_qr_zorunlu === true,
        sureli_gorev_aktif:    l.sureli_gorev_aktif === true,
        min_sure_dakika:       l.min_sure_dakika ?? null,
        max_sure_dakika:       l.max_sure_dakika ?? null,
        hedef_sure_dakika:     l.hedef_sure_dakika ?? null,
        // Lokasyon meta'sındaki checklist_sablon_id ekstra görev (frekansiyel) için
        // kullanılır → frekansiyel ayara bakılır
        checklist_sablon_id:   canliCeklistAktif ? (l.checklist_sablon_id ?? null) : null,
        ekstra_frekans_kurallari: [...(kuralMap.get(l.id) ?? [])]
          .sort((a, b) => a.localeCompare(b, 'tr'))
          .map(tanim => ({ tanim })),
      })),
      checklist_sablonlari,
      ayarlar: {
        frekansiyel_ceklist_aktif: canliCeklistAktif,
        spesifik_ceklist_aktif:    spesifikCeklistAktif,
      },
    }, { headers: CORS })

  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Sunucu hatası' },
      { status: 500, headers: CORS }
    )
  }
}
