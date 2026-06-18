/**
 * POST /api/oto-yikama/gorevler/ekstra-olustur
 *
 * Yönetici tarafından tetiklenen "Ekstra Yıkama Görevi" oluşturma.
 * Tek plaka, sadece BUGÜN için, direkt AÇIK durumda doğar.
 *
 * Davranış:
 *   - Sadece tek bir araç, tek bir istasyon.
 *   - hedef_tarih = bugün (TR)
 *   - durum = 'ACIK' (HAZIR'a uğramaz — bugün için zaten "açık" anlamı)
 *   - tanim = 'Oto Yıkama - PLAKA (Ekstra)'
 *   - metadata.ekstra = true
 *   - Aynı plaka için bugün zaten görev (planlı veya ekstra, tamamlanmamış)
 *     varsa engellenir.
 *
 * Body:
 *   { firma_id, arac_id, lokasyon_id }
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

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const firmaId = String(body.firma_id ?? '')
  const aracId = String(body.arac_id ?? '')
  const lokasyonId = String(body.lokasyon_id ?? '')

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!aracId) return NextResponse.json({ ok: false, error: 'arac_id gerekli' }, { status: 400 })
  if (!lokasyonId) return NextResponse.json({ ok: false, error: 'lokasyon_id gerekli' }, { status: 400 })

  const modulAktif = await getFirmaModulDurumu(createAdminClient() as any, firmaId, 'oto_yikama_aktif')
  if (!modulAktif) {
    return NextResponse.json({ ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil.' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Araç + lokasyon doğrulama
  const { data: arac } = await admin
    .from('araclar')
    .select('id, plaka, firma_id, aktif')
    .eq('id', aracId).maybeSingle()
  if (!arac || arac.firma_id !== firmaId || arac.aktif === false) {
    return NextResponse.json({ ok: false, error: 'Araç bulunamadı veya pasif' }, { status: 400 })
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

  // Çakışma: aynı arac_id + bugün için zaten görev var mı? (tamamlanmamış)
  const { data: mevcutMeta } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, ekstra')
    .eq('arac_id', aracId)
    .eq('hedef_tarih', bugun)
  if (mevcutMeta && mevcutMeta.length > 0) {
    // Görev durumlarını kontrol et — yalnız TAMAMLANDI/IPTAL/YAPILAMADI olanlar ekstraya engel değil
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
        error: `${arac.plaka} plakalı araç için bugün planlı/aktif yıkama mevcut. Ekstra görev oluşturulamaz.`,
        code: 'PLANLI_AKTIF_VAR',
      }, { status: 409 })
    }
  }

  // INSERT — gorev + metadata
  const { data: insertedGorev, error: gorevErr } = await admin
    .from('gorevler')
    .insert({
      firma_id: firmaId,
      tanim: `Oto Yıkama - ${arac.plaka} (Ekstra)`,
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
      arac_id: arac.id,
      plaka_snapshot: arac.plaka,
      hedef_tarih: bugun,
      ekstra: true,
    })
  if (metaErr) {
    // Rollback
    await admin.from('gorevler').delete().eq('id', insertedGorev.id)
    return NextResponse.json({ ok: false, error: `metadata: ${metaErr.message}` }, { status: 500 })
  }

  void admin.from('audit_log').insert({
    tip: 'oto_yikama_ekstra_olustur',
    tablo: 'gorevler',
    firma_id: firmaId,
    kullanici_id: me.id,
    detay: { gorev_id: insertedGorev.id, plaka: arac.plaka, lokasyon_id: lokasyonId, kanal: 'WEB' },
  })

  return NextResponse.json({ ok: true, gorev_id: insertedGorev.id, plaka: arac.plaka })
}
