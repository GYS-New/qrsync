/**
 * POST /api/app/offline-sync
 *
 * Mobil cihaz şebekeye döndüğünde biriken offline kayıtları toplu gönderir.
 * Her kayıt için bağımsız işlenir; biri hata verse diğerleri etkilenmez.
 *
 * Çatışma kuralı: Görev online tarafta başkası tarafından tamamlanmış/iptal edilmişse
 * offline kaydı **yok sayılır** — online kazanır (`status: 'cakismali'`).
 *
 * Kanal: Tüm başarılı yazımlar `son_tamamlama_kanali = 'OFFLINE'` olarak işaretlenir.
 * Çeklist yazımında da `kanal = 'OFFLINE'`.
 *
 * Body:
 *   {
 *     kayitlar: [
 *       {
 *         _mobil_kayit_id: string,             // idempotency için mobilin uuid'si
 *         gorev_tipi: 'gorevler' | 'canli_gorevler',
 *         lokasyon_id: string,
 *         baslatilma_zamani: ISO,              // cihaz zamanı
 *         bitirme_zamani: ISO,                 // cihaz zamanı
 *         maddeler?: [{ madde_id, secenek_degeri, aciklama?, gorsel_url? }],
 *         ekstra_mi: boolean,
 *         // Normal görev için:
 *         gorev_id?: string,
 *         // Ekstra görev için:
 *         tanim?: string,
 *       },
 *       ...
 *     ]
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     sonuclar: [
 *       { _mobil_kayit_id, status: 'ok' | 'cakismali' | 'hata', mesaj?, error? }
 *     ]
 *   }
 *
 * Header: X-Device-Token
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveLiveCompletionStatusByTask } from '@/lib/tasks/liveStatus'
import { auditLog } from '@/lib/audit/log'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

type TaskType = 'gorevler' | 'canli_gorevler'

type OfflineKayit = {
  _mobil_kayit_id: string
  gorev_tipi: TaskType
  lokasyon_id: string
  baslatilma_zamani: string
  bitirme_zamani: string
  maddeler?: Array<{
    madde_id: string
    secenek_degeri?: string | null
    aciklama?: string | null
    gorsel_url?: string | null
  }>
  ekstra_mi?: boolean
  gorev_id?: string
  tanim?: string
}

type Sonuc = {
  _mobil_kayit_id: string
  status: 'ok' | 'cakismali' | 'hata'
  mesaj?: string
  error?: string
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/** İki tarih farkı (saniye). Geçersizse null. */
function sureSaniye(baslangic: string, bitis: string): number | null {
  const b = new Date(baslangic).getTime()
  const e = new Date(bitis).getTime()
  if (!Number.isFinite(b) || !Number.isFinite(e)) return null
  return Math.max(0, Math.floor((e - b) / 1000))
}

/**
 * Sanity check — cihaz saati yanlışsa rejection.
 * Kurallar:
 *   - baslatilma < bitirme zorunlu
 *   - bitirme gelecekte ≤ 5 dk (clock skew toleransı)
 *   - baslatilma son 25 saat içinde (20 saat TTL + 5 saat pay)
 *
 * Dönüş: null = OK, string = hata mesajı.
 */
function zamanSanityCheck(baslatilma: string, bitirme: string): string | null {
  const b = new Date(baslatilma).getTime()
  const e = new Date(bitirme).getTime()
  if (!Number.isFinite(b) || !Number.isFinite(e)) return 'Geçersiz ISO zaman damgası'
  if (e <= b) return 'bitirme_zamani baslatilma_zamani\'ndan sonra olmalı'
  const simdi = Date.now()
  if (e > simdi + 5 * 60 * 1000) return 'Cihaz saati ileri (bitirme gelecekte)'
  if (b < simdi - 25 * 60 * 60 * 1000) return 'Kayıt TTL dışında (25 saatten eski)'
  return null
}

/** Bir lokasyonun checklist şablonu var mı — çeklist kaydı için gerekli */
async function lokasyonCeklistSablon(admin: any, lokasyonId: string): Promise<string | null> {
  const { data } = await admin.from('lokasyonlar').select('checklist_sablon_id').eq('id', lokasyonId).maybeSingle()
  return (data as any)?.checklist_sablon_id ?? null
}

