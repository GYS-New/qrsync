/**
 * /api/gorev-kurallari/duraklat-toplu
 *
 * Bir üst lokasyondaki TÜM aktif kuralları tek seferde duraklatır / başlatır.
 *
 * POST: bulk insert
 *   { firmaId, projeId?, ustLokasyonId, tarihler: string[], vardiyalar?: number[] }
 *   - vardiyalar verilmezse: kuralın saatinden derive edilen vardiya kullanılır
 *   - vardiyalar verilirse: sadece o vardiyalardaki kurallar duraklatılır
 *   - aktif_gunler kontrolü yapılır (gün uygunsa atlanır)
 *
 * DELETE: bulk delete
 *   { firmaId, projeId?, ustLokasyonId, tarih?: string }
 *   - tarih verilmezse: bugün ve sonrası tüm duraklatmalar silinir
 *   - tarih verilirse: sadece o tarihin duraklatmaları silinir
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const body = await req.json()
  const { tarihler, vardiyalar, ustLokasyonId } = body
  const firmaId = body.firmaId ?? me.firma_id
  const projeId = body.projeId ?? null

  if (!ustLokasyonId || !tarihler?.length) {
    return NextResponse.json({ error: 'ustLokasyonId ve tarihler zorunlu' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Üst lokasyondaki TÜM aktif kuralların (tanım, vardiya_no) çiftlerini bul
  // get_ust_lokasyon_id helper fn ile aynı üst lokasyon ağacındaki kuralları yakala
  // Vardiya, kuralın aktif_olma_saati ve firmanın vardiya ayarlarından derive edilir
  // SQL doğrudan çalıştırılır (kompleks join + jsonb iteration)

  // Önce firma vardiya ayarını çek
  const { data: firma } = await admin.from('firmalar')
    .select('vardiya_sayisi, tum_vardiya_ayarlari')
    .eq('id', firmaId).single()
  if (!firma) return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 404 })

  const sayisi = (firma as any).vardiya_sayisi ?? 3
  const aktifSet: { no: number; baslangic: string; bitis: string }[] =
    ((firma as any).tum_vardiya_ayarlari?.[String(sayisi)] ?? []) as any
  if (!aktifSet.length) return NextResponse.json({ error: 'Vardiya ayarı yok' }, { status: 400 })

  // Üst lokasyondaki tüm aktif kuralları çek
  let kuralQ = admin.from('gorev_kurallari')
    .select('id, tanim, aktif_olma_saati, aktif_gunler, lokasyon_id, firma_id, proje_id')
    .eq('aktif', true)
    .eq('firma_id', firmaId)
  if (projeId) kuralQ = (kuralQ as any).eq('proje_id', projeId)
  const { data: tumKurallar } = await kuralQ
  if (!tumKurallar?.length) return NextResponse.json({ ok: true, eklenen: 0, sebep: 'kural_yok' })

  // get_ust_lokasyon_id RPC'si ile her kuralın üst lokasyonunu bul (toplu)
  const lokIds = Array.from(new Set(tumKurallar.map((k: any) => k.lokasyon_id)))
  // Lokasyon hiyerarşisini çek
  const { data: tumLoklar } = await admin.from('lokasyonlar')
    .select('id, parent_id').eq('firma_id', firmaId)
  const lokParentMap = new Map((tumLoklar ?? []).map((l: any) => [l.id, l.parent_id]))

  function ustBul(lokId: string): string | null {
    let cur: string | null | undefined = lokId
    while (cur && lokParentMap.get(cur)) cur = lokParentMap.get(cur)
    return cur ?? null
  }

  // Bu üst lokasyondaki kuralları filtrele
  const ustlokKurallari = tumKurallar.filter((k: any) => ustBul(k.lokasyon_id) === ustLokasyonId)
  if (!ustlokKurallari.length) return NextResponse.json({ ok: true, eklenen: 0, sebep: 'ustlok_kural_yok' })

  // Saat → vardiya_no çözümleyici
  function vardiyaBul(saatStr: string): number | null {
    for (const v of aktifSet) {
      const gece = v.bitis <= v.baslangic
      const eslesme = gece
        ? (saatStr >= v.baslangic || saatStr < v.bitis)
        : (saatStr >= v.baslangic && saatStr < v.bitis)
      if (eslesme) return v.no
    }
    return null
  }

  // (tanım, vardiya_no) eşsiz çiftleri çıkar
  const cifSet = new Set<string>()
  for (const k of ustlokKurallari as any[]) {
    const saat = String(k.aktif_olma_saati ?? '').slice(0, 5)
    const vNo = vardiyaBul(saat)
    if (vNo === null) continue
    if (vardiyalar?.length && !vardiyalar.includes(vNo)) continue
    cifSet.add(`${k.tanim}::${vNo}`)
  }

  if (!cifSet.size) return NextResponse.json({ ok: true, eklenen: 0, sebep: 'eslesme_yok' })

  // Her tarih × her (tanım, vardiya) çifti için satır oluştur
  // (Aktif gün kontrolü: kural'ın aktif_gunler array'inde tarih'in DOW'u olmalı)
  const rows: any[] = []
  for (const tarih of tarihler) {
    const dow = new Date(tarih + 'T00:00:00').getDay()
    // Bu gün için bu kurallar aktif mi? — tanım bazında kontrol
    const aktifTanimVardiya = new Set<string>()
    for (const k of ustlokKurallari as any[]) {
      if (!k.aktif_gunler?.includes(dow)) continue
      const saat = String(k.aktif_olma_saati ?? '').slice(0, 5)
      const vNo = vardiyaBul(saat)
      if (vNo === null) continue
      if (vardiyalar?.length && !vardiyalar.includes(vNo)) continue
      aktifTanimVardiya.add(`${k.tanim}::${vNo}`)
    }
    for (const cift of aktifTanimVardiya) {
      const [tanim, vNoStr] = cift.split('::')
      rows.push({
        firma_id: firmaId,
        proje_id: projeId,
        ust_lokasyon_id: ustLokasyonId,
        tanim,
        tarih,
        vardiya_no: parseInt(vNoStr, 10),
        olusturan_id: me.id,
      })
    }
  }

  if (!rows.length) return NextResponse.json({ ok: true, eklenen: 0, sebep: 'gunler_uymadi' })

  const { error } = await admin.from('kural_duraklatmalari').upsert(rows, {
    onConflict: 'firma_id,proje_id,ust_lokasyon_id,tanim,tarih,vardiya_no',
    ignoreDuplicates: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Üst lokasyon adını çek (audit detayı için)
  const { data: ustLok } = await admin.from('lokasyonlar').select('tanim').eq('id', ustLokasyonId).maybeSingle()
  await auditLog({
    tip: 'kural_toplu_duraklatma',
    tablo: 'kural_duraklatmalari',
    kullanici_id: me.id,
    firma_id: firmaId,
    proje_id: projeId,
    satir_sayisi: rows.length,
    detay: {
      ust_lokasyon_id: ustLokasyonId,
      ust_lokasyon_tanim: (ustLok as any)?.tanim ?? null,
      tarihler,
      vardiyalar: vardiyalar ?? null,
    },
  })

  return NextResponse.json({ ok: true, eklenen: rows.length })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const body = await req.json()
  const { ustLokasyonId, tarih } = body
  const firmaId = body.firmaId ?? me.firma_id
  const projeId = body.projeId ?? null

  if (!ustLokasyonId) {
    return NextResponse.json({ error: 'ustLokasyonId zorunlu' }, { status: 400 })
  }

  const admin = createAdminClient()
  let q = admin.from('kural_duraklatmalari').delete().select('id')
    .eq('firma_id', firmaId)
    .eq('ust_lokasyon_id', ustLokasyonId)
  if (projeId) q = q.eq('proje_id', projeId)
  else q = q.is('proje_id', null)

  if (tarih) {
    q = q.eq('tarih', tarih)
  } else {
    // Bugün ve sonrası
    q = q.gte('tarih', new Date().toISOString().slice(0, 10))
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const silinen = data?.length ?? 0
  if (silinen > 0) {
    const { data: ustLok } = await admin.from('lokasyonlar').select('tanim').eq('id', ustLokasyonId).maybeSingle()
    await auditLog({
      tip: 'kural_toplu_baslatma',
      tablo: 'kural_duraklatmalari',
      kullanici_id: me.id,
      firma_id: firmaId,
      proje_id: projeId,
      satir_sayisi: silinen,
      detay: {
        ust_lokasyon_id: ustLokasyonId,
        ust_lokasyon_tanim: (ustLok as any)?.tanim ?? null,
        tarih: tarih ?? null,
        kapsam: tarih ? 'tek_tarih' : 'bugun_ve_sonrasi',
      },
    })
  }

  return NextResponse.json({ ok: true, silinen })
}
