/**
 * POST /api/simulasyon/calistir
 * Simülasyon motoru — grup bazlı çalışır.
 * Her simülasyon ayarı için seçilen gruplar üzerinde,
 * seçilen personel ile görev tamamlama simülasyonu yapar.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = { 'Access-Control-Allow-Origin': '*' }

export async function POST(req: Request) {
  const cronToken = req.headers.get('x-cron-token')
  const secret = process.env.CRON_SECRET
  if (secret && cronToken !== secret) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401, headers: CORS })
  }

  const admin = createAdminClient()
  const sonuclar: any[] = []

  try {
    // Aktif simülasyon ayarlarını çek
    const { data: ayarlar } = await admin
      .from('simulasyon_ayarlari')
      .select('*')
      .eq('aktif', true)

    if (!ayarlar || ayarlar.length === 0) {
      return NextResponse.json({ ok: true, mesaj: 'Aktif simülasyon yok', sonuclar: [] }, { headers: CORS })
    }

    for (const ayar of ayarlar) {
      // Grup ayarlarını ve personelleri çek
      const [grupRes, personelRes] = await Promise.all([
        admin.from('simulasyon_grup_ayarlari').select('*').eq('simulasyon_id', ayar.id),
        admin.from('simulasyon_personeller').select('user_id').eq('simulasyon_id', ayar.id),
      ])

      const grupAyarlari = grupRes.data ?? []
      const personelIdler = (personelRes.data ?? []).map((p: any) => p.user_id)

      if (grupAyarlari.length === 0 || personelIdler.length === 0) continue

      // Personel takibi kontrolü: mesaisiz personelleri filtrele
      const uygunPersonel = await filtreliPersonelGetir(admin, ayar.firma_id, ayar.proje_id, personelIdler)
      if (uygunPersonel.length === 0) continue

      // Her grup için ayrı çalıştır
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

// ── Personel filtresi: aktif + mesai kontrolü ───────────────────────────────
async function filtreliPersonelGetir(admin: any, firmaId: string, projeId: string | null, personelIdler: string[]): Promise<string[]> {
  // Aktif kullanıcıları filtrele
  const { data: users } = await admin
    .from('users')
    .select('id')
    .in('id', personelIdler)
    .eq('aktif', true)

  let uygun = (users ?? []).map((u: any) => u.id)
  if (uygun.length === 0) return []

  // Personel takibi aktifse mesai kontrolü
  if (projeId) {
    const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', projeId).single()
    if (proje?.personel_takibi_aktif === true) {
      const bugun = new Date().toISOString().slice(0, 10)
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

// ── Tek grup için simülasyon ────────────────────────────────────────────────
async function grupSimulasyonCalistir(admin: any, ayar: any, grupAyar: any, uygunPersonel: string[]) {
  const { firma_id } = ayar
  const { grup_id, hedef_oran, gorev_suresi_dk } = grupAyar
  const bugun = new Date().toISOString().slice(0, 10)

  // Grubun üye lokasyonlarını bul
  const { data: uyeler } = await admin
    .from('lokasyon_grup_uyeleri')
    .select('lokasyon_id')
    .eq('grup_id', grup_id)

  const lokIds = (uyeler ?? []).map((u: any) => u.lokasyon_id)
  if (lokIds.length === 0) return { tamamlanan: 0, mesaj: 'Grupta lokasyon yok' }

  // Lokasyon bilgileri (checklist, süre limitleri)
  const { data: lokBilgi } = await admin
    .from('lokasyonlar')
    .select('id, checklist_sablon_id, sureli_gorev_aktif, min_sure_dakika, max_sure_dakika')
    .in('id', lokIds)

  const lokMap = new Map<string, any>()
  for (const l of (lokBilgi ?? [])) lokMap.set(l.id, l)

  // Bu lokasyonlardaki bugünkü canlı görevler
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
  if (toplamGorev === 0) return { tamamlanan: 0, mesaj: 'Bugünkü görev yok' }

  // Mevcut tamamlanma oranı
  const tamamlananSayi = tumGorevler.filter((g: any) =>
    ['TAMAMLANDI', 'ZAMANINDA_TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'].includes(g.durum)
  ).length
  const mevcutOran = (tamamlananSayi / toplamGorev) * 100

  if (mevcutOran >= hedef_oran) {
    return { tamamlanan: 0, mesaj: `Hedef zaten sağlandı: %${Math.round(mevcutOran)}` }
  }

  // 24 saate yayılmış orantılı hedef
  const now = new Date()
  const gunBasDate = new Date(bugun + 'T00:01:00')
  const gunBitDate = new Date(bugun + 'T23:59:00')
  const gecenDk = Math.max(0, (now.getTime() - gunBasDate.getTime()) / 60000)
  const toplamDk = (gunBitDate.getTime() - gunBasDate.getTime()) / 60000
  const zamanOrani = Math.min(1, gecenDk / toplamDk)

  const hedefSayisi = Math.floor((hedef_oran / 100) * toplamGorev * zamanOrani)
  const eksik = Math.max(0, hedefSayisi - tamamlananSayi)

  if (eksik === 0) return { tamamlanan: 0, mesaj: 'Zaman oranına göre eksik yok' }

  // ACIK görevleri al
  const acikGorevler = tumGorevler.filter((g: any) => g.durum === 'ACIK')
  if (acikGorevler.length === 0) return { tamamlanan: 0, mesaj: 'ACIK görev yok' }

  // Simüle et
  const tamamlanacak = acikGorevler.slice(0, eksik)
  let tamamlananAdet = 0

  for (const gorev of tamamlanacak) {
    const personelId = uygunPersonel[Math.floor(Math.random() * uygunPersonel.length)]
    const lok = lokMap.get(gorev.lokasyon_id)

    // Süre hesabı
    let sureSaniye: number = gorev_suresi_dk * 60
    if (lok?.sureli_gorev_aktif) {
      const minDk = lok.min_sure_dakika ?? 1
      const maxDk = lok.max_sure_dakika ?? gorev_suresi_dk
      const rastgeleDk = minDk + Math.random() * Math.max(0, maxDk - minDk)
      sureSaniye = Math.round(rastgeleDk * 60)
    }

    const tamamlanmaMs = Date.now()
    const baslatmaMs = tamamlanmaMs - sureSaniye * 1000
    const baslatmaIso = new Date(baslatmaMs).toISOString()
    const tamamlanmaIso = new Date(tamamlanmaMs).toISOString()

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

  return { tamamlanan: tamamlananAdet, toplam: toplamGorev, mevcut_oran: Math.round(mevcutOran), hedef_oran, eksik }
}

// ── Çeklist simüle tamamla ──────────────────────────────────────────────────
async function simuleCeklistTamamla(admin: any, gorevId: string, sablonId: string, lokasyonId: string, userId: string) {
  try {
    const { data: sablon } = await admin.from('checklist_sablonlari').select('id, baslik, versiyon').eq('id', sablonId).single()
    if (!sablon) return

    const { data: maddeler } = await admin.from('checklist_maddeleri').select('id, baslik, secenekler').eq('sablon_id', sablonId).order('sira', { ascending: true })
    if (!maddeler || maddeler.length === 0) return

    const { data: sonucRow, error: sonucErr } = await admin.from('checklist_sonuc_basliklari').insert({
      canli_gorev_id: gorevId,
      lokasyon_id: lokasyonId,
      sablon_id: sablonId,
      template_version: sablon.versiyon ?? 1,
      kanal: 'MOBİL',
      kullanici_id: userId,
    }).select('id').single()

    if (sonucErr || !sonucRow) return

    const maddeRows = maddeler.map((m: any) => {
      const secenekler = m.secenekler ?? []
      const ilk = secenekler.length > 0 ? secenekler[0] : null
      return {
        sonuc_id: sonucRow.id,
        madde_id: m.id,
        secenek_degeri: ilk?.deger ?? ilk?.label ?? 'Evet',
        aciklama: null,
        gorsel_url: null,
      }
    })

    await admin.from('checklist_sonuc_maddeleri').insert(maddeRows)
  } catch (e: any) {
    console.error(`[SIMULASYON] Çeklist hata (görev: ${gorevId}):`, e.message)
  }
}
