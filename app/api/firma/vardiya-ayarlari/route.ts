/**
 * GET /api/firma/vardiya-ayarlari?firma_id=...&proje_id=...
 *
 * Vardiya bilgisini döner. UI vardiya filtrelerinin dinamik label üretmesi +
 * API'lerin sarkan vardiya hesabı için ortak helper.
 *
 * proje_id verilirse → proje override > firma fallback (mig 094). Çağıran
 * projeyi geçmezse legacy davranış: sadece firma değeri döner.
 *
 * SA: query firma_id şart. TA/U/M: kendi firma_id'sine zorla.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getEffectiveVardiya } from '@/lib/vardiya/getEffective'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const sp = req.nextUrl.searchParams
  const firmaIdReq = sp.get('firma_id')
  const firmaId = isSA ? firmaIdReq : me.firma_id
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!isSA && firmaIdReq && firmaIdReq !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }
  const projeId = sp.get('proje_id') || null

  const admin = createAdminClient()
  const ev = await getEffectiveVardiya(admin, firmaId, projeId)
  const vardiyaSayisi = ev.vardiya_sayisi ?? 0
  const tumAyarlar = ev.tum_vardiya_ayarlari ?? {}
  const vardiyalar: { no: number; baslangic: string; bitis: string }[] = (() => {
    const key = String(vardiyaSayisi)
    const raw = (tumAyarlar?.[key] ?? ev.vardiya_saatleri ?? []) as any[]
    return raw
      .filter(v => v && v.baslangic && v.bitis)
      .map((v: any) => ({ no: Number(v.no), baslangic: String(v.baslangic), bitis: String(v.bitis) }))
      .sort((a, b) => a.no - b.no)
  })()

  return NextResponse.json({ ok: true, vardiya_sayisi: vardiyaSayisi, vardiyalar, kaynak: ev.kaynak })
}
