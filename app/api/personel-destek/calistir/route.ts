/**
 * POST /api/personel-destek/calistir
 * Personel Görev Desteği motoru — vardiya sonu otomatik tamamlama
 *
 * Mantık (SİM benzeri doğallık):
 * 1. Aktif personel_gorev_destegi kayıtlarını çek
 * 2. Her üst lokasyonun alt lokasyonlarındaki bugünkü AÇIK görevleri bul
 * 3. hedef_oran'a göre kaç görev tamamlanmalı hesapla
 * 4. Eksik kalan görevleri çeklist ile birlikte tamamla
 * 5. Doğallık: rastgele süre, rastgele personel, %1 iptal
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { aktifVardiyaAraligi } from '@/lib/scan/vardiya'

const CORS = {} // Cron endpoint — CORS gereksiz

export async function POST(req: Request) {
  const cronToken = req.headers.get('x-cron-token')
  const secret = process.env.CRON_SECRET
  if (!secret || cronToken !== secret) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401, headers: CORS })
  }

  const admin = createAdminClient()
  const sonuclar: any[] = []

  try {
    const { data: ayarlar } = await admin
      .from('personel_gorev_destegi')
      .select('*')
      .eq('aktif', true)

    if (!ayarlar || ayarlar.length === 0) {
      return NextResponse.json({ ok: true, mesaj: 'Aktif destek yok', sonuclar: [] }, { headers: CORS })
    }

    for (const ayar of ayarlar) {
      const result = await destekCalistir(admin, ayar)
      sonuclar.push({ ayar_id: ayar.id, firma_id: ayar.firma_id, proje_id: ayar.proje_id, ust_lokasyon_id: ayar.ust_lokasyon_id, ...result })
    }

    // Audit — tamamlanan görev varsa logla
    const toplamTamamlanan = sonuclar.reduce((s: number, r: any) => s + (r.tamamlanan ?? 0), 0)
    if (toplamTamamlanan > 0) {
      const { auditLog } = await import('@/lib/audit/log')
      await auditLog({
        tip: 'cron_personel_destek', tablo: 'canli_gorevler',
        satir_sayisi: toplamTamamlanan,
        detay: { toplam_tamamlanan: toplamTamamlanan, ozet: sonuclar.filter((s: any) => (s.tamamlanan ?? 0) > 0) },
      })
    }

    return NextResponse.json({ ok: true, sonuclar }, { headers: CORS })
  } catch (e: any) {
    console.error('[PERSONEL-DESTEK] Hata:', e)
    try {
      const { auditLog } = await import('@/lib/audit/log')
      await auditLog({
        tip: 'cron_personel_destek', tablo: 'canli_gorevler', basarili: false, hata_mesaji: e.message,
      })
    } catch {}
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS })
  }
}

// ── Cinsiyet eşleştirmesi ────────────────────────────────────────────────
type PersonelBilgi = { id: string; cinsiyet: string | null }

function lokasyonCinsiyetBelirle(lokTanim: string): 'E' | 'K' | null {
  const upper = lokTanim.toUpperCase()
  if (upper.includes('BAYAN')) return 'K'
  if (upper.includes('BAY') && !upper.includes('BAYAN')) return 'E'
  return null
}

function cinsiyetliPersonelSec(personeller: PersonelBilgi[], lokTanim: string): string | null {
  if (personeller.length === 0) return null
  const gerekliCinsiyet = lokasyonCinsiyetBelirle(lokTanim)
  if (gerekliCinsiyet) {
    const uygunlar = personeller.filter(p => p.cinsiyet === gerekliCinsiyet)
    if (uygunlar.length > 0) return uygunlar[Math.floor(Math.random() * uygunlar.length)].id
  }
  return personeller[Math.floor(Math.random() * personeller.length)].id
}

async function destekCalistir(admin: any, ayar: any) {
  const { firma_id, proje_id, ust_lokasyon_id, hedef_oran } = ayar
  const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

  // Üst lokasyonun tüm alt lokasyonlarını BFS ile bul
  const { data: tumLokasyonlar } = await admin
    .from('lokasyonlar')
    .select('id, parent_id, tanim, checklist_sablon_id, sureli_gorev_aktif, min_sure_dakika, hedef_sure_dakika')
    .eq('firma_id', firma_id)
  if (!tumLokasyonlar) return { tamamlanan: 0, mesaj: 'Lokasyon yok' }

  const altLokIds = new Set<string>([ust_lokasyon_id])
  const queue = [ust_lokasyon_id]
  while (queue.length > 0) {
    const cur = queue.shift()!
    for (const l of tumLokasyonlar) {
      if (l.parent_id === cur && !altLokIds.has(l.id)) {
        altLokIds.add(l.id)
        queue.push(l.id)
      }
    }
  }
  const lokIds = [...altLokIds]

  const lokMap = new Map<string, any>()
  for (const l of tumLokasyonlar) {
    if (altLokIds.has(l.id)) lokMap.set(l.id, l)
  }

  // Son 24 saatin görevlerini çek — TR gün kayması problemini önler.
  // Örnek: 00:05 TRT cron çalışırsa dünün V3 (16:00-00:00) kalanları 'bugun' dışında
  // kalıyordu. Son 24 saat window ile önceki akşam vardiyası da yakalanır.
  // (Gelecek zamanlı HAZIR görevler filter'a girer ama acikGorevler = ACIK/ISLEMDE/BEKLEMEDE
  // filter'ında dışarıda kalır, kapatma denemesi olmaz.)
  const yirmiDortSaatOnceUTC = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const simdiUTC = new Date().toISOString()

  const { data: gorevler } = await admin
    .from('canli_gorevler')
    .select('id, durum, lokasyon_id, tanim, aktif_olma_tarihi, baslatilma_tarihi, atanan_kullanici_id')
    .eq('firma_id', firma_id)
    .in('lokasyon_id', lokIds)
    .gte('aktif_olma_tarihi', yirmiDortSaatOnceUTC)
    .lte('aktif_olma_tarihi', simdiUTC)

  const gunlukTumGorevler = gorevler ?? []
  if (gunlukTumGorevler.length === 0) return { tamamlanan: 0, mesaj: 'Bugünkü görev yok' }

  // ── Vardiya filtresi: SAAT ARALIĞI bazlı (firma.tum_vardiya_ayarlari) ────
  // Eski mantık distinct aktif_olma_tarihi timestamp'lerine bakıyordu; her kural
  // ayrı saatte tetiklendiği için bir vardiyada onlarca distinct timestamp olabilir,
  // ve yanlış olarak sadece 'en geç tek timestamp' aktif vardiya sayılırdı.
  // Doğrusu: firma'nın tanımlı vardiya saatlerinden şu an içinde olunan vardiyayı
  // bul, aktif_olma_tarihi bu aralıkta olan görevleri 'aktif vardiya' kabul edip
  // hariç tut — böylece bitmiş vardiyaların tüm görevleri doğru toplanır.
  const { data: firmaAyar } = await admin
    .from('firmalar')
    .select('vardiya_sayisi, tum_vardiya_ayarlari')
    .eq('id', firma_id)
    .single()
  const aktifVardiya = aktifVardiyaAraligi(
    (firmaAyar as any)?.vardiya_sayisi,
    (firmaAyar as any)?.tum_vardiya_ayarlari,
  )
  if (!aktifVardiya) {
    return { tamamlanan: 0, mesaj: 'Aktif vardiya tespit edilemedi (firma ayarı eksik)' }
  }
  const tumGorevler = gunlukTumGorevler.filter((g: any) =>
    g.aktif_olma_tarihi < aktifVardiya.baslangicISO || g.aktif_olma_tarihi >= aktifVardiya.bitisISO
  )
  if (tumGorevler.length === 0) return { tamamlanan: 0, mesaj: 'Bitmiş vardiyada görev yok' }

  const tamamlananSayi = tumGorevler.filter((g: any) =>
    ['TAMAMLANDI', 'ZAMANINDA_TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'].includes(g.durum)
  ).length
  const hedefMax = Math.ceil((hedef_oran / 100) * tumGorevler.length)

  if (tamamlananSayi >= hedefMax) {
    return { tamamlanan: 0, mesaj: `Hedef zaten sağlandı: ${tamamlananSayi}/${hedefMax}` }
  }

  // AÇIK, İŞLEMDE ve BEKLEMEDE görevleri tamamla
  const acikGorevler = tumGorevler.filter((g: any) => g.durum === 'ACIK' || g.durum === 'ISLEMDE' || g.durum === 'BEKLEMEDE')
  const kalanHedef = hedefMax - tamamlananSayi

  // ── Personel seçimi: tanımlı personeller + cinsiyet + mesai kontrolü (SİM ile aynı) ──
  // Önce bu destek kaydına atanmış personelleri çek
  const { data: destekPersoneller } = await admin
    .from('personel_destek_personeller')
    .select('user_id')
    .eq('destek_id', ayar.id)
  const destekPersonelIds = (destekPersoneller ?? []).map((p: any) => p.user_id)

  // Atanmış personel yoksa çalışma
  if (destekPersonelIds.length === 0) return { tamamlanan: 0, mesaj: 'Personel atanmamış' }

  const { data: tumPersoneller } = await admin
    .from('users')
    .select('id, cinsiyet')
    .in('id', destekPersonelIds)
    .eq('aktif', true)

  let uygunPersonel: PersonelBilgi[] = (tumPersoneller ?? []).map((u: any) => ({
    id: u.id,
    cinsiyet: u.cinsiyet ?? null,
  }))

  // Mesai kontrolü: PT aktifse önce mesaili personelleri tercih et; yoksa atanan
  // personellerle devam (SIM ile tutarlı fallback — aksi halde hiç kimse iş başı
  // yapmamışsa görevler hiç kapanmaz, BEKLEMEDE'de kalır).
  if (proje_id) {
    const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', proje_id).single()
    if (proje?.personel_takibi_aktif === true) {
      const { data: mesailar } = await admin
        .from('personel_mesai_kayitlari')
        .select('user_id')
        .eq('firma_id', firma_id)
        .eq('kayit_tarihi', bugun)
        .is('cikis_saati', null)
      const mesailiSet = new Set((mesailar ?? []).map((m: any) => m.user_id))
      const mesailiPersonel = uygunPersonel.filter(p => mesailiSet.has(p.id))
      if (mesailiPersonel.length > 0) {
        uygunPersonel = mesailiPersonel
      } else {
        console.log(`[PERSONEL-DESTEK] Mesaili personel yok — atanan personellerle devam (${uygunPersonel.length} kişi)`)
      }
    }
  }

  if (uygunPersonel.length === 0) return { tamamlanan: 0, mesaj: 'Uygun personel yok' }

  // Rastgele sırala ve hedef kadar tamamla
  const shuffled = acikGorevler.sort(() => Math.random() - 0.5).slice(0, kalanHedef)
  let tamamlananAdet = 0
  let iptalAdet = 0
  let skipPersonelCount = 0
  let updateErrorCount = 0
  const logPrefix = `[PD-${ayar.id.slice(0, 8)}]`
  console.log(`${logPrefix} DÖNGÜ BAŞLIYOR — shuffled=${shuffled.length}, uygunPersonel=${uygunPersonel.length}, ilkAtanan=${shuffled[0]?.atanan_kullanici_id ?? 'NULL'}, ilkLok=${shuffled[0]?.lokasyon_id?.slice(0, 8) ?? 'NULL'}`)
  const now = Date.now()

  for (const gorev of shuffled) {
    const lok = lokMap.get(gorev.lokasyon_id)
    // Öncelik: atanan personel, yoksa cinsiyet eşleştirmeli rastgele seç
    const personelId = gorev.atanan_kullanici_id
      || cinsiyetliPersonelSec(uygunPersonel, lok?.tanim ?? '')
    if (!personelId) {
      skipPersonelCount++
      continue
    }

    // %1 iptal olasılığı (doğallık)
    if (Math.random() < 0.01) {
      const { error: iptalErr } = await admin.from('canli_gorevler').update({
        durum: 'IPTAL',
        durum_degisim_tarihi: new Date().toISOString(),
        iptal_eden_id: personelId,
        iptal_tarihi: new Date().toISOString(),
        islemi_yapan_id: personelId,
        iptal_sebep: 'Otomatik iptal — personel destek (vardiya bitti)',
        son_tamamlama_kanali: 'MOBIL',
      } as any).eq('id', gorev.id)
      if (iptalErr) { updateErrorCount++; console.log(`${logPrefix} IPTAL HATA: ${iptalErr.message}`) }
      iptalAdet++
      continue
    }

    // Doğal süre hesapla
    const hedefDk = lok?.hedef_sure_dakika ?? 10
    const minDk = lok?.min_sure_dakika ?? 3
    const sureDk = minDk + Math.random() * (hedefDk * 1.5 - minDk)
    const sureSaniye = Math.round(sureDk * 60)
    const tamamlanmaIso = new Date().toISOString()
    const baslatmaIso = new Date(now - sureSaniye * 1000).toISOString()

    const { error: tamamErr } = await admin.from('canli_gorevler').update({
      durum: 'TAMAMLANDI',
      durum_degisim_tarihi: tamamlanmaIso,
      baslatilma_tarihi: gorev.baslatilma_tarihi || baslatmaIso,
      baslatan_kullanici_id: personelId,
      tamamlanma_tarihi: tamamlanmaIso,
      tamamlayan_kullanici_id: personelId,
      islemi_yapan_id: personelId,
      tamamlanma_suresi_saniye: sureSaniye,
      son_tamamlama_kanali: 'MOBIL',
    } as any).eq('id', gorev.id)

    if (tamamErr) {
      updateErrorCount++
      console.log(`${logPrefix} UPDATE HATA: gorev=${gorev.id.slice(0,8)}, msg=${tamamErr.message}`)
      continue
    }

    // Çeklist varsa tamamla
    if (lok?.checklist_sablon_id) {
      await ceklistTamamla(admin, gorev.id, lok.checklist_sablon_id, gorev.lokasyon_id, personelId)
    }

    tamamlananAdet++
  }

  console.log(`${logPrefix} DÖNGÜ BİTTİ — tamamlanan=${tamamlananAdet}, iptal=${iptalAdet}, skipPersonel=${skipPersonelCount}, updateError=${updateErrorCount}`)

  return {
    tamamlanan: tamamlananAdet,
    iptal: iptalAdet,
    toplam: tumGorevler.length,
    mevcut_tamamlanan: tamamlananSayi,
    hedef_max: hedefMax,
    debug: { skipPersonel: skipPersonelCount, updateError: updateErrorCount, shuffled: shuffled.length },
  }
}

// ── Çeklist tamamla (SİM ile aynı mantık) ──────────────────────────────
async function ceklistTamamla(admin: any, gorevId: string, sablonId: string, lokasyonId: string, userId: string) {
  try {
    const { data: sablon } = await admin.from('checklist_sablonlari').select('id, baslik, versiyon').eq('id', sablonId).single()
    if (!sablon) return

    const { data: maddeler } = await admin
      .from('checklist_sablon_maddeleri')
      .select('id, baslik, zorunlu_cevap, gorsel_gerekli')
      .eq('sablon_id', sablonId)
      .order('sira_no', { ascending: true })
    if (!maddeler || maddeler.length === 0) return

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
      const secenekler = secenekMap.get(m.id) ?? []
      const ilk = secenekler.length > 0 ? secenekler[0] : null
      return {
        sonuc_id: sonucRow.id,
        madde_id: m.id,
        secenek_degeri: ilk?.deger ?? 'Yapıldı',
        aciklama: null,
        gorsel_url: null,
      }
    })

    await admin.from('checklist_sonuc_maddeleri').insert(maddeRows)
  } catch (e: any) {
    console.error(`[PERSONEL-DESTEK] Çeklist hata (görev: ${gorevId}):`, e.message)
  }
}
