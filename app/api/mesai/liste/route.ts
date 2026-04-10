import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getLokasyonYetki } from '@/lib/yetki/getLokasyonYetki'

/**
 * GET /api/mesai/liste?firma_id=...&proje_id=...&baslangic=...&bitis=...
 *
 * Hem aktif (arşivlenmemiş) hem arşivlenmiş kayıtları döner.
 * Tarih aralığı filtreleri kayit_tarihi alanına uygulanır.
 * Sonuçlar tarih ve giriş saatine göre azalan sırayla döner.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA           = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA           = me.rol === 'tenant_admin'
  const isTenantViewer = me.rol === 'musteri' || me.rol === 'tenant_user'
  if (!isSA && !isTA && !isTenantViewer) {
    return NextResponse.json({ ok: false, error: 'Yetki yetersiz' }, { status: 403 })
  }

  const p       = new URL(req.url).searchParams
  const firmaId = isSA ? p.get('firma_id') : me.firma_id
  const projeId = p.get('proje_id') ?? null
  const bas     = p.get('baslangic')
  const bit     = p.get('bitis')

  if (!firmaId) return NextResponse.json({ ok: true, data: [] })

  // U/M lokasyon kısıtlaması: yetkili üst lokasyondaki kullanıcı ID'leri
  const yetkiliUstLokIds = isTenantViewer ? await getLokasyonYetki(supabase) : null
  let yetkiliUserIds: string[] | null = null
  if (yetkiliUstLokIds) {
    const { data: uyeler } = await admin.from('users').select('id').eq('firma_id', firmaId).in('ust_lokasyon_id', yetkiliUstLokIds)
    yetkiliUserIds = (uyeler ?? []).map((u: any) => u.id)
  }

  let q = admin
    .from('personel_mesai_kayitlari')
    .select(`
      id, user_id, firma_id, proje_id, kayit_tarihi,
      giris_saati, cikis_saati, giris_tipi, cikis_tipi, arsivlendi,
      users!user_id(isim_soyisim, email, rol, ust_lokasyon_id)
    `)
    .eq('firma_id', firmaId)
    .order('kayit_tarihi', { ascending: false })
    .order('giris_saati', { ascending: false })
    .limit(500)

  if (projeId) q = (q as any).eq('proje_id', projeId)
  if (bas)     q = (q as any).gte('kayit_tarihi', bas)
  if (bit)     q = (q as any).lte('kayit_tarihi', bit)
  if (yetkiliUserIds) q = q.in('user_id', yetkiliUserIds)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const liste = (data ?? []).map((r: any) => ({
    id:           r.id,
    user_id:      r.user_id,
    isim_soyisim: (r.users as any)?.isim_soyisim ?? '—',
    email:        (r.users as any)?.email ?? '—',
    rol:          (r.users as any)?.rol ?? '',
    kayit_tarihi: r.kayit_tarihi,
    giris_saati:  r.giris_saati,
    cikis_saati:  r.cikis_saati,
    giris_tipi:   r.giris_tipi,
    cikis_tipi:   r.cikis_tipi,
    aktif:        r.cikis_saati === null,
    arsivlendi:   r.arsivlendi,
    ust_lokasyon_id: (r.users as any)?.ust_lokasyon_id ?? null,
  }))

  // Üst lokasyon ad map'i
  const lokIds = [...new Set(liste.map((r: any) => r.ust_lokasyon_id).filter(Boolean))]
  const lokMap: Record<string, string> = {}
  if (lokIds.length > 0) {
    const { data: loks } = await admin.from('lokasyonlar').select('id,tanim').in('id', lokIds)
    for (const l of loks ?? []) lokMap[l.id] = l.tanim ?? ''
  }

  return NextResponse.json({ ok: true, data: liste, lokMap })
}
