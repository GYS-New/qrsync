/**
 * POST /api/oto-yikama/gorevler/ekstra-olustur
 *
 * Yönetici tarafından tetiklenen "Ekstra Yıkama Görevi" oluşturma.
 * Tek plaka, sadece BUGÜN için, direkt AÇIK durumda doğar.
 *
 * Davranış:
 *   - Sadece tek bir araç (veya manuel plaka), tek bir istasyon.
 *   - hedef_tarih = bugün (TR)
 *   - durum = 'ACIK' (HAZIR'a uğramaz — bugün için zaten "açık" anlamı)
 *   - tanim = 'Oto Yıkama - PLAKA (Ekstra)'
 *   - metadata.ekstra = true
 *   - arac_id varsa: aynı plaka için bugün zaten aktif görev varsa engellenir.
 *   - manuel_plaka durumunda: metadata.arac_id=null, plaka_snapshot=manuel_plaka.
 *
 * Body:
 *   { firma_id, lokasyon_id, arac_id?, manuel_plaka? }
 *   arac_id veya manuel_plaka'dan biri zorunlu (XOR).
 *
 * SA-only + oto_yikama_aktif=true firma zorunlu.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'

function bugunTRDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const firmaId = String(body.firma_id ?? '')
  const aracIdRaw = body.arac_id ? String(body.arac_id) : ''
  const lokasyonId = String(body.lokasyon_id ?? '')
  // Manuel plaka: ya elle yazılmış plaka ya da 'PLAKASIZ' string'i
  const manuelPlakaRaw = body.manuel_plaka ? String(body.manuel_plaka).trim() : ''

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!lokasyonId) return NextResponse.json({ ok: false, error: 'lokasyon_id gerekli' }, { status: 400 })
  if (!aracIdRaw && !manuelPlakaRaw) {
    return NextResponse.json({ ok: false, error: 'arac_id veya manuel_plaka gerekli' }, { status: 400 })
  }
  if (aracIdRaw && manuelPlakaRaw) {
    return NextResponse.json({ ok: false, error: 'Aynı anda hem arac_id hem manuel_plaka gönderilemez' }, { status: 400 })
  }

  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  if (!isSA && firmaId !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }

  const modulAktif = await getFirmaModulDurumu(createAdminClient() as any, firmaId, 'oto_yikama_aktif')
  if (!modulAktif) {
    return NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Mod 1: Tanımlı araç (arac_id)
  // Mod 2: Manuel plaka (arac_id=null, plaka_snapshot=manuel_plaka)
  let aracIdFinal: string | null = null
  let plakaFinal: string

  if (aracIdRaw) {
    const { data: arac } = await admin
      .from('araclar')
      .select('id, plaka, firma_id, aktif')
      .eq('id', aracIdRaw).maybeSingle()
    if (!arac || arac.firma_id !== firmaId || arac.aktif === false) {
      return NextResponse.json({ ok: false, error: 'Araç bulunamadı veya pasif' }, { status: 400 })
    }
    aracIdFinal = arac.id
    plakaFinal = arac.plaka
  } else {
    // Manuel plaka — normalize: boşlukları sil, büyük harf. 'PLAKASIZ' özel.
    const normalize = manuelPlakaRaw.replace(/\s+/g, '').toLocaleUpperCase('tr')
    if (normalize.length === 0 || normalize.length > 20) {
      return NextResponse.json({ ok: false, error: 'Geçersiz plaka' }, { status: 400 })
    }
    plakaFinal = normalize
  }

  const { data: lok } = await admin
    .from('lokasyonlar')
    .select('id, firma_id, parent_id, aktif, parent:lokasyonlar!parent_id(oto_yikama_lokasyon)')
    .eq('id', lokasyonId).maybeSingle()
  if (!lok || (lok as any).firma_id !== firmaId || (lok as any).aktif === false) {
    return NextResponse.json({ ok: false, error: 'Lokasyon bulunamadı veya pasif' }, { status: 400 })
  }
  if (!(lok as any).parent_id || !(((lok as any).parent as any)?.oto_yikama_lokasyon)) {
    return NextResponse.json({ ok: false, error: 'Seçilen lokasyon bir Oto Yıkama istasyonu değil' }, { status: 400 })
  }

  const bugun = bugunTRDate()

  // Çakışma kontrolü
  //  - Tanımlı araç: aynı arac_id + bugün için aktif görev varsa engellenir.
  //  - Manuel plaka: plaka_snapshot bazlı kontrol — 'PLAKASIZ' her seferinde
  //    yeni kayıt olduğu için çakışma kontrolünden muaftır.
  if (aracIdFinal) {
    const { data: mevcutMeta } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('gorev_id')
      .eq('arac_id', aracIdFinal)
      .eq('hedef_tarih', bugun)
    if (mevcutMeta && mevcutMeta.length > 0) {
      const gorevIds = mevcutMeta.map((m: any) => m.gorev_id)
      const { data: gorevler } = await admin
        .from('gorevler')
        .select('id, durum')
        .in('id', gorevIds)
        .eq('firma_id', firmaId)
      const acikVar = (gorevler ?? []).some((g: any) =>
        ['HAZIR', 'ACIK', 'ISLEMDE'].includes(g.durum),
      )
      if (acikVar) {
        return NextResponse.json({
          ok: false,
          error: `${plakaFinal} plakalı araç için bugün planlı/aktif yıkama mevcut. Ekstra görev oluşturulamaz.`,
          code: 'PLANLI_AKTIF_VAR',
        }, { status: 409 })
      }
    }
  } else if (plakaFinal !== 'PLAKASIZ') {
    // Manuel plaka için aynı plaka_snapshot + bugün aktif var mı?
    const { data: mevcutMeta } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('gorev_id, gorev:gorevler!inner(durum, firma_id)')
      .eq('plaka_snapshot', plakaFinal)
      .eq('hedef_tarih', bugun)
      .eq('gorev.firma_id', firmaId)
    const acikVar = (mevcutMeta ?? []).some((m: any) =>
      ['HAZIR', 'ACIK', 'ISLEMDE'].includes(m.gorev?.durum),
    )
    if (acikVar) {
      return NextResponse.json({
        ok: false,
        error: `${plakaFinal} plakası için bugün zaten aktif bir yıkama görevi var.`,
        code: 'PLANLI_AKTIF_VAR',
      }, { status: 409 })
    }
  }

  // INSERT — gorev + metadata
  const { data: insertedGorev, error: gorevErr } = await admin
    .from('gorevler')
    .insert({
      firma_id: firmaId,
      tanim: `Oto Yıkama - ${plakaFinal} (Ekstra)`,
      lokasyon_id: lokasyonId,
      atanan_kullanici_id: null,
      durum: 'ACIK',
      olusturan_id: me.id,
    })
    .select('id')
    .single()
  if (gorevErr || !insertedGorev) {
    return NextResponse.json({ ok: false, error: gorevErr?.message ?? 'Görev oluşturulamadı' }, { status: 500 })
  }

  const { error: metaErr } = await admin
    .from('oto_yikama_gorev_metadata')
    .insert({
      gorev_id: insertedGorev.id,
      arac_id: aracIdFinal,
      plaka_snapshot: plakaFinal,
      hedef_tarih: bugun,
      ekstra: true,
    })
  if (metaErr) {
    await admin.from('gorevler').delete().eq('id', insertedGorev.id)
    return NextResponse.json({ ok: false, error: `metadata: ${metaErr.message}` }, { status: 500 })
  }

  void admin.from('audit_log').insert({
    tip: 'oto_yikama_ekstra_olustur',
    tablo: 'gorevler',
    firma_id: firmaId,
    kullanici_id: me.id,
    detay: {
      gorev_id: insertedGorev.id,
      plaka: plakaFinal,
      lokasyon_id: lokasyonId,
      kanal: 'WEB',
      kaynak: aracIdFinal ? 'tanimli_arac' : (plakaFinal === 'PLAKASIZ' ? 'plakasiz' : 'manuel_plaka'),
    },
  })

  return NextResponse.json({ ok: true, gorev_id: insertedGorev.id, plaka: plakaFinal })
}
