import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('projeler').select('*').eq('id', params.id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['tenant_admin', 'super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const body = await req.json()
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('projeler')
    .update({
      ...(body.ad !== undefined && { ad: body.ad.trim() }),
      ...(body.aciklama !== undefined && { aciklama: body.aciklama?.trim() || null }),
      ...(body.renk !== undefined && { renk: body.renk }),
      ...(body.aktif !== undefined && { aktif: body.aktif }),
      ...(body.personel_takibi_aktif !== undefined && { personel_takibi_aktif: body.personel_takibi_aktif }),
      ...(body.qr_sistemi_aktif  !== undefined && { qr_sistemi_aktif:  body.qr_sistemi_aktif }),
      ...(body.nfc_sistemi_aktif  !== undefined && { nfc_sistemi_aktif:  body.nfc_sistemi_aktif }),
      ...(body.birim_fiyat_aktif !== undefined && { birim_fiyat_aktif: body.birim_fiyat_aktif }),
      ...(body.varsayilan_ayarlar !== undefined && { varsayilan_ayarlar: body.varsayilan_ayarlar }),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['tenant_admin', 'super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const admin = createAdminClient()
  const projeId = params.id

  try {
    // 1. Lokasyon grupları → önce grup üyelerini ve birim fiyatları sil
    const { data: gruplar } = await admin.from('lokasyon_gruplari').select('id').eq('proje_id', projeId)
    const grupIds = (gruplar ?? []).map((g: any) => g.id)
    if (grupIds.length > 0) {
      await Promise.all([
        admin.from('lokasyon_grup_uyeleri').delete().in('grup_id', grupIds),
        admin.from('birim_fiyatlar').delete().eq('proje_id', projeId),
      ])
    }
    await admin.from('lokasyon_gruplari').delete().eq('proje_id', projeId)

    // 2. Checklist sonuç başlıkları → önce maddeleri sil (aktif + arşiv)
    const [{ data: cBasliklari }, { data: cBasliklariArsiv }] = await Promise.all([
      admin.from('checklist_sonuc_basliklari').select('id').eq('proje_id', projeId),
      admin.from('checklist_sonuc_basliklari_arsiv').select('id').eq('proje_id', projeId),
    ])
    const cIds      = (cBasliklari ?? []).map((r: any) => r.id)
    const cIdsArsiv = (cBasliklariArsiv ?? []).map((r: any) => r.id)
    if (cIds.length > 0)
      await admin.from('checklist_sonuc_maddeleri').delete().in('sonuc_id', cIds)
    if (cIdsArsiv.length > 0)
      await admin.from('checklist_sonuc_maddeleri_arsiv').delete().in('sonuc_id', cIdsArsiv)
    await Promise.all([
      admin.from('checklist_sonuc_basliklari').delete().eq('proje_id', projeId),
      admin.from('checklist_sonuc_basliklari_arsiv').delete().eq('proje_id', projeId),
    ])

    // 3. Görevler (aktif + arşiv) — frekansiyel ve spesifik
    await Promise.all([
      admin.from('gorevler').delete().eq('proje_id', projeId),
      admin.from('gorevler_arsiv').delete().eq('proje_id', projeId),
      admin.from('canli_gorevler').delete().eq('proje_id', projeId),
      admin.from('canli_gorevler_arsiv').delete().eq('proje_id', projeId),
      admin.from('gorev_kurallari').delete().eq('proje_id', projeId),
    ])

    // 4. Diğer proje verileri
    await Promise.all([
      admin.from('musteri_degerlendirmeleri').delete().eq('proje_id', projeId),
      admin.from('musteri_degerlendirmeleri_arsiv').delete().eq('proje_id', projeId),
      admin.from('personel_mesai_kayitlari').delete().eq('proje_id', projeId),
      admin.from('personel_mesai_kayitlari_arsiv').delete().eq('proje_id', projeId),
    ])

    // 5. Lokasyonlar
    await admin.from('lokasyonlar').delete().eq('proje_id', projeId)

    // 6. Projeye ait personelleri kalıcı sil (auth + users tablosu)
    const { data: projePersonel } = await admin.from('users').select('id').eq('proje_id', projeId)
    const personelIds = (projePersonel ?? []).map((u: any) => u.id)
    if (personelIds.length > 0) {
      await admin.from('users').delete().in('id', personelIds)
      // Supabase Auth kayıtlarını da sil
      await Promise.all(personelIds.map((uid: string) => admin.auth.admin.deleteUser(uid)))
    }

    // 7. Projeyi sil
    const { error } = await admin.from('projeler').delete().eq('id', projeId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[proje-sil]', err)
    return NextResponse.json({ error: err?.message ?? 'Silme işlemi başarısız.' }, { status: 500 })
  }
}
