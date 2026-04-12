import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/mesai/arsiv?firma_id=...&proje_id=...&baslangic=...&bitis=...
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ ok: false, error: 'Yetki yetersiz' }, { status: 403 })

  const p       = new URL(req.url).searchParams
  const firmaId = isSA ? p.get('firma_id') : me.firma_id
  const projeId = p.get('proje_id') ?? null
  const bas     = p.get('baslangic')
  const bit     = p.get('bitis')
  const page    = Math.max(1, parseInt(p.get('page') ?? '1'))
  const limit   = Math.min(100, Math.max(10, parseInt(p.get('limit') ?? '50')))

  if (!firmaId) return NextResponse.json({ ok: true, data: [], total: 0 })

  const sel = 'id, user_id, firma_id, proje_id, kayit_tarihi, giris_saati, cikis_saati, giris_tipi, cikis_tipi, arsivleme_tarihi, isim_soyisim, email'

  // Count
  let countQ = admin.from('personel_mesai_kayitlari_arsiv_detay')
    .select('id', { count: 'exact', head: true }).eq('firma_id', firmaId)
  if (projeId) countQ = (countQ as any).eq('proje_id', projeId)
  if (bas)     countQ = (countQ as any).gte('kayit_tarihi', bas)
  if (bit)     countQ = (countQ as any).lte('kayit_tarihi', bit)
  const { count: total } = await countQ

  // Data
  const offset = (page - 1) * limit
  let q = admin.from('personel_mesai_kayitlari_arsiv_detay')
    .select(sel).eq('firma_id', firmaId)
    .order('kayit_tarihi', { ascending: false })
    .range(offset, offset + limit - 1)
  if (projeId) q = (q as any).eq('proje_id', projeId)
  if (bas)     q = (q as any).gte('kayit_tarihi', bas)
  if (bit)     q = (q as any).lte('kayit_tarihi', bit)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const liste = (data ?? []).map((r: any) => ({
    id: r.id, user_id: r.user_id,
    isim_soyisim: r.isim_soyisim ?? '—', email: r.email ?? '—',
    kayit_tarihi: r.kayit_tarihi, giris_saati: r.giris_saati,
    cikis_saati: r.cikis_saati, giris_tipi: r.giris_tipi,
    cikis_tipi: r.cikis_tipi, arsivleme_tarihi: r.arsivleme_tarihi,
  }))

  return NextResponse.json({ ok: true, data: liste, total: total ?? 0 })
}
