import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

async function authorize(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Yetkisiz', status: 401 }
  const { data: me } = await supabase
    .from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['tenant_admin', 'super_admin', 'alt_super_admin'].includes(me.rol)) {
    return { error: 'Yetki yetersiz', status: 403 }
  }
  return { user, me, supabase }
}

// ── PATCH: Kuralı güncelle (aktif/pasif dahil) ───────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authorize(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { user, me } = auth

  const body = await req.json()
  const admin = createAdminClient()

  // Kuralın firmaya ait olduğunu doğrula
  const { data: kural } = await admin
    .from('gorev_kurallari').select('firma_id').eq('id', params.id).single()
  if (!kural) return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 })
  if (me.rol === 'tenant_admin' && kural.firma_id !== me.firma_id) {
    return NextResponse.json({ error: 'Bu kural size ait değil' }, { status: 403 })
  }

  // İzin verilen güncelleme alanları
  const allowed = [
    'tanim', 'aktif_gunler', 'gunluk_frekans_sayisi', 'haftalik_frekans_sayisi',
    'frekans_tipi', 'aktif_olma_saati',
    'baslangic_tarihi', 'bitis_tarihi', 'atanan_kullanici_id', 'aktif',
  ]
  const update: Record<string, any> = { guncelleme_tarihi: new Date().toISOString() }
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  // frekans_tipi geçişinde diğer frekans kolonunu null yap (CHECK constraint)
  if (body.frekans_tipi === 'gunluk') update.haftalik_frekans_sayisi = null
  if (body.frekans_tipi === 'haftalik') update.gunluk_frekans_sayisi = null

  const { data, error } = await admin
    .from('gorev_kurallari').update(update).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditLog({
    tip: 'kural_guncelle', tablo: 'gorev_kurallari',
    kullanici_id: user.id, firma_id: kural.firma_id,
    detay: { kural_id: params.id, degisen_alanlar: Object.keys(update), yeni_degerler: update },
  })
  return NextResponse.json(data)
}

// ── DELETE: Kuralı sil (gelecek görevler üretilmez, mevcut görevler kalır) ─
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await authorize(req)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { me } = auth

  const admin = createAdminClient()
  const { data: kural } = await admin
    .from('gorev_kurallari').select('firma_id,tanim').eq('id', params.id).single()
  if (!kural) return NextResponse.json({ error: 'Kural bulunamadı' }, { status: 404 })
  if (me.rol === 'tenant_admin' && kural.firma_id !== me.firma_id) {
    return NextResponse.json({ error: 'Bu kural size ait değil' }, { status: 403 })
  }

  const { error } = await admin.from('gorev_kurallari').delete().eq('id', params.id)
  if (error) {
    await auditLog({
      tip: 'kural_sil', tablo: 'gorev_kurallari', basarili: false, hata_mesaji: error.message,
      kullanici_id: auth.user.id, firma_id: kural.firma_id,
      detay: { kural_id: params.id, tanim: kural.tanim },
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await auditLog({
    tip: 'kural_sil', tablo: 'gorev_kurallari',
    kullanici_id: auth.user.id, firma_id: kural.firma_id,
    detay: { kural_id: params.id, tanim: kural.tanim },
  })
  return NextResponse.json({ ok: true, tanim: kural.tanim })
}
