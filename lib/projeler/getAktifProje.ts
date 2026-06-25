import { cookies } from 'next/headers'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const PROJE_COOKIE = 'qrsync_aktif_proje_id'

export type AktifProje = {
  id: string
  ad: string
  aciklama?: string | null
  renk?: string
  birim_fiyat_aktif?: boolean
}

/**
 * Server component'lerde aktif projeyi belirler. Öncelik sırası:
 *   1) Cookie (qrsync_aktif_proje_id) — SA/TA gibi proje seçici UI'sı olan
 *      roller için seçim kalıcılığı
 *   2) Kullanıcının users.proje_id kolonu — M / U rolleri tek bir projeye
 *      atanmış olur, cookie yoksa kendi projeleri dikkate alınır
 *   3) Firmanın ilk aktif projesi (kayit_tarihi ASC) — son çare fallback
 *
 * 2026-06-25: M/U rolünde cookie genelde boş olduğu için fallback firmanın
 * ilk projesine (ATALIAN için OYAK RENAULT) düşüyordu — Çanakkale müşterisi
 * Renault verisini görüyordu. users.proje_id öncelikli step eklendi.
 *
 * firmaId ile doğrulanır — başka firmanın projesini döndürmez.
 */
export async function getAktifProje(firmaId: string | null): Promise<AktifProje | null> {
  if (!firmaId) return null

  const admin = createAdminClient()
  const cookieStore = cookies()
  const projeId = cookieStore.get(PROJE_COOKIE)?.value

  // Önce session'dan kullanıcı + rolü oku — TA için cookie izinli proje
  // setinden olmalı (mig 098 junction kontrol).
  let userId: string | null = null
  let userRol: string | null = null
  let userProjeId: string | null = null
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      userId = user.id
      const { data: me } = await admin
        .from('users').select('rol, proje_id').eq('id', user.id).maybeSingle()
      userRol = (me as any)?.rol ?? null
      userProjeId = (me as any)?.proje_id ?? null
    }
  } catch { /* sessiz */ }

  // TA için izinli proje seti — cookie ve fallback bu set içinden olmalı
  const isTA = userRol === 'tenant_admin'
  let taIzinliSet: Set<string> | null = null
  if (isTA && userId) {
    const { data: izinliRows } = await admin
      .from('tenant_admin_projeler').select('proje_id').eq('user_id', userId)
    taIzinliSet = new Set((izinliRows ?? []).map((r: any) => r.proje_id))
  }

  // 1) Cookie'deki proje hâlâ aktif, doğru firmaya ait + TA için izinli mi
  if (projeId) {
    if (!isTA || taIzinliSet?.has(projeId)) {
      const { data } = await admin
        .from('projeler')
        .select('id,ad,aciklama,renk,birim_fiyat_aktif')
        .eq('id', projeId)
        .eq('firma_id', firmaId)
        .eq('aktif', true)
        .maybeSingle()
      if (data) return data as AktifProje
    }
  }

  // 2) M/U: users.proje_id direkt fallback. TA: junction ilk proje fallback.
  if (userProjeId && (!isTA || taIzinliSet?.has(userProjeId))) {
    const { data } = await admin
      .from('projeler')
      .select('id,ad,aciklama,renk,birim_fiyat_aktif')
      .eq('id', userProjeId)
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .maybeSingle()
    if (data) return data as AktifProje
  }
  // TA için users.proje_id geçersizse junction'daki ilk projeyi dene
  if (isTA && taIzinliSet && taIzinliSet.size > 0) {
    const { data } = await admin
      .from('projeler')
      .select('id,ad,aciklama,renk,birim_fiyat_aktif')
      .in('id', Array.from(taIzinliSet))
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .order('kayit_tarihi', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (data) return data as AktifProje
  }

  // 3) Son çare: firmanın ilk aktif projesi (SA ve edge-case için)
  // TA buraya düşmesin diye yukarıda junction kontrolü var; eğer junction boşsa
  // TA hiçbir proje seçemez (sayfada ProjeSecilmedi gösterilir).
  if (isTA) return null

  const { data: ilkAktif } = await admin
    .from('projeler')
    .select('id,ad,aciklama,renk,birim_fiyat_aktif')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('kayit_tarihi', { ascending: true })
    .limit(1)
    .maybeSingle()

  return (ilkAktif as AktifProje | null) ?? null
}
