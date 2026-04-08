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

// Personelin son aktivitesini güncelle (online görünsün)
async function personelAktiviteGuncelle(admin: any, userId: string) {
  const nowIso = new Date().toISOString()
  // Önce mevcut device_tokens kaydını güncelle
  const { count } = await admin.from('device_tokens').update({ son_kullanim: nowIso }).eq('user_id', userId).eq('aktif', true)
  // Kayıt yoksa SİM için sanal device_token oluştur
  if (count === 0 || count === null) {
    const { data: existing } = await admin.from('device_tokens').select('id').eq('user_id', userId).maybeSingle()
    if (!existing) {
      // Kullanıcı bilgilerini al
      const { data: user } = await admin.from('users').select('firma_id, isim_soyisim').eq('id', userId).single()
      if (user) {
        await admin.from('device_tokens').insert({
          device_id: `sim-${userId}`,
          device_token: `sim-token-${userId}`,
          user_id: userId,
          firma_id: user.firma_id,
          isim_soyisim: user.isim_soyisim,
          aktif: true,
          son_kullanim: nowIso,
        })
      }
    } else {
      // Kayıt var ama aktif değil, güncelle
      await admin.from('device_tokens').update({ son_kullanim: nowIso, aktif: true }).eq('user_id', userId)
    }
  }
}

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

// ── Personel filtresi (cinsiyet bilgisiyle) ─────────────────────────────────
type PersonelBilgi = { id: string; cinsiyet: string | null }

async function filtreliPersonelGetir(admin: any, firmaId: string, projeId: string | null, personelIdler: string[]): Promise<PersonelBilgi[]> {
  const { data: users } = await admin
    .from('users')
    .select('id, cinsiyet')
    .in('id', personelIdler)
    .eq('aktif', true)

  let uygun: PersonelBilgi[] = (users ?? []).map((u: any) => ({ id: u.id, cinsiyet: u.cinsiyet ?? null }))
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
      uygun = uygun.filter(p => mesailiSet.has(p.id))
    }
  }

  return uygun
}

// ── Grup simülasyonu ────────────────────────────────────────────────────────
// Lokasyon adından cinsiyet gereksinimi belirle
function lokasyonCinsiyetBelirle(lokTanim: string): 'E' | 'K' | null {
  const upper = lokTanim.toUpperCase()
  if (upper.includes('BAYAN')) return 'K'
  if (upper.includes('BAY') && !upper.includes('BAYAN')) return 'E'
  return null // cinsiyet belirtilmemiş lokasyon
}

// Cinsiyet eşleştirmesiyle personel seç
function cinsiyetliPersonelSec(personeller: PersonelBilgi[], lokTanim: string): string {
  const gerekliCinsiyet = lokasyonCinsiyetBelirle(lokTanim)
  if (gerekliCinsiyet) {
    const uygunlar = personeller.filter(p => p.cinsiyet === gerekliCinsiyet)
    if (uygunlar.length > 0) return uygunlar[Math.floor(Math.random() * uygunlar.length)].id
  }
  // Cinsiyet eşleşmesi yoksa veya uygun personel yoksa rastgele seç
  return personeller[Math.floor(Math.random() * personeller.length)].id
}

