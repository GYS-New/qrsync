/**
 * POST /api/simulasyon/calistir
 * Simülasyon motoru v3 — vardiya bazlı, doğal akışlı
 *
 * Mantık:
 * 1. Görev aktif olduktan sonra tamamlama aralığı = vardiya_suresi / görev_sayısı
 * 2. Her cron (1dk) çalışmada, süresi dolmuş görevleri tamamlar
 * 3. Hedef oranına göre bazı görevler tamamlanmaz (pas geçilir)
 * 4. %1 iptal olasılığı
 * 5. Personel tamamlamalarını SİM kontrol eder (gorev-tamamla bypass)
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = { 'Access-Control-Allow-Origin': '*' }
const IPTAL_OLASILIK = 0.01 // %1

export async function POST(req: Request) {
  const cronToken = req.headers.get('x-cron-token')
  const secret = process.env.CRON_SECRET
  if (secret && cronToken !== secret) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401, headers: CORS })
  }

  const admin = createAdminClient()
  const sonuclar: any[] = []

  try {
    const { data: ayarlar } = await admin
      .from('simulasyon_ayarlari')
      .select('*')
      .eq('aktif', true)

    if (!ayarlar || ayarlar.length === 0) {
      return NextResponse.json({ ok: true, mesaj: 'Aktif simülasyon yok', sonuclar: [] }, { headers: CORS })
    }

    for (const ayar of ayarlar) {
      const [grupRes, personelRes] = await Promise.all([
        admin.from('simulasyon_grup_ayarlari').select('*').eq('simulasyon_id', ayar.id),
        admin.from('simulasyon_personeller').select('user_id').eq('simulasyon_id', ayar.id),
      ])

      const grupAyarlari = grupRes.data ?? []
      const personelIdler = (personelRes.data ?? []).map((p: any) => p.user_id)
      if (grupAyarlari.length === 0 || personelIdler.length === 0) continue

      const uygunPersonel = await filtreliPersonelGetir(admin, ayar.firma_id, ayar.proje_id, personelIdler)
      if (uygunPersonel.length === 0) continue

      for (const ga of grupAyarlari) {
        const result = await grupSimulasyonCalistir(admin, ayar, ga, uygunPersonel)
        sonuclar.push({ ayar_id: ayar.id, grup_id: ga.grup_id, ...result })
      }
    }

    return NextResponse.json({ ok: true, sonuclar }, { headers: CORS })
  } catch (e: any) {
    console.error('[SIMULASYON] Hata:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS })
  }
}

// ── Personel filtresi ───────────────────────────────────────────────────────
async function filtreliPersonelGetir(admin: any, firmaId: string, projeId: string | null, personelIdler: string[]): Promise<string[]> {
  const { data: users } = await admin
    .from('users')
    .select('id')
    .in('id', personelIdler)
    .eq('aktif', true)

  let uygun = (users ?? []).map((u: any) => u.id)
  if (uygun.length === 0) return []

  if (projeId) {
    const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', projeId).single()
    if (proje?.personel_takibi_aktif === true) {
      const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const { data: mesailar } = await admin
        .from('personel_mesai_kayitlari')
        .select('user_id')
        .eq('firma_id', firmaId)
        .eq('kayit_tarihi', bugun)
        .is('cikis_saati', null)
      const mesailiSet = new Set((mesailar ?? []).map((m: any) => m.user_id))
      uygun = uygun.filter((id: string) => mesailiSet.has(id))
    }
  }

  return uygun
}

// ── Grup simülasyonu ────────────────────────────────────────────────────────
async function grupSimulasyonCalistir(admin: any, ayar: any, grupAyar: any, uygunPersonel: string[]) {
  const { firma_id } = ayar
  const { grup_id, hedef_oran, vardiya_suresi_saat } = grupAyar
  const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const now = Date.now()

  // Grubun üye lokasyonlarını bul
  const { data: uyeler } = await admin
    .from('lokasyon_grup_uyeleri')
    .select('lokasyon_id')
    .eq('grup_id', grup_id)

  const lokIds = (uyeler ?? []).map((u: any) => u.lokasyon_id)
  if (lokIds.length === 0) return { tamamlanan: 0, iptal: 0, mesaj: 'Grupta lokasyon yok' }

  // Lokasyon bilgileri
  const { data: lokBilgi } = await admin
    .from('lokasyonlar')
    .select('id, checklist_sablon_id, sureli_gorev_aktif, min_sure_dakika, max_sure_dakika')
    .in('id', lokIds)

  const lokMap = new Map<string, any>()
  for (const l of (lokBilgi ?? [])) lokMap.set(l.id, l)

  // Bugünkü canlı görevler
  const gunBaslangic = bugun + 'T00:00:00'
  const gunBitis = bugun + 'T23:59:59'

  const { data: gorevler } = await admin
    .from('canli_gorevler')
    .select('id, durum, lokasyon_id, tanim, aktif_olma_tarihi, baslatilma_tarihi, simule_tamamlandi')
    .eq('firma_id', firma_id)
    .in('lokasyon_id', lokIds)
    .gte('aktif_olma_tarihi', gunBaslangic)
    .lte('aktif_olma_tarihi', gunBitis)

  const tumGorevler = gorevler ?? []
  const toplamGorev = tumGorevler.length
  if (toplamGorev === 0) return { tamamlanan: 0, iptal: 0, mesaj: 'Bugünkü görev yok' }

  // ── Tamamlama aralığı hesabı ──────────────────────────────────────────
  const vardiyaDk = vardiya_suresi_saat * 60
  const tamamlananSayi = tumGorevler.filter((g: any) =>
    ['TAMAMLANDI', 'ZAMANINDA_TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'].includes(g.durum)
  ).length
  const hedefMax = Math.ceil((hedef_oran / 100) * toplamGorev)

  if (tamamlananSayi >= hedefMax) {
    return { tamamlanan: 0, iptal: 0, mesaj: `Hedef zaten sağlandı: ${tamamlananSayi}/${hedefMax}` }
  }

  const acikGorevler = tumGorevler.filter((g: any) => g.durum === 'ACIK')
  if (acikGorevler.length === 0) return { tamamlanan: 0, iptal: 0, mesaj: 'ACIK görev yok' }

  // ── Her cron çalışmasında en fazla 1-2 görev (doğal akış) ─────────────
  // Vardiya boyunca kaç görev tamamlanmalı: hedefMax
  // Cron aralığı: 1 dk. Vardiya: vardiyaDk dk.
  // Dakika başına ortalama görev: hedefMax / vardiyaDk
  // 1 cron'da tamamlanacak: max 1-2 görev (rastgele)
  const gorevPerDk = hedefMax / vardiyaDk
  const buCrondaTamamlanacak = Math.random() < gorevPerDk ? 1 : 0
  // Bazen 2 görev de olabilir (%10 olasılık)
  const ekGorev = Math.random() < 0.1 ? 1 : 0
  const maxTamamlama = Math.min(buCrondaTamamlanacak + ekGorev, acikGorevler.length, hedefMax - tamamlananSayi)

  if (maxTamamlama <= 0) {
    return { tamamlanan: 0, iptal: 0, mesaj: 'Bu cron turunda sıra gelmedi' }
  }

  // Rastgele görevler seç
  const karisik = acikGorevler.sort(() => Math.random() - 0.5)
  const tamamlanacak = karisik.slice(0, maxTamamlama)

  let tamamlananAdet = 0
  let iptalAdet = 0

  for (const gorev of tamamlanacak) {
    const personelId = uygunPersonel[Math.floor(Math.random() * uygunPersonel.length)]
    const lok = lokMap.get(gorev.lokasyon_id)

    // %1 iptal olasılığı
    if (Math.random() < IPTAL_OLASILIK) {
      await admin.from('canli_gorevler').update({
        durum: 'IPTAL',
        durum_degisim_tarihi: new Date().toISOString(),
        iptal_eden_id: personelId,
        iptal_tarihi: new Date().toISOString(),
        simule_tamamlandi: true,
      } as any).eq('id', gorev.id)
      iptalAdet++
      continue
    }

    // Süre hesabı: süreli görev aktifse min/max arası rastgele
    let sureSaniye: number = Math.round(gorevArasiDk * 60 * (0.5 + Math.random() * 0.5))
    if (lok?.sureli_gorev_aktif) {
      const minDk = lok.min_sure_dakika ?? 1
      const maxDk = lok.max_sure_dakika ?? Math.round(gorevArasiDk)
      const rastgeleDk = minDk + Math.random() * Math.max(0, maxDk - minDk)
      sureSaniye = Math.round(rastgeleDk * 60)
    }

    const tamamlanmaIso = new Date().toISOString()
    const baslatmaMs = Date.now() - sureSaniye * 1000
    const baslatmaIso = new Date(baslatmaMs).toISOString()

    const { error: updateErr } = await admin
      .from('canli_gorevler')
      .update({
        durum: 'TAMAMLANDI',
        durum_degisim_tarihi: tamamlanmaIso,
        baslatilma_tarihi: baslatmaIso,
        baslatan_kullanici_id: personelId,
        tamamlanma_tarihi: tamamlanmaIso,
        tamamlayan_kullanici_id: personelId,
        islemi_yapan_id: personelId,
        tamamlanma_suresi_saniye: sureSaniye,
        son_tamamlama_kanali: 'MOBIL',
        simule_tamamlandi: true,
      } as any)
      .eq('id', gorev.id)

    if (updateErr) {
      console.error(`[SIMULASYON] Görev ${gorev.id} hata:`, updateErr.message)
      continue
    }

    // Çeklist
    if (lok?.checklist_sablon_id) {
      await simuleCeklistTamamla(admin, gorev.id, lok.checklist_sablon_id, gorev.lokasyon_id, personelId)
    }

    tamamlananAdet++
  }

  return {
    tamamlanan: tamamlananAdet,
    iptal: iptalAdet,
    toplam: toplamGorev,
    gorev_arasi_dk: Math.round(gorevArasiDk),
    mevcut_tamamlanan: tamamlananSayi,
    hedef_max: hedefMax,
  }
}

// ── Çeklist simüle tamamla ──────────────────────────────────────────────────
async function simuleCeklistTamamla(admin: any, gorevId: string, sablonId: string, lokasyonId: string, userId: string) {
  try {
    const { data: sablon } = await admin.from('checklist_sablonlari').select('id, baslik, versiyon').eq('id', sablonId).single()
    if (!sablon) return

    // Maddeleri çek (doğru tablo: checklist_sablon_maddeleri)
    const { data: maddeler } = await admin
      .from('checklist_sablon_maddeleri')
      .select('id, baslik, zorunlu_cevap, gorsel_gerekli')
      .eq('sablon_id', sablonId)
      .order('sira_no', { ascending: true })
    if (!maddeler || maddeler.length === 0) return

    // Her madde için seçenekleri çek (ayrı tablo: checklist_madde_secenekleri)
    const maddeIds = maddeler.map((m: any) => m.id)
    const { data: tumSecenekler } = await admin
      .from('checklist_madde_secenekleri')
      .select('id, madde_id, deger, aciklama_gerekli, sira_no')
      .in('madde_id', maddeIds)
      .order('sira_no', { ascending: true })

    const secenekMap = new Map<string, any[]>()
    for (const s of (tumSecenekler ?? [])) {
      const arr = secenekMap.get(s.madde_id) ?? []
      arr.push(s)
      secenekMap.set(s.madde_id, arr)
    }

    // Sonuç başlığı oluştur
    const { data: sonucRow, error: sonucErr } = await admin.from('checklist_sonuc_basliklari').insert({
      canli_gorev_id: gorevId,
      lokasyon_id: lokasyonId,
      sablon_id: sablonId,
      template_version: sablon.versiyon ?? 1,
      kanal: 'MOBİL',
      kullanici_id: userId,
    }).select('id').single()

    if (sonucErr || !sonucRow) return

    // Her maddenin ilk seçeneğini işaretle (zorunlu alanlar dahil)
    const maddeRows = maddeler.map((m: any) => {
      const secenekler = secenekMap.get(m.id) ?? []
      const ilkSecenek = secenekler.length > 0 ? secenekler[0] : null
      return {
        sonuc_id: sonucRow.id,
        madde_id: m.id,
        secenek_degeri: ilkSecenek?.deger ?? 'Yapıldı',
        aciklama: null,  // metin boş geçilebilir
        gorsel_url: null, // görsel boş geçilebilir
      }
    })

    await admin.from('checklist_sonuc_maddeleri').insert(maddeRows)
  } catch (e: any) {
    console.error(`[SIMULASYON] Çeklist hata (görev: ${gorevId}):`, e.message)
  }
}