/** Normal görev tamamlama (ekstra değil) */
async function normalGoreviTamamla(
  admin: any,
  userId: string,
  firmaId: string,
  kayit: OfflineKayit,
): Promise<Sonuc> {
  if (!kayit.gorev_id) {
    return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'gorev_id gerekli (ekstra değilse)' }
  }

  // Idempotency — bu mobil_kayit_id daha önce işlenmiş mi?
  const { data: mevcutSync } = await admin
    .from(kayit.gorev_tipi)
    .select('id')
    .eq('mobil_kayit_id', kayit._mobil_kayit_id)
    .maybeSingle()
  if (mevcutSync) {
    return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'ok', mesaj: 'Zaten senkron edilmiş (idempotent)' }
  }

  // Zaman damgası sanity check
  const sanityHata = zamanSanityCheck(kayit.baslatilma_zamani, kayit.bitirme_zamani)
  if (sanityHata) {
    return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: sanityHata }
  }

  // Görevi çek
  const { data: gorev, error: gorevErr } = await admin
    .from(kayit.gorev_tipi)
    .select('id, firma_id, durum, atanan_kullanici_id, baslatilma_tarihi, lokasyon_id, proje_id')
    .eq('id', kayit.gorev_id)
    .maybeSingle()

  if (gorevErr || !gorev) {
    return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'Görev bulunamadı' }
  }
  if (gorev.firma_id !== firmaId) {
    return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'Yetki yok' }
  }

  // Çatışma: online tarafta kapanmışsa online kazanır
  const kapanmisDurumlar = ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'KAPATILDI']
  if (kapanmisDurumlar.includes(gorev.durum)) {
    return {
      _mobil_kayit_id: kayit._mobil_kayit_id,
      status: 'cakismali',
      mesaj: `Görev zaten ${gorev.durum} durumunda (online kazandı)`,
    }
  }

  const baslatilmaIso = gorev.baslatilma_tarihi ?? kayit.baslatilma_zamani
  const tamamlanmaIso = kayit.bitirme_zamani
  const sure = sureSaniye(baslatilmaIso, tamamlanmaIso)

  // Canlı görev için durum hesapla (ZAMANINDA_YAPILAMAYAN olabilir)
  const nextDurum = kayit.gorev_tipi === 'canli_gorevler'
    ? resolveLiveCompletionStatusByTask({ ...gorev, baslatilma_tarihi: baslatilmaIso } as any, tamamlanmaIso)
    : 'TAMAMLANDI'

  // Çeklist (varsa)
  if (Array.isArray(kayit.maddeler) && kayit.maddeler.length > 0) {
    const sablonId = await lokasyonCeklistSablon(admin, kayit.lokasyon_id)
    if (sablonId) {
      const { data: sablonMeta } = await admin
        .from('checklist_sablonlari').select('versiyon').eq('id', sablonId).maybeSingle()
      const templateVersion = (sablonMeta as any)?.versiyon ?? 1

      const baslikPayload: any = {
        lokasyon_id:      kayit.lokasyon_id,
        sablon_id:        sablonId,
        template_version: templateVersion,
        kanal:            'OFFLINE',
        kullanici_id:     userId,
      }
      baslikPayload[kayit.gorev_tipi === 'gorevler' ? 'gorev_id' : 'canli_gorev_id'] = kayit.gorev_id

      const { data: sonucRow, error: baslikErr } = await admin
        .from('checklist_sonuc_basliklari').insert(baslikPayload).select('id').single()

      if (baslikErr || !sonucRow) {
        return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'Çeklist kaydı oluşturulamadı: ' + (baslikErr?.message ?? '') }
      }

      const maddeRows = kayit.maddeler
        .filter(m => m.madde_id && m.secenek_degeri)
        .map(m => ({
          sonuc_id:       sonucRow.id,
          madde_id:       m.madde_id,
          secenek_degeri: m.secenek_degeri ?? null,
          aciklama:       typeof m.aciklama === 'string' ? m.aciklama.trim() || null : m.aciklama ?? null,
          gorsel_url:     m.gorsel_url ?? null,
        }))
      if (maddeRows.length > 0) {
        const { error: maddeErr } = await admin.from('checklist_sonuc_maddeleri').insert(maddeRows)
        if (maddeErr) {
          await admin.from('checklist_sonuc_basliklari').delete().eq('id', sonucRow.id)
          return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'Çeklist maddeleri kaydedilemedi: ' + maddeErr.message }
        }
      }
    }
  }

  // Görev güncelle
  const { error: updErr } = await admin
    .from(kayit.gorev_tipi)
    .update({
      durum: nextDurum,
      durum_degisim_tarihi: tamamlanmaIso,
      tamamlanma_tarihi: tamamlanmaIso,
      tamamlanma_suresi_saniye: sure,
      islemi_yapan_id: userId,
      ...(gorev.baslatilma_tarihi ? {} : { baslatilma_tarihi: baslatilmaIso, baslatan_kullanici_id: userId }),
      ...(kayit.gorev_tipi === 'canli_gorevler' ? { tamamlayan_kullanici_id: userId } : {}),
      son_tamamlama_kanali: 'OFFLINE',
      mobil_kayit_id: kayit._mobil_kayit_id,
    } as any)
    .eq('id', kayit.gorev_id)

  if (updErr) {
    return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: updErr.message }
  }

  return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'ok' }
}

