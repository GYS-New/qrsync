import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const ustLokasyonId = body.ust_lokasyon_id ?? null

  const admin = createAdminClient()

  // Yeni ust_lokasyon Oto Yıkama'ya ait mi? (null ise değil)
  let yeniOtoYikama = false
  if (ustLokasyonId) {
    const { data: yeniLok } = await admin
      .from('lokasyonlar')
      .select('oto_yikama_lokasyon')
      .eq('id', ustLokasyonId)
      .maybeSingle()
    yeniOtoYikama = yeniLok?.oto_yikama_lokasyon === true
  }

  const { error } = await admin.from('users').update({ ust_lokasyon_id: ustLokasyonId }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Modül izolasyonu senkron temizlik:
  // Yeni ust_lokasyon Oto Yıkama DEĞİL ise (veya null), kullanici_lokasyon_yetkileri
  // tablosundan bu kullanıcıya ait Oto Yıkama üst lokasyon atamalarını sil.
  // (Aksi halde yetki resolver iki kaynağı OR'lar ve mobil app kullanıcıyı hala
  //  Oto Yıkama'da yetkili görür — modül değişikliği etkisiz kalır.)
  let temizlenenSayisi = 0
  if (!yeniOtoYikama) {
    const { data: otoLoks } = await admin
      .from('lokasyonlar')
      .select('id')
      .eq('oto_yikama_lokasyon', true)
    const otoLokIds = (otoLoks ?? []).map((l: any) => l.id)
    if (otoLokIds.length > 0) {
      const { data: silinen, error: silErr } = await admin
        .from('kullanici_lokasyon_yetkileri')
        .delete()
        .eq('user_id', params.id)
        .in('ust_lokasyon_id', otoLokIds)
        .select('ust_lokasyon_id')
      if (!silErr) temizlenenSayisi = silinen?.length ?? 0
    }
  }

  return NextResponse.json({ ok: true, oto_yikama_yetkisi_temizlenen: temizlenenSayisi })
}
