/**
 * POST /api/simulasyon/calistir
 * Simülasyon motoru — aktif simülasyon ayarlarına göre frekansiyel görevleri
 * personel yapmış gibi tamamlar.
 *
 * Çalışma mantığı:
 * 1. Aktif simulasyon_ayarlari kayıtlarını çek
 * 2. Her ayar için üst lokasyonun alt lokasyonlarındaki ACIK canlı görevleri bul
 * 3. Hedef oranına göre kaç görev tamamlanması gerektiğini hesapla
 * 4. Uygun personelden rastgele seç (aktif, mesai kontrolü)
 * 5. Görevi personel yapmış gibi tamamla (checklist dahil)
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = { 'Access-Control-Allow-Origin': '*' }

export async function POST(req: Request) {
  // Cron token kontrolü
  const cronToken = req.headers.get('x-cron-token')
  const secret = process.env.CRON_SECRET
  if (secret && cronToken !== secret) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401, headers: CORS })
  }

  const admin = createAdminClient()
  const sonuclar: any[] = []

  try {
    // 1. Aktif simülasyon ayarlarını çek
    const { data: ayarlar, error: ayarErr } = await admin
      .from('simulasyon_ayarlari')
      .select('*')
      .eq('aktif', true)

    if (ayarErr) throw ayarErr
    if (!ayarlar || ayarlar.length === 0) {
      return NextResponse.json({ ok: true, mesaj: 'Aktif simülasyon yok', sonuclar: [] }, { headers: CORS })
    }

    for (const ayar of ayarlar) {
      const result = await simulasyonCalistir(admin, ayar)
      sonuclar.push({ ayar_id: ayar.id, ust_lokasyon_id: ayar.ust_lokasyon_id, ...result })
    }

    return NextResponse.json({ ok: true, sonuclar }, { headers: CORS })
  } catch (e: any) {
    console.error('[SIMULASYON] Hata:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS })
  }
}

async function simulasyonCalistir(admin: any, ayar: any) {
  const { firma_id, proje_id, ust_lokasyon_id, hedef_oran, gorev_suresi_dk } = ayar
  const bugun = new Date().toISOString().slice(0, 10)

  // 2. Üst lokasyonun alt lokasyonlarını bul (ve kendisi dahil)
  const { data: tumLokasyonlar } = await admin
    .from('lokasyonlar')
    .select('id, parent_id, checklist_sablon_id, sureli_gorev_aktif, min_sure_dakika, max_sure_dakika')
    .eq('firma_id', firma_id)

  const lokasyonlar = tumLokasyonlar ?? []
  const altLokIds = altLokasyonlariTopla(ust_lokasyon_id, lokasyonlar)

  if (altLokIds.length === 0) return { tamamlanan: 0, mesaj: 'Alt lokasyon bulunamadı' }

  // 3. Bu lokasyonlardaki bugünkü tüm frekansiyel görevleri çek
  const gunBaslangic = bugun + 'T00:00:00'
  const gunBitis = bugun + 'T23:59:59'

  const { data: tumGorevler } = await admin
    .from('canli_gorevler')
    .select('id, durum, lokasyon_id, atanan_kullanici_id, aktif_olma_tarihi, baslatilma_tarihi, simule_tamamlandi, tanim')
    .eq('firma_id', firma_id)
    .in('lokasyon_id', altLokIds)
    .gte('aktif_olma_tarihi', gunBaslangic)
    .lte('aktif_olma_tarihi', gunBitis)

  const gorevler = tumGorevler ?? []
  const toplamGorev = gorevler.length
  if (toplamGorev === 0) return { tamamlanan: 0, mesaj: 'Bugünkü görev yok' }

  // Tamamlananları say (gerçek + simüle)
  const tamamlananSayi = gorevler.filter(g =>
    ['TAMAMLANDI', 'ZAMANINDA_TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'].includes(g.durum)
  ).length
  const mevcutOran = toplamGorev > 0 ? (tamamlananSayi / toplamGorev) * 100 : 0

  // Hedefe ulaşıldıysa dur
  if (mevcutOran >= hedef_oran) {
    return { tamamlanan: 0, mesaj: `Hedef oran zaten sağlandı: %${Math.round(mevcutOran)}` }
  }

  // 24 saate göre orantılı hedef hesabı
  const now = new Date()
  const gunBaslangicDate = new Date(bugun + 'T00:01:00')
  const gunBitisDate = new Date(bugun + 'T23:59:00')
  const gecenDakika = Math.max(0, (now.getTime() - gunBaslangicDate.getTime()) / 60000)
  const toplamDakika = (gunBitisDate.getTime() - gunBaslangicDate.getTime()) / 60000
  const zamanOrani = Math.min(1, gecenDakika / toplamDakika)

  // Şu an hedefe göre tamamlanması gereken miktar
  const hedefGorevSayisi = Math.floor((hedef_oran / 100) * toplamGorev * zamanOrani)
  const eksikGorevSayisi = Math.max(0, hedefGorevSayisi - tamamlananSayi)

  if (eksikGorevSayisi === 0) {
    return { tamamlanan: 0, mesaj: `Zaman oranına göre eksik yok. Mevcut: %${Math.round(mevcutOran)}, zaman: %${Math.round(zamanOrani * 100)}` }
  }

  // 4. Simüle edilecek ACIK görevleri al (zaten tamamlanmamış olanlar)
  const acikGorevler = gorevler.filter(g => g.durum === 'ACIK')
  if (acikGorevler.length === 0) {
    return { tamamlanan: 0, mesaj: 'Tamamlanacak ACIK görev yok' }
  }

  // 5. Uygun personeli bul
  const { data: personelListesi } = await admin
    .from('users')
    .select('id, aktif, ust_lokasyon_id')
    .eq('firma_id', firma_id)
    .eq('ust_lokasyon_id', ust_lokasyon_id)
    .eq('aktif', true)
    .in('rol', ['tenant_user'])

  let uygunPersonel = (personelListesi ?? []).map((p: any) => p.id)

  // Personel takibi aktifse, iş başı yapmamış personeli çıkar
  if (proje_id) {
    const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', proje_id).single()
    if (proje?.personel_takibi_aktif === true) {
      const { data: mesaiKayitlari } = await admin
        .from('personel_mesai_kayitlari')
        .select('user_id')
        .eq('firma_id', firma_id)
        .eq('kayit_tarihi', bugun)
        .is('cikis_saati', null) // açık mesai (iş başı yapılmış, sonu yapılmamış)
      const mesailiIds = new Set((mesaiKayitlari ?? []).map((m: any) => m.user_id))
      uygunPersonel = uygunPersonel.filter((id: string) => mesailiIds.has(id))
    }
  }

  if (uygunPersonel.length === 0) {
    return { tamamlanan: 0, mesaj: 'Uygun personel bulunamadı' }
  }

  // 6. Tamamlanacak görevleri seç ve simüle et
  const tamamlanacak = acikGorevler.slice(0, eksikGorevSayisi)
  let tamamlananAdet = 0

  // Lokasyon bilgileri map'i (checklist, süre limitleri)
  const lokMap = new Map<string, any>()
  for (const lok of lokasyonlar) lokMap.set(lok.id, lok)

  for (const gorev of tamamlanacak) {
    const personelId = uygunPersonel[Math.floor(Math.random() * uygunPersonel.length)]
    const lok = lokMap.get(gorev.lokasyon_id)
    const nowIso = new Date().toISOString()

    // Süre hesabı
    let sureSaniye: number = gorev_suresi_dk * 60
    if (lok?.sureli_gorev_aktif) {
      const minDk = lok.min_sure_dakika ?? 1
      const maxDk = lok.max_sure_dakika ?? gorev_suresi_dk
      const rastgeleDk = minDk + Math.random() * (maxDk - minDk)
      sureSaniye = Math.round(rastgeleDk * 60)
    }

    // Başlatma zamanı (tamamlanma - süre)
    const tamamlanmaMs = Date.now()
    const baslatmaMs = tamamlanmaMs - sureSaniye * 1000
    const baslatmaIso = new Date(baslatmaMs).toISOString()
    const tamamlanmaIso = new Date(tamamlanmaMs).toISOString()

    // Görevi güncelle
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
      console.error(`[SIMULASYON] Görev ${gorev.id} güncellenemedi:`, updateErr.message)
      continue
    }

    // Çeklist varsa ilk seçenekleri işaretle
    if (lok?.checklist_sablon_id) {
      await simuleCeklistTamamla(admin, gorev.id, lok.checklist_sablon_id, gorev.lokasyon_id, personelId)
    }

    tamamlananAdet++
  }

  return {
    tamamlanan: tamamlananAdet,
    toplam_gorev: toplamGorev,
    mevcut_oran: Math.round(mevcutOran),
    hedef_oran,
    eksik: eksikGorevSayisi,
    personel_sayisi: uygunPersonel.length,
  }
}

// ── Yardımcı: üst lokasyonun tüm alt lokasyonlarını topla ──────────────────
function altLokasyonlariTopla(ustId: string, tumLokasyonlar: any[]): string[] {
  const result: string[] = []
  const queue = [ustId]
  while (queue.length > 0) {
    const current = queue.shift()!
    // Üst lokasyonu dahil etme, sadece altlarını
    const children = tumLokasyonlar.filter(l => l.parent_id === current)
    for (const child of children) {
      result.push(child.id)
      queue.push(child.id)
    }
  }
  // Üst lokasyonun kendisi de alt lokasyon olarak sayılıyorsa ekle
  // (eğer kendisinin de görevi varsa)
  if (!result.includes(ustId)) {
    const ustLok = tumLokasyonlar.find(l => l.id === ustId)
    if (ustLok) result.push(ustId)
  }
  return result
}

// ── Yardımcı: çeklist simüle tamamla ───────────────────────────────────────
async function simuleCeklistTamamla(
  admin: any,
  gorevId: string,
  sablonId: string,
  lokasyonId: string,
  userId: string,
) {
  try {
    // Şablonu ve maddeleri çek
    const { data: sablon } = await admin
      .from('checklist_sablonlari')
      .select('id, baslik, versiyon')
      .eq('id', sablonId)
      .single()
    if (!sablon) return

    const { data: maddeler } = await admin
      .from('checklist_maddeleri')
      .select('id, baslik, secenekler')
      .eq('sablon_id', sablonId)
      .order('sira', { ascending: true })

    if (!maddeler || maddeler.length === 0) return

    // Sonuç başlığı oluştur
    const { data: sonucRow, error: sonucErr } = await admin
      .from('checklist_sonuc_basliklari')
      .insert({
        canli_gorev_id: gorevId,
        lokasyon_id: lokasyonId,
        sablon_id: sablonId,
        template_version: sablon.versiyon ?? 1,
        kanal: 'MOBİL',
        kullanici_id: userId,
      })
      .select('id')
      .single()

    if (sonucErr || !sonucRow) return

    // Her maddenin ilk seçeneğini işaretle
    const maddeRows = maddeler.map((m: any) => {
      const secenekler = m.secenekler ?? []
      const ilkSecenek = secenekler.length > 0 ? secenekler[0] : null
      return {
        sonuc_id: sonucRow.id,
        madde_id: m.id,
        secenek_degeri: ilkSecenek?.deger ?? ilkSecenek?.label ?? 'Evet',
        aciklama: null,
        gorsel_url: null,
      }
    })

    await admin.from('checklist_sonuc_maddeleri').insert(maddeRows)
  } catch (e: any) {
    console.error(`[SIMULASYON] Çeklist hata (görev: ${gorevId}):`, e.message)
  }
}
