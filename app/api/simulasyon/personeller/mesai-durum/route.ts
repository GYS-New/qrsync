/**
 * GET /api/simulasyon/personeller/mesai-durum?firma_id=...&proje_id=...
 * Personel takibi aktif mi + bugün mesaili personel id'leri döner.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const p = new URL(req.url).searchParams
  const firmaId = p.get('firma_id')
  const projeId = p.get('proje_id')

  if (!firmaId) return NextResponse.json({ ok: true, personel_takibi_aktif: false, mesaili_ids: [] })

  const admin = createAdminClient()

  // Personel takibi: önce proje ayarına bak, yoksa firma ayarına
  let personelTakibiAktif = false
  if (projeId) {
    const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', projeId).single()
    personelTakibiAktif = proje?.personel_takibi_aktif === true
  } else {
    const { data: firma } = await admin.from('firmalar').select('personel_takibi_aktif').eq('id', firmaId).single()
    personelTakibiAktif = firma?.personel_takibi_aktif === true
  }

  if (!personelTakibiAktif) {
    return NextResponse.json({ ok: true, personel_takibi_aktif: false, mesaili_ids: [] })
  }

  const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: mesailar } = await admin
    .from('personel_mesai_kayitlari')
    .select('user_id')
    .eq('firma_id', firmaId)
    .eq('kayit_tarihi', bugun)
    .is('cikis_saati', null)

  return NextResponse.json({ ok: true, personel_takibi_aktif: true, mesaili_ids: (mesailar ?? []).map((m: any) => m.user_id) })
}
