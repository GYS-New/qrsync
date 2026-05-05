import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin.from('projeler').select('*').eq('id', params.id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // SA tüm projeleri görebilir, diğer roller sadece kendi firmasının projelerini
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (!isSA && data.firma_id !== me.firma_id) {
    return NextResponse.json({ error: 'Yetkisiz proje' }, { status: 403 })
  }

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
      ...(body.spesifik_ceklist_aktif !== undefined && { spesifik_ceklist_aktif: body.spesifik_ceklist_aktif }),
      ...(body.spesifik_personel_atama_aktif !== undefined && { spesifik_personel_atama_aktif: body.spesifik_personel_atama_aktif }),
      ...(body.frekansiyel_personel_atama_aktif !== undefined && { frekansiyel_personel_atama_aktif: body.frekansiyel_personel_atama_aktif }),
      ...(body.islem_sureleri_aktif !== undefined && { islem_sureleri_aktif: body.islem_sureleri_aktif }),
      ...(body.frekansiyel_ceklist_aktif !== undefined && { frekansiyel_ceklist_aktif: body.frekansiyel_ceklist_aktif }),
      ...(body.manuel_push_aktif !== undefined && { manuel_push_aktif: body.manuel_push_aktif }),
      ...(body.manuel_push_u_rolu !== undefined && { manuel_push_u_rolu: body.manuel_push_u_rolu }),
      ...(body.manuel_push_m_rolu !== undefined && { manuel_push_m_rolu: body.manuel_push_m_rolu }),
      ...(body.io_asistan_aktif !== undefined && { io_asistan_aktif: body.io_asistan_aktif }),
      ...(body.varsayilan_ayarlar !== undefined && { varsayilan_ayarlar: body.varsayilan_ayarlar }),
    })
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Ayar toggle değişiklikleri önemli → audit log
  const ayarAlanlari = ['spesifik_ceklist_aktif', 'spesifik_personel_atama_aktif', 'frekansiyel_personel_atama_aktif', 'islem_sureleri_aktif', 'frekansiyel_ceklist_aktif', 'manuel_push_aktif', 'manuel_push_u_rolu', 'manuel_push_m_rolu', 'personel_takibi_aktif', 'qr_sistemi_aktif', 'nfc_sistemi_aktif', 'birim_fiyat_aktif', 'io_asistan_aktif']
  const degisenAyarlar = Object.keys(body).filter(k => ayarAlanlari.includes(k))
  await auditLog({
    tip: degisenAyarlar.length > 0 ? 'ayar_degis_proje' : 'proje_guncelle',
    tablo: 'projeler',
    proje_id: params.id, firma_id: data?.firma_id ?? null,
    kullanici_id: user.id,
    detay: { proje_adi: data?.ad, degisen_alanlar: Object.keys(body), yeni_degerler: body },
  })
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
    // NOT: checklist_sonuc_basliklari tablosunda proje_id YOK — gorev_id/canli_gorev_id üzerinden
    // projeye ait tüm görevlerin id'lerini toplayarak cascade ile silmeliyiz.
    const [
      { data: spesifikAktif },
      { data: spesifikArsiv },
      { data: canliAktif },
      { data: canliArsiv },
    ] = await Promise.all([
      admin.from('gorevler').select('id').eq('proje_id', projeId),
      admin.from('gorevler_arsiv').select('id').eq('proje_id', projeId),
      admin.from('canli_gorevler').select('id').eq('proje_id', projeId),
      admin.from('canli_gorevler_arsiv').select('id').eq('proje_id', projeId),
    ])
    const spesifikIds = [
      ...(spesifikAktif ?? []).map((r: any) => r.id),
      ...(spesifikArsiv ?? []).map((r: any) => r.id),
    ]
    const canliIds = [
      ...(canliAktif ?? []).map((r: any) => r.id),
      ...(canliArsiv ?? []).map((r: any) => r.id),
    ]

    // Bu görev id'lerine bağlı çeklist başlıklarını topla (aktif + arşiv)
    async function baslikIds(tbl: 'checklist_sonuc_basliklari' | 'checklist_sonuc_basliklari_arsiv'): Promise<string[]> {
      const out: string[] = []
      if (spesifikIds.length > 0) {
        const { data } = await admin.from(tbl).select('id').in('gorev_id', spesifikIds)
        out.push(...(data ?? []).map((r: any) => r.id))
      }
      if (canliIds.length > 0) {
        const { data } = await admin.from(tbl).select('id').in('canli_gorev_id', canliIds)
        out.push(...(data ?? []).map((r: any) => r.id))
      }
      return out
    }

    const aktifBaslikIds = await baslikIds('checklist_sonuc_basliklari')
    const arsivBaslikIds = await baslikIds('checklist_sonuc_basliklari_arsiv')

    if (aktifBaslikIds.length > 0) {
      await admin.from('checklist_sonuc_maddeleri').delete().in('sonuc_id', aktifBaslikIds)
      await admin.from('checklist_sonuc_basliklari').delete().in('id', aktifBaslikIds)
    }
    if (arsivBaslikIds.length > 0) {
      await admin.from('checklist_sonuc_maddeleri_arsiv').delete().in('sonuc_id', arsivBaslikIds)
      await admin.from('checklist_sonuc_basliklari_arsiv').delete().in('id', arsivBaslikIds)
    }

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
    const { data: projeBilgi } = await admin.from('projeler').select('ad,firma_id').eq('id', projeId).single()
    const { error } = await admin.from('projeler').delete().eq('id', projeId)
    if (error) {
      await auditLog({
        tip: 'proje_sil', tablo: 'projeler', basarili: false, hata_mesaji: error.message,
        proje_id: projeId, firma_id: projeBilgi?.firma_id ?? null, kullanici_id: user.id,
        detay: { proje_adi: projeBilgi?.ad },
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await auditLog({
      tip: 'proje_sil', tablo: 'projeler',
      proje_id: projeId, firma_id: projeBilgi?.firma_id ?? null, kullanici_id: user.id,
      detay: {
        proje_adi: projeBilgi?.ad,
        silinen_personel: personelIds.length,
        uyarı: 'CASCADE silme — tüm görevler, çeklistler, lokasyonlar vs. silindi',
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[proje-sil]', err)
    await auditLog({
      tip: 'proje_sil', tablo: 'projeler', basarili: false,
      hata_mesaji: err?.message ?? 'Silme hatası',
      proje_id: params.id, kullanici_id: user.id,
    })
    return NextResponse.json({ error: err?.message ?? 'Silme işlemi başarısız.' }, { status: 500 })
  }
}
