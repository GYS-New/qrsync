import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

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
    'tanim', 'aktif_gunler', 'gunluk_frekans_sayisi', 'aktif_olma_saati',
    'baslangic_tarihi', 'bitis_tarihi', 'atanan_kullanici_id', 'aktif',
  ]
  const update: Record<string, any> = { guncelleme_tarihi: new Date().toISOString() }
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  const { data, error } = await admin
    .from('gorev_kurallari').update(update).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tanim: kural.tanim })
}
