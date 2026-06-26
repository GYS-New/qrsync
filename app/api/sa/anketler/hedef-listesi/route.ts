/**
 * GET /api/sa/anketler/hedef-listesi
 *
 * Anket oluşturma formundaki hedef seçim için firma + kullanıcı listesi döner.
 * Her firmada aktif personel sayısı + her kullanıcı için firma_adi.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  const isSA = me?.rol === 'super_admin' || me?.rol === 'alt_super_admin'
  if (!isSA) return NextResponse.json({ error: 'Sadece SA' }, { status: 403 })

  const admin = createAdminClient()
  const [{ data: firmalar }, { data: projeler }, { data: users }] = await Promise.all([
    admin.from('firmalar').select('id,firma_adi').eq('aktif', true).order('firma_adi'),
    admin.from('projeler').select('id,firma_id,ad').eq('aktif', true).order('ad'),
    admin.from('users').select('id,isim_soyisim,firma_id,proje_id,rol').eq('aktif', true).order('isim_soyisim'),
  ])

  const firmaPersonelSayi = new Map<string, number>()
  for (const u of users ?? []) {
    const fid = (u as any).firma_id
    if (fid) firmaPersonelSayi.set(fid, (firmaPersonelSayi.get(fid) ?? 0) + 1)
  }
  const firmaAdMap = new Map((firmalar ?? []).map((f: any) => [f.id, f.firma_adi]))
  const projeAdMap = new Map((projeler ?? []).map((p: any) => [p.id, p.ad]))

  return NextResponse.json({
    ok: true,
    firmalar: (firmalar ?? []).map((f: any) => ({
      id: f.id, firma_adi: f.firma_adi, personel_sayisi: firmaPersonelSayi.get(f.id) ?? 0,
    })),
    projeler: (projeler ?? []).map((p: any) => ({
      id: p.id, ad: p.ad, firma_id: p.firma_id,
    })),
    users: (users ?? []).map((u: any) => ({
      id: u.id, isim_soyisim: u.isim_soyisim,
      firma_id: u.firma_id,
      firma_adi: firmaAdMap.get(u.firma_id) ?? '—',
      proje_id: u.proje_id ?? null,
      proje_adi: u.proje_id ? (projeAdMap.get(u.proje_id) ?? null) : null,
      rol: u.rol,
    })),
  })
}
