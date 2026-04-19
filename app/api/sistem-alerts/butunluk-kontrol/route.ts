import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sistem-alerts/butunluk-kontrol
 * SA manuel tetikleme — veri bütünlük kontrolünü anında çalıştırır.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: bulgular, error } = await admin.rpc('veri_butunluk_kontrol_tam')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const toplam = (bulgular ?? []).reduce((s: number, b: any) => s + Number(b.sayi ?? 0), 0)
  const kategoriSayisi = (bulgular ?? []).length

  await admin.from('audit_log').insert({
    tip: 'manuel_butunluk_kontrol', tablo: 'coklu',
    satir_sayisi: toplam, basarili: true, kullanici_id: user.id,
    detay: { kategoriler: bulgular, toplam_sayi: toplam, kategori_sayisi: kategoriSayisi },
  })

  return NextResponse.json({ ok: true, toplam, kategori_sayisi: kategoriSayisi, bulgular: bulgular ?? [] })
}
