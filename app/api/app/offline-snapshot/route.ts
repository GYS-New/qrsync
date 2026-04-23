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
 * Yetki kaydı yoksa snapshot boş döner (kullanıcı hiçbir lokasyona atanmamış demek).
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

    // ── PT durumu: firma + proje seviyesinde ─────────────────────────────────
    const [firmaRes, projeRes] = await Promise.all([
      admin.from('firmalar').select('personel_takibi_aktif, vardiya_sayisi, tum_vardiya_ayarlari').eq('id', firmaId).single(),
      personelProjeId
        ? admin.from('projeler').select('personel_takibi_aktif').eq('id', personelProjeId).single()
        : Promise.resolve({ data: null }),
    ])
    const firma = firmaRes.data as any
    const proje = projeRes.data as any
    const ptAktif = firma?.personel_takibi_aktif === true && proje?.personel_takibi_aktif === true

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
    }

    const yetkiliLokIds = [...lokasyonIdSet]

    // ── Bekleyen görevler ────────────────────────────────────────────────────
    // PT aktif: vardiya aralığında (ACIK) VEYA (HAZIR + aktif_olma_tarihi ∈ vardiya)
    // PT pasif: tüm HAZIR + ACIK (vardiya kısıtı yok)
    let bekleyenGorevler: any[] = []
    let bekleyenCanli: any[] = []

    if (yetkiliLokIds.length > 0) {
      const [spesifikRes, canliRes] = await Promise.all([
        // Spesifik görevler — vardiya bağımsız, sadece durum filtresi
        admin.from('gorevler').select(`
          id, tanim, durum, olusturma_tarihi, aktif_olma_tarihi, baslatilma_tarihi, lokasyon_id,
          lokasyonlar ( id, tanim, checklist_sablon_id, ust_tanim:parent_id(tanim) )
        `)
          .eq('firma_id', firmaId)
          .in('lokasyon_id', yetkiliLokIds)
          .in('durum', ['HAZIR', 'ACIK'])
          .order('olusturma_tarihi', { ascending: false }),

        // Canlı görevler — PT aktifte vardiya, PT pasifte tümü
        (() => {
          let q = admin.from('canli_gorevler').select(`
            id, tanim, durum, aktif_olma_tarihi, baslatilma_tarihi, lokasyon_id,
            lokasyonlar ( id, tanim, checklist_sablon_id, ust_tanim:parent_id(tanim) )
          `)
            .eq('firma_id', firmaId)
            .in('lokasyon_id', yetkiliLokIds)
            .in('durum', ['HAZIR', 'ACIK'])
            .order('aktif_olma_tarihi', { ascending: false })

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
      const { data: lokRows } = await admin
        .from('lokasyonlar')
        .select('id, tanim, parent_id, qr_veri, nfc_token, tamamlama_qr_zorunlu, sureli_gorev_aktif, min_sure_dakika, max_sure_dakika, hedef_sure_dakika, aktif, checklist_sablon_id')
        .in('id', yetkiliLokIds)
        .eq('aktif', true)
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
    const kuralMap = new Map<string, Set<string>>()
    if (yetkiliLokIds.length > 0) {
      const { data: kuralRows } = await admin
        .from('gorev_kurallari')
        .select('tanim, lokasyon_id')
        .in('lokasyon_id', yetkiliLokIds)
        .eq('aktif', true)
      for (const r of (kuralRows ?? []) as any[]) {
        const lid = r.lokasyon_id
        const t = typeof r.tanim === 'string' ? r.tanim.trim() : ''
        if (!lid || !t) continue
        if (!kuralMap.has(lid)) kuralMap.set(lid, new Set())
        kuralMap.get(lid)!.add(t)
      }
    }

    // ── Çeklist şablonları ──────────────────────────────────────────────────
    const sablonIdSet = new Set<string>()
    for (const l of lokasyonlar) if (l.checklist_sablon_id) sablonIdSet.add(l.checklist_sablon_id)
    for (const g of [...bekleyenGorevler, ...bekleyenCanli]) {
      const sid = g.lokasyonlar?.checklist_sablon_id
      if (sid) sablonIdSet.add(sid)
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
          checklist_sablon_id: g.lokasyonlar?.checklist_sablon_id ?? null,
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
          checklist_sablon_id: g.lokasyonlar?.checklist_sablon_id ?? null,
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
        checklist_sablon_id:   l.checklist_sablon_id ?? null,
        ekstra_frekans_kurallari: [...(kuralMap.get(l.id) ?? [])]
          .sort((a, b) => a.localeCompare(b, 'tr'))
          .map(tanim => ({ tanim })),
      })),
      checklist_sablonlari,
    }, { headers: CORS })

  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Sunucu hatası' },
      { status: 500, headers: CORS }
    )
  }
}
