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

  // 1) Cookie'deki proje hâlâ aktif ve doğru firmaya aitse onu kullan
  if (projeId) {
    const { data } = await admin
      .from('projeler')
      .select('id,ad,aciklama,renk,birim_fiyat_aktif')
      .eq('id', projeId)
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .maybeSingle()
    if (data) return data as AktifProje
  }

  // 2) Kullanıcının kendi proje_id'si (M / U rolleri için kritik)
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: me } = await admin
        .from('users')
        .select('proje_id')
        .eq('id', user.id)
        .maybeSingle()
      const userProjeId = (me as any)?.proje_id
      if (userProjeId) {
        const { data } = await admin
          .from('projeler')
          .select('id,ad,aciklama,renk,birim_fiyat_aktif')
          .eq('id', userProjeId)
          .eq('firma_id', firmaId)
          .eq('aktif', true)
          .maybeSingle()
        if (data) return data as AktifProje
      }
    }
  } catch {
    // session okunamadıysa sessizce fallback'e geç
  }

  // 3) Son çare: firmanın ilk aktif projesi (kayit_tarihi ASC)
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
