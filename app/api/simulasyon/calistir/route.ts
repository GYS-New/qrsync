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
import { gorevDurumPayload } from '@/lib/gorev/durum-degistir'

const CORS = {} // Cron endpoint — CORS gereksiz

// Personelin son aktivitesini güncelle (online görünsün)
async function personelAktiviteGuncelle(admin: any, userId: string) {
  const nowIso = new Date().toISOString()
  // Mevcut kayıt var mı?
  const { data: existing } = await admin.from('device_tokens').select('id, aktif').eq('user_id', userId).maybeSingle()
  if (existing) {
    // Güncelle
    await admin.from('device_tokens').update({ son_kullanim: nowIso, aktif: true }).eq('id', existing.id)
  } else {
    // Sanal kayıt oluştur
    const { data: user } = await admin.from('users').select('firma_id, isim_soyisim').eq('id', userId).single()
    if (user) {
      await admin.from('device_tokens').upsert({
        device_id: `sim-${userId}`,
        device_token: `sim-token-${userId}`,
        user_id: userId,
        firma_id: user.firma_id,
        isim_soyisim: user.isim_soyisim,
        aktif: true,
        son_kullanim: nowIso,
      }, { onConflict: 'device_id' })
    }
  }
}

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
      .from('simulasyon_ayarlari')
      .select('*')
      .eq('aktif', true)

    if (!ayarlar || ayarlar.length === 0) {
      return NextResponse.json({ ok: true, mesaj: 'Aktif simülasyon yok', sonuclar: [] }, { headers: CORS })
    }

    console.log(`[SIMULASYON] ${ayarlar.length} aktif ayar bulundu`)

    for (const ayar of ayarlar) {
      const [grupRes, personelRes] = await Promise.all([
        admin.from('simulasyon_grup_ayarlari').select('*').eq('simulasyon_id', ayar.id),
        admin.from('simulasyon_personeller').select('user_id').eq('simulasyon_id', ayar.id),
      ])

      const grupAyarlari = grupRes.data ?? []
      const personelIdler = (personelRes.data ?? []).map((p: any) => p.user_id)
      console.log(`[SIMULASYON] Ayar ${ayar.id}: grup=${grupAyarlari.length}, personel=${personelIdler.length}, firma=${ayar.firma_id}, proje=${ayar.proje_id}`)
      if (grupAyarlari.length === 0 || personelIdler.length === 0) { console.log('[SIMULASYON] SKIP: grup veya personel yok'); continue }

      const uygunPersonel = await filtreliPersonelGetir(admin, ayar.firma_id, ayar.proje_id, personelIdler)
      console.log(`[SIMULASYON] Uygun personel: ${uygunPersonel.length}`)
      if (uygunPersonel.length === 0) { console.log('[SIMULASYON] SKIP: uygun personel yok (mesai kontrolü?)'); continue }

      for (const ga of grupAyarlari) {
        const result = await grupSimulasyonCalistir(admin, ayar, ga, uygunPersonel)
        sonuclar.push({ ayar_id: ayar.id, firma_id: ayar.firma_id, proje_id: ayar.proje_id, grup_id: ga.grup_id, ...result })
      }
    }

    // Audit — tamamlanan görev varsa logla
    const toplamTamamlanan = sonuclar.reduce((s: number, r: any) => s + (r.tamamlanan ?? 0), 0)
    if (toplamTamamlanan > 0) {
      const { auditLog } = await import('@/lib/audit/log')
      await auditLog({
        tip: 'cron_simulasyon', tablo: 'canli_gorevler',
        satir_sayisi: toplamTamamlanan,
        detay: { toplam_tamamlanan: toplamTamamlanan, ozet: sonuclar.filter((s: any) => (s.tamamlanan ?? 0) > 0) },
      })
    }

    return NextResponse.json({ ok: true, sonuclar }, { headers: CORS })
  } catch (e: any) {
    console.error('[SIMULASYON] Hata:', e)
    try {
      const { auditLog } = await import('@/lib/audit/log')
      await auditLog({
        tip: 'cron_simulasyon', tablo: 'canli_gorevler', basarili: false, hata_mesaji: e.message,
      })
    } catch {}
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
      const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
      const { data: mesailar } = await admin
        .from('personel_mesai_kayitlari')
        .select('user_id')
        .eq('firma_id', firmaId)
        .eq('kayit_tarihi', bugun)
        .is('cikis_saati', null)
      const mesailiSet = new Set((mesailar ?? []).map((m: any) => m.user_id))
      const mesailiPersonel = uygun.filter(p => mesailiSet.has(p.id))
      // Simülasyon: mesaili personel yoksa, tüm sim personellerini kullan (mesai bypass)
      if (mesailiPersonel.length > 0) {
        uygun = mesailiPersonel
      } else {
        console.log(`[SIMULASYON] Mesaili personel yok — sim personelleri ile devam ediliyor (${uygun.length} kişi)`)
      }
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
  const bugun = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' })
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

  // Bugünkü canlı görevler (TRT tarih aralığı — UTC'ye çevir)
  const gunBaslangicUTC = new Date(bugun + 'T00:00:00+03:00').toISOString()
  const gunBitisUTC = new Date(bugun + 'T23:59:59+03:00').toISOString()

  const { data: gorevler } = await admin
    .from('canli_gorevler')
    .select('id, durum, lokasyon_id, tanim, aktif_olma_tarihi, baslatilma_tarihi, simule_tamamlandi')
    .eq('firma_id', firma_id)
    .in('lokasyon_id', lokIds)
    .gte('aktif_olma_tarihi', gunBaslangicUTC)
    .lte('aktif_olma_tarihi', gunBitisUTC)

  const tumGorevler = gorevler ?? []
  const toplamGorev = tumGorevler.length
  if (toplamGorev === 0) return { tamamlanan: 0, iptal: 0, mesaj: 'Bugünkü görev yok' }

  // ── Tamamlama aralığı hesabı ──────────────────────────────────────────
  const vardiyaDk = vardiya_suresi_saat * 60
  const tamamlananSayi = tumGorevler.filter((g: any) =>
    ['TAMAMLANDI', 'ZAMANINDA_TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'].includes(g.durum)
  ).length

  // AÇIK ve İŞLEMDE görevler (SİM'in tamamlayabileceği)
  const acikGorevler = tumGorevler.filter((g: any) => g.durum === 'ACIK')
  const islemdeGorevler = tumGorevler.filter((g: any) => g.durum === 'ISLEMDE' && g.simule_tamamlandi === true)

  // Vardiya bazlı hedef: sadece şu an AÇIK olan görevlerin ait olduğu vardiyayı hesapla
  // Aktif görevlerin en erken aktif_olma_tarihi = bu vardiya başlangıcı
  const acikVeIslemde = [...acikGorevler, ...islemdeGorevler]
  if (acikVeIslemde.length === 0 && tamamlananSayi > 0) {
    return { tamamlanan: 0, iptal: 0, mesaj: 'Tamamlanacak AÇIK görev yok' }
  }

  // Bu vardiya grubundaki görevler: aynı aktif_olma_tarihi olan görevler
  // Her vardiya farklı aktif_olma_tarihi'ne sahip (00:05, 08:00, 16:00)
  const vardiyaGruplari = new Map<string, any[]>()
  for (const g of tumGorevler) {
    const key = (g as any).aktif_olma_tarihi
    if (!vardiyaGruplari.has(key)) vardiyaGruplari.set(key, [])
    vardiyaGruplari.get(key)!.push(g)
  }

  // Aktif vardiya: AÇIK görevleri olan vardiyalar
  let vardiyaGorevSayisi = 0
  let vardiyaTamamlanan = 0
  let vardiyaBaslangic: number | null = null
  for (const [key, grp] of vardiyaGruplari) {
    const acikVar = grp.some((g: any) => g.durum === 'ACIK' || (g.durum === 'ISLEMDE' && g.simule_tamamlandi))
    if (acikVar) {
      vardiyaGorevSayisi += grp.length
      vardiyaTamamlanan += grp.filter((g: any) =>
        ['TAMAMLANDI', 'ZAMANINDA_TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'].includes(g.durum)
      ).length
      const t = new Date(key).getTime()
      if (!vardiyaBaslangic || t < vardiyaBaslangic) vardiyaBaslangic = t
    }
  }

  if (vardiyaGorevSayisi === 0) vardiyaGorevSayisi = toplamGorev
  if (vardiyaBaslangic === null) vardiyaBaslangic = now

  const vardiyaHedefMax = Math.ceil((hedef_oran / 100) * vardiyaGorevSayisi)
  const hedefMax = Math.ceil((hedef_oran / 100) * toplamGorev)

  if (vardiyaTamamlanan >= vardiyaHedefMax) {
    return { tamamlanan: 0, iptal: 0, mesaj: `Vardiya hedefe ulaştı: ${vardiyaTamamlanan}/${vardiyaHedefMax}` }
  }

  if (tamamlananSayi >= hedefMax) {
    return { tamamlanan: 0, iptal: 0, mesaj: `Hedef zaten sağlandı: ${tamamlananSayi}/${hedefMax}` }
  }

  // ── Eşit dağılım: sabit dakika başına oran ─────────────────────────────
  // gorevPerDk = vardiyaHedefMax / vardiyaDk — vardiya boyunca SABİT tempo.
  // Eski formül (kalanHedef / kalanDk) vardiya sonuna yaklaştıkça kalanDk küçüldüğü
  // için gorevPerDk patlıyordu (07:45'te 48 görev, 08:00'da 95 görev gözlendi).
  // Gerçek personel vardiya sonunda hızlanmaz; kalan görevleri personel-destek
  // cron'u kapatır. Bu yüzden SİM'in sabit hızda yürümesi daha doğru bir model.
  const kalanHedef = vardiyaHedefMax - vardiyaTamamlanan
  const gecenDk = Math.max(1, Math.round((now - vardiyaBaslangic) / 60000))
  const kalanDk = Math.max(1, vardiyaDk - gecenDk)
  const gorevPerDk = vardiyaHedefMax / vardiyaDk
  // Doğal dağılım: tam kısmı garanti, kalan ondalık kısmı olasılıklı.
  // Örn 0.3 → %30 şans 1 görev | 1.6 → garanti 1 + %60 şans 2 | 2.4 → garanti 2 + %40 şans 3
  const tamKisim = Math.floor(gorevPerDk)
  const kalan = gorevPerDk - tamKisim
  const maxIslem = tamKisim + (Math.random() < kalan ? 1 : 0)

  if (maxIslem <= 0) {
    return { tamamlanan: 0, baslatilan: 0, iptal: 0, mesaj: 'Bu cron turunda sıra gelmedi', toplam: toplamGorev, hedef_max: hedefMax, vardiya_hedef: vardiyaHedefMax, vardiya_tamamlanan: vardiyaTamamlanan, kalan_dk: kalanDk, gorev_per_dk: gorevPerDk }
  }

  let tamamlananAdet = 0
  let baslatmaAdet = 0
  let iptalAdet = 0
  let islemSayaci = 0 // bu cron'da yapılan toplam işlem

  // ── ADIM 1: ISLEMDE görevlerden süresi dolanları tamamla (max 1 per cron) ──
  for (const gorev of islemdeGorevler) {
    if (tamamlananSayi + tamamlananAdet >= hedefMax) break
    if (islemSayaci >= maxIslem) break
    if (!gorev.baslatilma_tarihi) continue

    const baslatmaMs = new Date(gorev.baslatilma_tarihi).getTime()
    const lok = lokMap.get(gorev.lokasyon_id)
    const minDk = lok?.min_sure_dakika ?? 5
    const hedefDk = lok?.hedef_sure_dakika ?? 10
    const gecenDk = (now - baslatmaMs) / 60000

    // Min süreden önce asla tamamlama
    if (gecenDk < minDk) continue

    // Hedef süre ± %50 arası rastgele tamamlanma noktası + sapma olasılıkları (DB'den)
    const erkenOran = (grupAyar.erken_50_orani ?? 2) / 100
    const gecCokOran = (grupAyar.gec_100_orani ?? 2) / 100
    const gecOran = (grupAyar.gec_50_orani ?? 3) / 100
    const altSinir = Math.max(minDk, hedefDk * 0.5)
    let ustSinir = hedefDk * 1.5
    const sapmaRulet = Math.random()
    if (sapmaRulet < erkenOran) {
      ustSinir = Math.max(minDk + 1, hedefDk * 0.75)
    } else if (sapmaRulet < erkenOran + gecCokOran) {
      ustSinir = hedefDk * 3
    } else if (sapmaRulet < erkenOran + gecCokOran + gecOran) {
      ustSinir = hedefDk * 2.25
    }
    const tamamlanmaDk = altSinir + Math.random() * (ustSinir - altSinir)
    if (gecenDk < tamamlanmaDk) continue

    const sureSaniye = Math.round(gecenDk * 60)
    const tamamlanmaIso = new Date().toISOString()
    const personelId = gorev.baslatan_kullanici_id ?? cinsiyetliPersonelSec(uygunPersonel, lok?.tanim ?? '')

    // %1 iptal olasılığı
    if (Math.random() < (grupAyar.iptal_orani ?? 1) / 100) {
      await admin.from('canli_gorevler').update(gorevDurumPayload('IPTAL', 'MOBIL', {
        at: tamamlanmaIso,
        iptal_sebep: 'Otomatik iptal — simülasyon',
        ek: {
          iptal_eden_id: personelId, iptal_tarihi: tamamlanmaIso,
          islemi_yapan_id: personelId, simule_tamamlandi: true,
        },
      }) as any).eq('id', gorev.id)
      await personelAktiviteGuncelle(admin, personelId)
      iptalAdet++; islemSayaci++
      continue
    }

    await admin.from('canli_gorevler').update(gorevDurumPayload('TAMAMLANDI', 'MOBIL', {
      at: tamamlanmaIso,
      ek: {
        tamamlanma_tarihi: tamamlanmaIso,
        tamamlayan_kullanici_id: personelId,
        islemi_yapan_id: personelId,
        tamamlanma_suresi_saniye: sureSaniye,
      },
    }) as any).eq('id', gorev.id)

    if (lok?.checklist_sablon_id) {
      await simuleCeklistTamamla(admin, gorev.id, lok.checklist_sablon_id, gorev.lokasyon_id, personelId)
    }

    await personelAktiviteGuncelle(admin, personelId)
    tamamlananAdet++; islemSayaci++
  }

  // ── ADIM 2: ACIK görevleri başlat veya direkt tamamla ────────────────
  const kalanIslem = maxIslem - islemSayaci
  if (kalanIslem > 0 && acikGorevler.length > 0 && (tamamlananSayi + tamamlananAdet) < hedefMax) {
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
    while (secilen.length < kalanIslem && idx < acikGorevler.length) {
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
      if (Math.random() < (grupAyar.iptal_orani ?? 1) / 100) {
        const iptalIso = new Date().toISOString()
        await admin.from('canli_gorevler').update(gorevDurumPayload('IPTAL', 'MOBIL', {
          at: iptalIso,
          iptal_sebep: 'Otomatik iptal — simülasyon',
          ek: {
            iptal_eden_id: personelId,
            iptal_tarihi: iptalIso,
            islemi_yapan_id: personelId,
            simule_tamamlandi: true,
          },
        }) as any).eq('id', gorev.id)
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

        await admin.from('canli_gorevler').update(gorevDurumPayload('TAMAMLANDI', 'MOBIL', {
          at: tamamlanmaIso,
          ek: {
            baslatilma_tarihi: baslatmaIso,
            baslatan_kullanici_id: personelId,
            tamamlanma_tarihi: tamamlanmaIso,
            tamamlayan_kullanici_id: personelId,
            islemi_yapan_id: personelId,
            tamamlanma_suresi_saniye: sureSaniye,
            simule_tamamlandi: true,
          },
        }) as any).eq('id', gorev.id)

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

    // Madde insert hatasında başlığı da rollback et — maddesiz orphan başlık kalmasın
    // (18 Nisan incident kökü: hata sessizce yutuluyordu, başlık kaldı, maddeler yok)
    const { error: maddeErr } = await admin.from('checklist_sonuc_maddeleri').insert(maddeRows)
    if (maddeErr) {
      await admin.from('checklist_sonuc_basliklari').delete().eq('id', sonucRow.id)
      console.error(`[SIMULASYON] Madde insert basarisiz, baslik rollback edildi (gorev: ${gorevId}):`, maddeErr.message)
      return
    }
  } catch (e: any) {
    console.error(`[SIMULASYON] Çeklist hata (görev: ${gorevId}):`, e.message)
  }
}