async function grupSimulasyonCalistir(admin: any, ayar: any, grupAyar: any, uygunPersonel: PersonelBilgi[]) {
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
    .select('id, tanim, checklist_sablon_id, sureli_gorev_aktif, min_sure_dakika, max_sure_dakika, hedef_sure_dakika')
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
  const islemdeGorevler = tumGorevler.filter((g: any) => g.durum === 'ISLEMDE' && g.simule_tamamlandi === true)

  // ── Doğal akış: dakika başına görev oranı ─────────────────────────────
  const gorevPerDk = hedefMax / vardiyaDk
  const buCrondaIslem = Math.random() < gorevPerDk ? 1 : 0
  const ekIslem = Math.random() < 0.1 ? 1 : 0
  const maxIslem = buCrondaIslem + ekIslem

  let tamamlananAdet = 0
  let baslatmaAdet = 0
  let iptalAdet = 0

  // ── ADIM 1: ISLEMDE görevlerden süresi dolanları tamamla ──────────────
  for (const gorev of islemdeGorevler) {
    if (tamamlananSayi + tamamlananAdet >= hedefMax) break
    if (!gorev.baslatilma_tarihi) continue

    const baslatmaMs = new Date(gorev.baslatilma_tarihi).getTime()
    const lok = lokMap.get(gorev.lokasyon_id)
    const minDk = lok?.min_sure_dakika ?? 5
    const hedefDk = lok?.hedef_sure_dakika ?? 10
    const gecenDk = (now - baslatmaMs) / 60000

    // Min süreden önce asla tamamlama
    if (gecenDk < minDk) continue

    // Hedef süre ± %50 arası rastgele tamamlanma noktası
    const altSinir = Math.max(minDk, hedefDk * 0.5)
    const ustSinir = hedefDk * 1.5
    const tamamlanmaDk = altSinir + Math.random() * (ustSinir - altSinir)
    if (gecenDk < tamamlanmaDk) continue

    const sureSaniye = Math.round(gecenDk * 60)
    const tamamlanmaIso = new Date().toISOString()
    const personelId = gorev.baslatan_kullanici_id ?? cinsiyetliPersonelSec(uygunPersonel, lok?.tanim ?? '')

    await admin.from('canli_gorevler').update({
      durum: 'TAMAMLANDI',
      durum_degisim_tarihi: tamamlanmaIso,
      tamamlanma_tarihi: tamamlanmaIso,
      tamamlayan_kullanici_id: personelId,
      islemi_yapan_id: personelId,
      tamamlanma_suresi_saniye: sureSaniye,
      son_tamamlama_kanali: 'MOBIL',
    } as any).eq('id', gorev.id)

    if (lok?.checklist_sablon_id) {
      await simuleCeklistTamamla(admin, gorev.id, lok.checklist_sablon_id, gorev.lokasyon_id, personelId)
    }

    await personelAktiviteGuncelle(admin, personelId)
    tamamlananAdet++
  }

  // ── ADIM 2: ACIK görevleri başlat veya direkt tamamla ────────────────
  if (maxIslem > 0 && acikGorevler.length > 0 && (tamamlananSayi + tamamlananAdet) < hedefMax) {
    // Farklı lokasyonlardan dengeli seç (round-robin)
    const lokGruplari = new Map<string, any[]>()
    for (const g of acikGorevler) {
      const arr = lokGruplari.get(g.lokasyon_id) ?? []
      arr.push(g)
      lokGruplari.set(g.lokasyon_id, arr)
    }
    const lokKeys = [...lokGruplari.keys()].sort(() => Math.random() - 0.5)
    const secilen: any[] = []
    let idx = 0
    while (secilen.length < maxIslem && idx < acikGorevler.length) {
      const key = lokKeys[idx % lokKeys.length]
      const grp = lokGruplari.get(key)
      if (grp && grp.length > 0) {
        secilen.push(grp.splice(Math.floor(Math.random() * grp.length), 1)[0])
      }
      idx++
    }

    for (const gorev of secilen) {
      if ((tamamlananSayi + tamamlananAdet + baslatmaAdet) >= hedefMax) break

      const lok = lokMap.get(gorev.lokasyon_id)
      const personelId = cinsiyetliPersonelSec(uygunPersonel, lok?.tanim ?? '')

      // %1 iptal olasılığı
      if (Math.random() < IPTAL_OLASILIK) {
        await admin.from('canli_gorevler').update({
          durum: 'IPTAL',
          durum_degisim_tarihi: new Date().toISOString(),
          iptal_eden_id: personelId,
          iptal_tarihi: new Date().toISOString(),
          islemi_yapan_id: personelId,
          simule_tamamlandi: true,
        } as any).eq('id', gorev.id)
        await personelAktiviteGuncelle(admin, personelId)
        iptalAdet++
        continue
      }

      if (lok?.sureli_gorev_aktif) {
        // SG aktif → ISLEMDE yap, sonraki cron'larda süresi dolunca tamamlanacak
        await admin.from('canli_gorevler').update({
          durum: 'ISLEMDE',
          durum_degisim_tarihi: new Date().toISOString(),
          baslatilma_tarihi: new Date().toISOString(),
          baslatan_kullanici_id: personelId,
          islemi_yapan_id: personelId,
          simule_tamamlandi: true,
        } as any).eq('id', gorev.id)
        await personelAktiviteGuncelle(admin, personelId)
        baslatmaAdet++
      } else {
        // SG pasif → direkt TAMAMLANDI
        const varsayilanSureDk = vardiyaDk / Math.max(toplamGorev, 1)
        const sureSaniye = Math.round(varsayilanSureDk * 60 * (0.5 + Math.random() * 0.5))
        const tamamlanmaIso = new Date().toISOString()
        const baslatmaIso = new Date(Date.now() - sureSaniye * 1000).toISOString()

        await admin.from('canli_gorevler').update({
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
        } as any).eq('id', gorev.id)

        if (lok?.checklist_sablon_id) {
          await simuleCeklistTamamla(admin, gorev.id, lok.checklist_sablon_id, gorev.lokasyon_id, personelId)
        }

        await personelAktiviteGuncelle(admin, personelId)
        tamamlananAdet++
      }
    }
  }

  return {
    tamamlanan: tamamlananAdet,
    baslatilan: baslatmaAdet,
    iptal: iptalAdet,
    toplam: toplamGorev,
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

    // Her maddenin 1. seçeneğini işaretle (genelde "Yapıldı" — açıklama/görsel gerekmez)
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
    console.error(`[SIMULASYON] Çeklist hata (görev: ${gorevId}):`, e.message)
  }
}
