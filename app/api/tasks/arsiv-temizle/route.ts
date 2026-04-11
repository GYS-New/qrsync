/**
 * POST /api/tasks/arsiv-temizle
 * Girilen tarihten önceki tüm arşiv kayıtlarını kalıcı olarak siler.
 * Sadece SA ve TA kullanabilir.
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ error: 'Yetki yetersiz' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { firmaId, tarihOncesi } = body

  if (!tarihOncesi) return NextResponse.json({ error: 'tarihOncesi gerekli' }, { status: 400 })

  const effectiveFirmaId = isSA ? (firmaId ?? me.firma_id) : me.firma_id
  if (!effectiveFirmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

  // TA sadece kendi firmasını temizleyebilir
  if (isTA && firmaId && firmaId !== me.firma_id) {
    return NextResponse.json({ error: 'Yetkisiz firma' }, { status: 403 })
  }

  const admin = createAdminClient()
  const cutoff = `${tarihOncesi}T00:00:00+03:00`
  let toplam = 0

  // 1. Frekansiyel görev arşivi
  const { count: c1 } = await admin
    .from('canli_gorevler_arsiv')
    .delete({ count: 'exact' })
    .eq('firma_id', effectiveFirmaId)
    .lt('aktif_olma_tarihi', cutoff)
  toplam += c1 ?? 0

  // 2. Spesifik görev arşivi
  const { count: c2 } = await admin
    .from('gorevler_arsiv')
    .delete({ count: 'exact' })
    .eq('firma_id', effectiveFirmaId)
    .lt('olusturma_tarihi', cutoff)
  toplam += c2 ?? 0

  // 3. Mesai arşivi
  const { count: c3 } = await admin
    .from('personel_mesai_kayitlari_arsiv')
    .delete({ count: 'exact' })
    .eq('firma_id', effectiveFirmaId)
    .lt('kayit_tarihi', tarihOncesi)
  toplam += c3 ?? 0

  // 4. Müşteri değerlendirme arşivi
  const { count: c4 } = await admin
    .from('musteri_degerlendirmeleri_arsiv')
    .delete({ count: 'exact' })
    .eq('firma_id', effectiveFirmaId)
    .lt('olusturma_tarihi', cutoff)
  toplam += c4 ?? 0

  // 5. Çeklist arşivi (başlık + maddeler)
  const { data: basliklar } = await admin
    .from('checklist_sonuc_basliklari_arsiv')
    .select('id')
    .lt('kayit_tarihi', cutoff)
  if (basliklar?.length) {
    const bIds = basliklar.map(b => b.id)
    await admin.from('checklist_sonuc_maddeleri_arsiv').delete().in('sonuc_id', bIds)
    const { count: c5 } = await admin
      .from('checklist_sonuc_basliklari_arsiv')
      .delete({ count: 'exact' })
      .in('id', bIds)
    toplam += c5 ?? 0
  }

  return NextResponse.json({ ok: true, silinen: toplam, tarihOncesi })
}
