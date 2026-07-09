/**
 * PATCH  /api/oto-yikama/gorev-kayitlari/[id]
 *   Body: { hedef_tarih?, lokasyon_id?, durum?, iptal_sebep?, km?, notlar?,
 *           personel_id? (durum değişiminde ZORUNLU — yıkama saha personeli) }
 *   Görev kaydını günceller. Sadece SA/TA — TA kendi firmasındaki kayıtlarla sınırlı.
 *
 *   Durum geçiş etkileri (otomatik alanlar) — yeni davranış:
 *     - ACIK (geri al) →
 *         baslatilma_tarihi=null, tamamlanma_tarihi=null, sure=null,
 *         baslatan_kullanici_id=null, islemi_yapan_id=null, iptal_sebep=null
 *     - ISLEMDE (ACIK'tan) →
 *         baslatilma_tarihi=NOW (eski yoksa), tamamlanma_tarihi=null,
 *         baslatan_kullanici_id=personel, islemi_yapan_id=null
 *     - TAMAMLANDI →
 *         Önceki ISLEMDE: tamamlanma=NOW, islemi_yapan=personel
 *                         (baslatma korunur, sure hesaplanır)
 *         Önceki ACIK (direkt): baslatma=NOW, tamamlanma=NOW, sure=0,
 *                         baslatan=islemi_yapan=personel
 *     - IPTAL →
 *         baslatilma_tarihi=null, tamamlanma_tarihi=null, sure=null,
 *         baslatan_kullanici_id=null, islemi_yapan_id=personel,
 *         iptal_sebep=zorunlu (min 5 karakter)
 *
 *   Hedef tarih / lokasyon değişimi sadece düzenlenebilir durumlarda
 *   (HAZIR/ACIK/ISLEMDE) izinlidir.
 *
 * DELETE /api/oto-yikama/gorev-kayitlari/[id]
 *   Görevi (+ metadata cascade) siler. Geri alınamaz.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'
import { getYikamaSahaPersoneliUserIds } from '@/lib/oto-yikama/yetkililer'
import { getPersonelIstasyonId } from '@/lib/oto-yikama/getPersonelIstasyonId'

export const dynamic = 'force-dynamic'

async function authorize() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Yetkisiz', status: 401 as const }
  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return { error: 'Kullanıcı bulunamadı', status: 401 as const }
  return { user, me }
}

async function loadGorev(id: string) {
  const admin = createAdminClient()
  const { data: gorev } = await admin
    .from('gorevler')
    .select('id, durum, firma_id, lokasyon_id, tanim, baslatilma_tarihi, tamamlanma_tarihi, iptal_sebep')
    .eq('id', id)
    .single()
  if (!gorev) return null
  const { data: meta } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, plaka_snapshot, hedef_tarih')
    .eq('gorev_id', id)
    .maybeSingle()
  if (!meta) return null // Oto Yıkama görevi değil
  return { gorev, meta }
}

const ALLOWED_DURUM = new Set(['ACIK', 'ISLEMDE', 'TAMAMLANDI', 'IPTAL'])
const DUZENLENEBILIR = new Set(['HAZIR', 'ACIK', 'ISLEMDE'])

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize()
  if ('error' in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const rec = await loadGorev(params.id)
  if (!rec) return NextResponse.json({ ok: false, error: 'Oto Yıkama görevi bulunamadı' }, { status: 404 })
  if (auth.me.rol === 'tenant_admin' && rec.gorev.firma_id !== auth.me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu görev sizin firmanıza ait değil' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({} as any))
  const yeniHedef = typeof body.hedef_tarih === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.hedef_tarih)
    ? body.hedef_tarih : null
  const yeniLok   = typeof body.lokasyon_id === 'string' && body.lokasyon_id.length > 0
    ? body.lokasyon_id : null
  const yeniDurum = typeof body.durum === 'string' && ALLOWED_DURUM.has(body.durum)
    ? (body.durum as 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL') : null
  const iptalSebep = typeof body.iptal_sebep === 'string' ? body.iptal_sebep.trim() : ''
  const personelId = typeof body.personel_id === 'string' && body.personel_id.length > 0
    ? body.personel_id : null
  // KM ve açıklama (notlar) — TAMAMLANDI'ya geçişte KM zorunlu, notlar opsiyonel
  const kmNum = body.km != null && body.km !== '' ? Number(body.km) : null
  const km = Number.isFinite(kmNum) && (kmNum as number) > 0 ? Math.floor(kmNum as number) : null
  const notlar = typeof body.notlar === 'string' ? body.notlar.trim() : null

  if (!yeniHedef && !yeniLok && !yeniDurum && km == null && notlar == null) {
    return NextResponse.json({ ok: false, error: 'Güncellenecek alan yok' }, { status: 400 })
  }

  // Durum değişimi varsa personel zorunlu (ACIK'a geri alma hariç — sıfırlama
  // işlemi olduğu için personel atama anlamsız)
  const durumDegisiyor = !!yeniDurum && yeniDurum !== rec.gorev.durum
  if (durumDegisiyor && yeniDurum !== 'ACIK' && !personelId) {
    return NextResponse.json({
      ok: false,
      error: 'Durum değişimi için işlemi yapan personel seçilmelidir.',
      code: 'PERSONEL_GEREKLI',
    }, { status: 400 })
  }

  // Personel doğrulama (firma + yıkama saha personeli)
  if (personelId) {
    const sahaIds = await getYikamaSahaPersoneliUserIds(createAdminClient() as any, rec.gorev.firma_id)
    if (!sahaIds.includes(personelId)) {
      return NextResponse.json({
        ok: false,
        error: 'Seçilen kullanıcı bu firmanın yıkama saha personeli değil.',
        code: 'PERSONEL_GECERSIZ',
      }, { status: 400 })
    }
  }

  // İPTAL için sebep zorunlu (5 karakter min)
  if (yeniDurum === 'IPTAL' && iptalSebep.length < 5) {
    return NextResponse.json({
      ok: false,
      error: 'İptal sebebi zorunlu (en az 5 karakter)',
      code: 'IPTAL_SEBEP_GEREKLI',
    }, { status: 400 })
  }

  // TAMAMLANDI için KM zorunlu (sadece bu duruma yeni geçişte)
  if (yeniDurum === 'TAMAMLANDI' && rec.gorev.durum !== 'TAMAMLANDI' && km == null) {
    return NextResponse.json({
      ok: false,
      error: 'Yıkamayı tamamlamak için aracın güncel KM değeri zorunludur.',
      code: 'KM_GEREKLI',
    }, { status: 400 })
  }

  // Hedef/lokasyon değişimi sadece düzenlenebilir durumlarda
  if ((yeniHedef || yeniLok) && !DUZENLENEBILIR.has(rec.gorev.durum)) {
    return NextResponse.json({
      ok: false,
      error: `'${rec.gorev.durum}' durumundaki görevde tarih/lokasyon değiştirilemez. Önce durumu açıp güncelleyin.`,
    }, { status: 409 })
  }

  const admin = createAdminClient()

  // Lokasyon değişimi varsa Oto Yıkama lokasyonu olduğunu doğrula
  if (yeniLok) {
    const { data: lok } = await admin
      .from('lokasyonlar')
      .select('id, firma_id, aktif, parent_id, parent:lokasyonlar!parent_id(oto_yikama_lokasyon)')
      .eq('id', yeniLok)
      .single()
    if (!lok || lok.firma_id !== rec.gorev.firma_id) {
      return NextResponse.json({ ok: false, error: 'Lokasyon firmaya ait değil' }, { status: 400 })
    }
    if (!lok.aktif) return NextResponse.json({ ok: false, error: 'Lokasyon pasif' }, { status: 400 })
    const parentOto = (lok.parent as any)?.oto_yikama_lokasyon === true
    if (!parentOto) {
      return NextResponse.json({ ok: false, error: 'Seçilen lokasyon bir Oto Yıkama istasyonu değil' }, { status: 400 })
    }
  }

  const gorevUpdate: Record<string, any> = {}
  const metaUpdate: Record<string, any> = {}
  if (yeniLok)   gorevUpdate.lokasyon_id = yeniLok
  if (yeniHedef) metaUpdate.hedef_tarih  = yeniHedef
  if (km != null) metaUpdate.km = km
  if (notlar != null) metaUpdate.notlar = notlar || null

  // Durum geçişi — yeni davranış (kullanıcının tanımladığı kurallar)
  if (yeniDurum) {
    const nowIso = new Date().toISOString()
    gorevUpdate.durum = yeniDurum
    gorevUpdate.durum_degisim_tarihi = nowIso
    if (yeniDurum === 'ACIK') {
      // Geri al — tüm zaman/personel/sebep alanları sıfırlanır, görev yeniden çalışmaya hazır
      gorevUpdate.baslatilma_tarihi = null
      gorevUpdate.tamamlanma_tarihi = null
      gorevUpdate.tamamlanma_suresi_saniye = null
      gorevUpdate.baslatan_kullanici_id = null
      gorevUpdate.islemi_yapan_id = null
      gorevUpdate.iptal_sebep = null
    } else if (yeniDurum === 'ISLEMDE') {
      // ACIK → ISLEMDE: başlatma şimdi, başlatan = seçilen personel
      // (ISLEMDE'den ISLEMDE'ye olmaz; başka durumdan geçişte eski baslatma temizlenir)
      gorevUpdate.baslatilma_tarihi = nowIso
      gorevUpdate.baslatan_kullanici_id = personelId
      gorevUpdate.tamamlanma_tarihi = null
      gorevUpdate.tamamlanma_suresi_saniye = null
      gorevUpdate.islemi_yapan_id = null
      gorevUpdate.iptal_sebep = null
    } else if (yeniDurum === 'TAMAMLANDI') {
      // Tamamlanma şimdi, işlemi_yapan = seçilen personel
      gorevUpdate.tamamlanma_tarihi = nowIso
      gorevUpdate.islemi_yapan_id = personelId
      gorevUpdate.iptal_sebep = null
      if (rec.gorev.durum === 'ISLEMDE' && rec.gorev.baslatilma_tarihi) {
        // ISLEMDE'den geçiş: baslatma korunur, süre hesaplanır
        const baslMs = new Date(rec.gorev.baslatilma_tarihi).getTime()
        const bitMs  = new Date(nowIso).getTime()
        gorevUpdate.tamamlanma_suresi_saniye = Math.max(0, Math.floor((bitMs - baslMs) / 1000))
      } else {
        // ACIK → TAMAMLANDI direkt: baslatma = bitiş, süre = 0
        gorevUpdate.baslatilma_tarihi = nowIso
        gorevUpdate.baslatan_kullanici_id = personelId
        gorevUpdate.tamamlanma_suresi_saniye = 0
      }
    } else if (yeniDurum === 'IPTAL') {
      // İptal: zaman alanları boş, baslatan boş, işlemi_yapan = seçilen personel, sebep zorunlu
      gorevUpdate.baslatilma_tarihi = null
      gorevUpdate.tamamlanma_tarihi = null
      gorevUpdate.tamamlanma_suresi_saniye = null
      gorevUpdate.baslatan_kullanici_id = null
      gorevUpdate.islemi_yapan_id = personelId
      gorevUpdate.iptal_sebep = iptalSebep
    }

    // Istasyon revizyonu (2026-07-09): "yikanan aracin istasyonu = islemi yapan
    // personelin kayitli istasyonu; aracin varsayilan istasyonu sadece kayit".
    // ISLEMDE ve TAMAMLANDI'da personelin birincil istasyonuna tasi.
    // Amir manuel lokasyon secmisse (yeniLok) onu koru — amir override.
    // IPTAL'de lokasyon degistirmeye gerek yok (islem gerceklesmedi).
    if (!yeniLok && personelId && (yeniDurum === 'ISLEMDE' || yeniDurum === 'TAMAMLANDI')) {
      const personelIstasyon = await getPersonelIstasyonId(admin, personelId, rec.gorev.firma_id)
      if (personelIstasyon && personelIstasyon !== rec.gorev.lokasyon_id) {
        gorevUpdate.lokasyon_id = personelIstasyon
      }
    }
  }

  if (Object.keys(gorevUpdate).length > 0) {
    const { error } = await admin.from('gorevler').update(gorevUpdate).eq('id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (Object.keys(metaUpdate).length > 0) {
    const { error } = await admin.from('oto_yikama_gorev_metadata').update(metaUpdate).eq('gorev_id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  void auditLog({
    tip: 'oto_yikama_kayit_guncelle',
    tablo: 'gorevler',
    firma_id: rec.gorev.firma_id,
    kullanici_id: auth.user.id,
    detay: {
      gorev_id: params.id,
      plaka: rec.meta.plaka_snapshot,
      eski_durum: rec.gorev.durum,
      yeni_durum: yeniDurum,
      eski_hedef: rec.meta.hedef_tarih,
      eski_lokasyon: rec.gorev.lokasyon_id,
      yeni_hedef: yeniHedef,
      yeni_lokasyon: yeniLok,
      iptal_sebep: yeniDurum === 'IPTAL' ? iptalSebep : null,
      personel_id: personelId,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize()
  if ('error' in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const rec = await loadGorev(params.id)
  if (!rec) return NextResponse.json({ ok: false, error: 'Oto Yıkama görevi bulunamadı' }, { status: 404 })
  if (auth.me.rol === 'tenant_admin' && rec.gorev.firma_id !== auth.me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu görev sizin firmanıza ait değil' }, { status: 403 })
  }

  const admin = createAdminClient()
  // metadata ON DELETE CASCADE ile gorevler'e bağlı → otomatik silinir
  const { error } = await admin.from('gorevler').delete().eq('id', params.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  void auditLog({
    tip: 'oto_yikama_kayit_sil',
    tablo: 'gorevler',
    firma_id: rec.gorev.firma_id,
    kullanici_id: auth.user.id,
    detay: { gorev_id: params.id, plaka: rec.meta.plaka_snapshot, tanim: rec.gorev.tanim },
  })

  return NextResponse.json({ ok: true })
}
