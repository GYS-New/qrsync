/**
 * GET /api/mesai/kontrol?user_id=...&firma_id=...&proje_id=...
 *
 * Client-side görev atama formları bu endpoint'i çağırarak
 * seçilen personelin iş başı yapıp yapmadığını sorgular.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const p       = new URL(req.url).searchParams
  const userId  = p.get('user_id')
  const firmaId = p.get('firma_id')

  if (!userId || !firmaId) {
    return NextResponse.json({ ok: false, error: 'user_id ve firma_id gerekli' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Personel takibi aktif mi?
  let personelTakibiAktif = false
  const { data: firma } = await admin.from('firmalar').select('personel_takibi_aktif').eq('id', firmaId).single()
  if (firma?.personel_takibi_aktif === true) personelTakibiAktif = true
  if (!personelTakibiAktif) {
    const { data: projeler } = await admin.from('projeler').select('personel_takibi_aktif').eq('firma_id', firmaId).eq('aktif', true)
    if ((projeler ?? []).some((pr: any) => pr.personel_takibi_aktif === true)) personelTakibiAktif = true
  }

  if (!personelTakibiAktif) {
    return NextResponse.json({ ok: true, atanabilir: true })
  }

  // Bugün mesai kaydı var mı?
  const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: mesai } = await admin
    .from('personel_mesai_kayitlari')
    .select('id')
    .eq('user_id', userId)
    .eq('kayit_tarihi', bugun)
    .is('cikis_saati', null)
    .maybeSingle()

  if (!mesai) {
    return NextResponse.json({ ok: true, atanabilir: false, neden: 'Bu personel bugün iş başı yapmamış.' })
  }

  return NextResponse.json({ ok: true, atanabilir: true })
}