/** Ekstra görev (lokasyonda bekleyen görev yokken yapılmış) */
async function ekstraGoreviOlustur(
  admin: any,
  userId: string,
  firmaId: string,
  personelProjeId: string | null,
  kayit: OfflineKayit,
): Promise<Sonuc> {
  // Idempotency — bu mobil_kayit_id daha önce ekstra olarak kaydedilmiş mi?
  const { data: mevcutSync } = await admin
    .from('canli_gorevler')
    .select('id')
    .eq('mobil_kayit_id', kayit._mobil_kayit_id)
    .maybeSingle()
  if (mevcutSync) {
    return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'ok', mesaj: 'Zaten senkron edilmiş (idempotent)' }
  }

  // Zaman damgası sanity check
  const sanityHata = zamanSanityCheck(kayit.baslatilma_zamani, kayit.bitirme_zamani)
  if (sanityHata) {
    return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: sanityHata }
  }

  const tanim = typeof kayit.tanim === 'string' ? kayit.tanim.trim() : ''
  if (!tanim) {
    return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'ekstra görev için tanim gerekli' }
  }

  // Lokasyon kontrol
  const { data: lok } = await admin
    .from('lokasyonlar')
    .select('id, firma_id, proje_id, aktif')
    .eq('id', kayit.lokasyon_id)
    .maybeSingle()

  if (!lok) return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'Lokasyon bulunamadı' }
  if (lok.firma_id !== firmaId) return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'Yetki yok' }
  if (lok.aktif === false) return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'Lokasyon pasif' }

  const nowIso = new Date().toISOString()
  const sure = sureSaniye(kayit.baslatilma_zamani, kayit.bitirme_zamani) ?? 0

  const { data: inserted, error: insertErr } = await admin
    .from('canli_gorevler')
    .insert({
      firma_id:                firmaId,
      proje_id:                lok.proje_id ?? personelProjeId ?? null,
      lokasyon_id:             kayit.lokasyon_id,
      tanim:                   tanim,
      durum:                   'TAMAMLANDI',
      kural_id:                null,
      gunluk_frekans_sayisi:   0,
      aktif_olma_tarihi:       kayit.baslatilma_zamani,
      olusturma_tarihi:        nowIso,
      durum_degisim_tarihi:    kayit.bitirme_zamani,
      tamamlanma_tarihi:       kayit.bitirme_zamani,
      baslatilma_tarihi:       kayit.baslatilma_zamani,
      olusturan_id:            userId,
      baslatan_kullanici_id:   userId,
      islemi_yapan_id:         userId,
      tamamlayan_kullanici_id: userId,
      tamamlanma_suresi_saniye: sure,
      son_tamamlama_kanali:    'OFFLINE',
      mobil_kayit_id:          kayit._mobil_kayit_id,
    } as any)
    .select('id')

  if (insertErr || !inserted || inserted.length === 0) {
    return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: insertErr?.message ?? 'Ekstra görev oluşturulamadı' }
  }

  const yeniGorevId = (inserted[0] as any).id as string

  // Çeklist (varsa)
  if (Array.isArray(kayit.maddeler) && kayit.maddeler.length > 0) {
    const sablonId = await lokasyonCeklistSablon(admin, kayit.lokasyon_id)
    if (sablonId) {
      const { data: sablonMeta } = await admin
        .from('checklist_sablonlari').select('versiyon').eq('id', sablonId).maybeSingle()
      const templateVersion = (sablonMeta as any)?.versiyon ?? 1
      const { data: sonucRow } = await admin
        .from('checklist_sonuc_basliklari').insert({
          lokasyon_id:      kayit.lokasyon_id,
          sablon_id:        sablonId,
          template_version: templateVersion,
          kanal:            'OFFLINE',
          kullanici_id:     userId,
          canli_gorev_id:   yeniGorevId,
        }).select('id').single()

      if (sonucRow) {
        const maddeRows = kayit.maddeler
          .filter(m => m.madde_id && m.secenek_degeri)
          .map(m => ({
            sonuc_id:       sonucRow.id,
            madde_id:       m.madde_id,
            secenek_degeri: m.secenek_degeri ?? null,
            aciklama:       typeof m.aciklama === 'string' ? m.aciklama.trim() || null : m.aciklama ?? null,
            gorsel_url:     m.gorsel_url ?? null,
          }))
        if (maddeRows.length > 0) {
          await admin.from('checklist_sonuc_maddeleri').insert(maddeRows)
        }
      }
    }
  }

  await auditLog({
    tip: 'ekstra_frekans',
    tablo: 'canli_gorevler',
    firma_id: firmaId,
    kullanici_id: userId,
    detay: {
      gorev_id: yeniGorevId,
      lokasyon_id: kayit.lokasyon_id,
      tanim,
      kanal: 'OFFLINE',
    },
  })

  return { _mobil_kayit_id: kayit._mobil_kayit_id, status: 'ok' }
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
      .select('user_id, firma_id, proje_id')
      .eq('device_token', deviceToken)
      .single()

    if (!tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
    }

    const { user_id: userId, firma_id: firmaId, proje_id: personelProjeId } = tokenData

    // User aktif kontrol
    const { data: userData } = await admin.from('users').select('aktif').eq('id', userId).single()
    if (!userData || userData.aktif === false) {
      return NextResponse.json(
        { ok: false, error: 'Pasif durumdasınız!', code: 'USER_PASIF' },
        { status: 403, headers: CORS }
      )
    }

    let body: any
    try { body = await req.json() } catch {
      return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400, headers: CORS })
    }

    const kayitlar = (body?.kayitlar ?? []) as OfflineKayit[]
    if (!Array.isArray(kayitlar)) {
      return NextResponse.json({ ok: false, error: 'kayitlar array olmalı' }, { status: 400, headers: CORS })
    }

    const sonuclar: Sonuc[] = []

    // Her kayıt bağımsız işlenir — biri hata verse diğerleri etkilenmez
    for (const kayit of kayitlar) {
      try {
        if (!kayit?._mobil_kayit_id) {
          sonuclar.push({ _mobil_kayit_id: kayit?._mobil_kayit_id ?? 'bilinmiyor', status: 'hata', error: '_mobil_kayit_id gerekli' })
          continue
        }
        if (!['gorevler', 'canli_gorevler'].includes(kayit.gorev_tipi)) {
          sonuclar.push({ _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'Geçersiz gorev_tipi' })
          continue
        }
        if (!kayit.baslatilma_zamani || !kayit.bitirme_zamani) {
          sonuclar.push({ _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'baslatilma_zamani/bitirme_zamani gerekli' })
          continue
        }
        if (!kayit.lokasyon_id) {
          sonuclar.push({ _mobil_kayit_id: kayit._mobil_kayit_id, status: 'hata', error: 'lokasyon_id gerekli' })
          continue
        }

        let res: Sonuc
        if (kayit.ekstra_mi === true) {
          res = await ekstraGoreviOlustur(admin, userId, firmaId, personelProjeId, kayit)
        } else {
          res = await normalGoreviTamamla(admin, userId, firmaId, kayit)
        }
        sonuclar.push(res)
      } catch (e: any) {
        sonuclar.push({
          _mobil_kayit_id: kayit?._mobil_kayit_id ?? 'bilinmiyor',
          status: 'hata',
          error: e?.message ?? 'Bilinmeyen hata',
        })
      }
    }

    // Cihaz son kullanım
    await admin.from('device_tokens')
      .update({ son_kullanim: new Date().toISOString() })
      .eq('device_token', deviceToken)

    return NextResponse.json({ ok: true, sonuclar }, { headers: CORS })

  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? 'Sunucu hatası' },
      { status: 500, headers: CORS }
    )
  }
}
