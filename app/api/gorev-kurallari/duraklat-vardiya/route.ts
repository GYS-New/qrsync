import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

/**
 * POST /api/gorev-kurallari/duraklat-vardiya
 * Üst lokasyon + tanım grubu bazlı vardiya duraklatma
 * Body: { firmaId, projeId?, ustLokasyonId, tanim, tarihler: string[], vardiyalar: number[] }
 *
 * NOT: ustLokasyonId zorunlu — duraklatma sadece o üst lokasyon ağacındaki
 * aynı tanımlı kurallara uygulanır. Diğer üst lokasyonlardaki aynı tanımlı
 * kurallar etkilenmez.
 *
 * DELETE /api/gorev-kurallari/duraklat-vardiya
 * Body: { firmaId, projeId?, ustLokasyonId, tanim, tarih, vardiya_no }
 *   veya { firmaId, projeId?, ustLokasyonId, tanim }  (tanım grubu komple sil)
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const body = await req.json()
  const { tanim, tarihler, vardiyalar, ustLokasyonId } = body
  const firmaId = body.firmaId ?? me.firma_id
  const projeId = body.projeId ?? null

  if (!tanim || !tarihler?.length || !vardiyalar?.length || !ustLokasyonId) {
    return NextResponse.json({ error: 'ustLokasyonId, tanim, tarihler ve vardiyalar zorunlu' }, { status: 400 })
  }

  const admin = createAdminClient()
  const rows = []
  for (const tarih of tarihler) {
    for (const vNo of vardiyalar) {
      rows.push({
        firma_id: firmaId,
        proje_id: projeId,
        ust_lokasyon_id: ustLokasyonId,
        tanim,
        tarih,
        vardiya_no: vNo,
        olusturan_id: me.id,
      })
    }
  }

  const { error } = await admin.from('kural_duraklatmalari').upsert(rows, {
    onConflict: 'firma_id,proje_id,ust_lokasyon_id,tanim,tarih,vardiya_no',
    ignoreDuplicates: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log — kim, ne, hangi üst lokasyon
  const { data: ustLok } = await admin.from('lokasyonlar').select('tanim').eq('id', ustLokasyonId).maybeSingle()
  await auditLog({
    tip: 'kural_duraklatma_ekle',
    tablo: 'kural_duraklatmalari',
    firma_id: firmaId,
    proje_id: projeId,
    kullanici_id: me.id,
    satir_sayisi: rows.length,
    basarili: true,
    detay: {
      ust_lokasyon_id: ustLokasyonId,
      ust_lokasyon_adi: (ustLok as any)?.tanim ?? null,
      tanim,
      tarihler,
      vardiyalar,
    },
  })

  return NextResponse.json({ ok: true, eklenen: rows.length })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json()
  const { firmaId, projeId, ustLokasyonId, tanim, tarih, vardiya_no } = body

  if (!ustLokasyonId) {
    return NextResponse.json({ error: 'ustLokasyonId zorunlu' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Silmeden ÖNCE silinecek kayıtları çek (audit_log için)
  let silinecekQ = admin.from('kural_duraklatmalari')
    .select('id,tanim,tarih,vardiya_no,olusturan_id,olusturma_tarihi')
    .eq('firma_id', firmaId)
    .eq('ust_lokasyon_id', ustLokasyonId)
  if (projeId) silinecekQ = silinecekQ.eq('proje_id', projeId)
  else silinecekQ = silinecekQ.is('proje_id', null)
  if (tanim) silinecekQ = silinecekQ.eq('tanim', tanim)
  if (tarih) silinecekQ = silinecekQ.eq('tarih', tarih)
  if (vardiya_no != null) silinecekQ = silinecekQ.eq('vardiya_no', vardiya_no)
  const { data: silinecek } = await silinecekQ

  // Üst lokasyon adını al (audit detayda görünsün)
  const { data: ustLok } = await admin.from('lokasyonlar').select('tanim').eq('id', ustLokasyonId).single()

  if (tarih && vardiya_no != null) {
    // Tek kayıt sil
    let q = admin.from('kural_duraklatmalari').delete()
      .eq('firma_id', firmaId)
      .eq('ust_lokasyon_id', ustLokasyonId)
      .eq('tanim', tanim)
      .eq('tarih', tarih)
      .eq('vardiya_no', vardiya_no)
    if (projeId) q = q.eq('proje_id', projeId)
    else q = q.is('proje_id', null)
    await q
  } else if (tanim) {
    // Tanım grubunun bu üst lokasyondaki tüm duraklatmalarını sil
    let q = admin.from('kural_duraklatmalari').delete()
      .eq('firma_id', firmaId)
      .eq('ust_lokasyon_id', ustLokasyonId)
      .eq('tanim', tanim)
    if (projeId) q = q.eq('proje_id', projeId)
    else q = q.is('proje_id', null)
    await q
  }

  // Audit log — kim, ne zaman, hangi kayıtları sildi
  if ((silinecek ?? []).length > 0) {
    await auditLog({
      tip: 'kural_duraklatma_sil',
      tablo: 'kural_duraklatmalari',
      firma_id: firmaId,
      kullanici_id: user.id,
      satir_sayisi: silinecek!.length,
      basarili: true,
      detay: {
        ust_lokasyon_id: ustLokasyonId,
        ust_lokasyon_adi: ustLok?.tanim ?? null,
        proje_id: projeId ?? null,
        tanim: tanim ?? null,
        tarih: tarih ?? null,
        vardiya_no: vardiya_no ?? null,
        silinen_kayitlar: silinecek!.map((k: any) => ({
          id: k.id, tanim: k.tanim, tarih: k.tarih, vardiya_no: k.vardiya_no,
          olusturan_id: k.olusturan_id, olusturma_tarihi: k.olusturma_tarihi,
        })),
      },
    })
  }

  return NextResponse.json({ ok: true, silinen: (silinecek ?? []).length })
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const p = req.nextUrl.searchParams
  const firmaId = p.get('firmaId')
  const projeId = p.get('projeId') || null
  const tanim = p.get('tanim')
  const ustLokasyonId = p.get('ustLokasyonId') || null

  if (!firmaId) return NextResponse.json({ data: [] })

  const admin = createAdminClient()
  // ust_lokasyon_id alanını da seç — UI hangi üst lokasyona ait olduğunu görsün
  let q = admin.from('kural_duraklatmalari')
    .select('id,firma_id,proje_id,ust_lokasyon_id,tanim,tarih,vardiya_no,olusturan_id,olusturma_tarihi')
    .eq('firma_id', firmaId)
    .gte('tarih', new Date().toISOString().slice(0, 10))
  if (projeId) q = q.eq('proje_id', projeId)
  if (tanim) q = q.eq('tanim', tanim)
  if (ustLokasyonId) q = q.eq('ust_lokasyon_id', ustLokasyonId)
  q = q.order('tarih').order('vardiya_no')

  const { data } = await q
  return NextResponse.json({ data: data ?? [] })
}
