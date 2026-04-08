/**
 * GET /api/simulasyon/personeller/mesai-durum?firma_id=...&proje_id=...
 * Personel takibi aktif mi + bugün mesaili personel id'leri döner.
 * Admin client kullanır — RLS sorunlarını bypass eder.
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

  // Personel takibi aktif mi? (firma + proje + tüm projeler)
  let personelTakibiAktif = false

  const { data: firma } = await admin.from('firmalar').select('personel_takibi_aktif').eq('id', firmaId).single()
  if (firma?.personel_takibi_aktif === true) personelTakibiAktif = true

  if (!personelTakibiAktif && projeId) {
    const { data: proje } = await admin.from('projeler').select('personel_takibi_aktif').eq('id', projeId).single()
    if (proje?.personel_takibi_aktif === true) personelTakibiAktif = true
  }

  if (!personelTakibiAktif) {
    const { data: projeler } = await admin.from('projeler').select('personel_takibi_aktif').eq('firma_id', firmaId).eq('aktif', true)
    if ((projeler ?? []).some((pr: any) => pr.personel_takibi_aktif === true)) personelTakibiAktif = true
  }

  if (!personelTakibiAktif) {
    return NextResponse.json({ ok: true, personel_takibi_aktif: false, mesaili_ids: [] })
  }

  // Bugün mesaili personel id'leri
  const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: mesailar } = await admin
    .from('personel_mesai_kayitlari')
    .select('user_id')
    .eq('firma_id', firmaId)
    .eq('kayit_tarihi', bugun)
    .is('cikis_saati', null)

  const mesailiIds = (mesailar ?? []).map((m: any) => m.user_id)

  return NextResponse.json({ ok: true, personel_takibi_aktif: true, mesaili_ids: mesailiIds })
}
