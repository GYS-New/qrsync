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
    const { data: ayarlar } = await admin
      .from('personel_gorev_destegi')
      .select('*')
      .eq('aktif', true)

    if (!ayarlar || ayarlar.length === 0) {
      return NextResponse.json({ ok: true, mesaj: 'Aktif destek yok', sonuclar: [] }, { headers: CORS })
    }

    for (const ayar of ayarlar) {
      const result = await destekCalistir(admin, ayar)
      sonuclar.push({ ayar_id: ayar.id, ust_lokasyon_id: ayar.ust_lokasyon_id, ...result })
    }

    return NextResponse.json({ ok: true, sonuclar }, { headers: CORS })
  } catch (e: any) {
    console.error('[PERSONEL-DESTEK] Hata:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS })
  }
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

  // Bugünkü görevleri çek (TRT)
  const gunBaslangicUTC = new Date(bugun + 'T00:00:00+03:00').toISOString()
  const gunBitisUTC = new Date(bugun + 'T23:59:59+03:00').toISOString()

  const { data: gorevler } = await admin
    .from('canli_gorevler')
    .select('id, durum, lokasyon_id, tanim, aktif_olma_tarihi, baslatilma_tarihi, atanan_kullanici_id')
    .eq('firma_id', firma_id)
    .in('lokasyon_id', lokIds)
    .gte('aktif_olma_tarihi', gunBaslangicUTC)
    .lte('aktif_olma_tarihi', gunBitisUTC)

  const tumGorevler = gorevler ?? []
  if (tumGorevler.length === 0) return { tamamlanan: 0, mesaj: 'Bugünkü görev yok' }

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

  // Firma personellerini çek (atanan kullanıcı öncelikli)
  const { data: personeller } = await admin
    .from('users')
    .select('id')
    .eq('firma_id', firma_id)
    .eq('aktif', true)
    .in('rol', ['tenant_user'])
    .limit(50)
  const personelIds = (personeller ?? []).map((p: any) => p.id)

  // Rastgele sırala ve hedef kadar tamamla
  const shuffled = acikGorevler.sort(() => Math.random() - 0.5).slice(0, kalanHedef)
  let tamamlananAdet = 0
  let iptalAdet = 0
  const now = Date.now()

  for (const gorev of shuffled) {
    const lok = lokMap.get(gorev.lokasyon_id)
    const personelId = gorev.atanan_kullanici_id
      || (personelIds.length > 0 ? personelIds[Math.floor(Math.random() * personelIds.length)] : null)
    if (!personelId) continue

    // %1 iptal olasılığı (doğallık)
    if (Math.random() < 0.01) {
      await admin.from('canli_gorevler').update({
        durum: 'IPTAL',
        durum_degisim_tarihi: new Date().toISOString(),
        iptal_eden_id: personelId,
        iptal_tarihi: new Date().toISOString(),
        islemi_yapan_id: personelId,
      } as any).eq('id', gorev.id)
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

    await admin.from('canli_gorevler').update({
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

    // Çeklist varsa tamamla
    if (lok?.checklist_sablon_id) {
      await ceklistTamamla(admin, gorev.id, lok.checklist_sablon_id, gorev.lokasyon_id, personelId)
    }

    tamamlananAdet++
  }

  return {
    tamamlanan: tamamlananAdet,
    iptal: iptalAdet,
    toplam: tumGorevler.length,
    mevcut_tamamlanan: tamamlananSayi,
    hedef_max: hedefMax,
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
